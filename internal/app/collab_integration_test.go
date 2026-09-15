package app

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// These tests run the whole HTTP surface (httptest server) and speak the
// exact wire protocol a browser uses: one SSE stream per peer plus JSON
// POSTs. They simulate two designers in the same room — the "work
// together" flow end to end.

type sseClient struct {
	t    *testing.T
	resp *http.Response
	r    *bufio.Reader
}

func sseConnect(t *testing.T, url string) *sseClient {
	t.Helper()
	resp, err := http.Get(url)
	if err != nil {
		t.Fatalf("SSE connect %s: %v", url, err)
	}
	if resp.StatusCode != 200 {
		t.Fatalf("SSE connect %s: status %d", url, resp.StatusCode)
	}
	return &sseClient{t: t, resp: resp, r: bufio.NewReader(resp.Body)}
}

func (c *sseClient) close() { _ = c.resp.Body.Close() }

// next reads one SSE frame, skipping keep-alive comment lines.
func (c *sseClient) next(timeout time.Duration) (name, data string, err error) {
	type frame struct {
		name, data string
		err        error
	}
	ch := make(chan frame, 1)
	go func() {
		var ev, dt string
		for {
			line, rerr := c.r.ReadString('\n')
			if rerr != nil {
				ch <- frame{err: rerr}
				return
			}
			line = strings.TrimRight(line, "\r\n")
			switch {
			case line == "":
				if dt != "" {
					ch <- frame{name: ev, data: dt}
					return
				}
				ev, dt = "", ""
			case strings.HasPrefix(line, ":"):
				// keep-alive ping
			case strings.HasPrefix(line, "event: "):
				ev = strings.TrimPrefix(line, "event: ")
			case strings.HasPrefix(line, "data: "):
				dt += strings.TrimPrefix(line, "data: ")
			}
		}
	}()
	select {
	case f := <-ch:
		return f.name, f.data, f.err
	case <-time.After(timeout):
		return "", "", errors.New("timeout waiting for SSE frame")
	}
}

// until skips frames until one with the given event name arrives.
func (c *sseClient) until(event string, timeout time.Duration) string {
	c.t.Helper()
	deadline := time.Now().Add(timeout)
	for {
		left := time.Until(deadline)
		if left <= 0 {
			c.t.Fatalf("never received %q event", event)
		}
		name, data, err := c.next(left)
		if err != nil {
			c.t.Fatalf("reading for %q: %v", event, err)
		}
		if name == event {
			return data
		}
	}
}

func postJSON(t *testing.T, url string, v any) map[string]any {
	t.Helper()
	b, _ := json.Marshal(v)
	res, err := http.Post(url, "application/json", bytes.NewReader(b))
	if err != nil {
		t.Fatalf("POST %s: %v", url, err)
	}
	defer res.Body.Close()
	out := map[string]any{}
	_ = json.NewDecoder(res.Body).Decode(&out)
	if res.StatusCode >= 300 {
		t.Fatalf("POST %s -> %d: %v", url, res.StatusCode, out)
	}
	return out
}

func collabDoc() Document {
	return Document{
		Version: 1, App: "shear", ID: "d_collab", Name: "Shared", SelectedSceneID: "s1",
		Scenes: []Scene{{ID: "s1", Name: "Scene 1", Width: 800, Height: 600, Background: "#171717"}},
	}
}

// The headline scenario: two people join the same session and edits made
// by one arrive at the other, along with live cursor presence.
func TestTwoPeersCollaborate(t *testing.T) {
	h := NewHandler(t.TempDir(), t.TempDir())
	ts := httptest.NewServer(h)
	defer ts.Close()

	// 1. The host opens a room.
	res := postJSON(t, ts.URL+"/api/sessions", map[string]any{"document": collabDoc()})
	sid, _ := res["id"].(string)
	if sid == "" {
		t.Fatal("no session id returned")
	}

	events := ts.URL + "/api/sessions/" + sid + "/events"

	// 2. Two peers join over SSE.
	ana := sseConnect(t, events+"?name=Ana&peer=p_ana&scene=s1")
	defer ana.close()
	helloA := ana.until("hello", 5*time.Second)
	if !strings.Contains(helloA, `"p_ana"`) || !strings.Contains(helloA, "Shared") {
		t.Fatalf("hello to Ana malformed: %s", helloA)
	}

	bea := sseConnect(t, events+"?name=Bea&peer=p_bea&scene=s1")
	defer bea.close()
	helloB := bea.until("hello", 5*time.Second)
	if !strings.Contains(helloB, "Shared") {
		t.Fatalf("hello to Bea malformed: %s", helloB)
	}

	// Ana learns about Bea via a peers frame.
	peersA := ana.until("peers", 5*time.Second)
	if !strings.Contains(peersA, `"p_bea"`) {
		t.Fatalf("Ana never saw Bea join: %s", peersA)
	}

	// 3. Ana edits the document; Bea must receive it.
	doc := collabDoc()
	doc.Name = "Renamed live"
	postJSON(t, ts.URL+"/api/sessions/"+sid+"/document", map[string]any{"peer": "p_ana", "document": doc})

	docEvent := bea.until("document", 5*time.Second)
	if !strings.Contains(docEvent, "Renamed live") {
		t.Fatalf("Bea did not receive Ana's edit: %s", docEvent)
	}
	if strings.Contains(docEvent, `"p_bea"`) && strings.Contains(docEvent, `"from":"p_bea"`) {
		t.Fatal("Bea received her own broadcast")
	}

	// 4. Ana moves her cursor; Bea sees the presence.
	postJSON(t, ts.URL+"/api/sessions/"+sid+"/presence", map[string]any{
		"peer": "p_ana", "x": 123.5, "y": 45, "sceneId": "s1", "selection": "", "active": true,
	})
	presence := bea.until("presence", 5*time.Second)
	if !strings.Contains(presence, "123.5") || !strings.Contains(presence, "Ana") {
		t.Fatalf("Bea did not receive Ana's cursor: %s", presence)
	}

	// 5. Ana's connection drops and reconnects with the same peer id —
	// she must get the latest document and stay one peer, not two.
	ana.close()
	ana2 := sseConnect(t, events+"?name=Ana&peer=p_ana&scene=s1")
	defer ana2.close()
	hello2 := ana2.until("hello", 5*time.Second)
	if !strings.Contains(hello2, "Renamed live") {
		t.Fatalf("reconnected Ana got a stale document: %s", hello2)
	}

	// Bea hears the peer list settle; it must contain exactly one Ana.
	peersB := bea.until("peers", 5*time.Second)
	if n := strings.Count(peersB, `"p_ana"`); n != 1 {
		t.Fatalf("after reconnect peer list has %d Ana entries: %s", n, peersB)
	}

	// 6. Bea edits next; the reconnected Ana receives it.
	doc.Name = "Bea had a turn"
	postJSON(t, ts.URL+"/api/sessions/"+sid+"/document", map[string]any{"peer": "p_bea", "document": doc})
	if ev := ana2.until("document", 5*time.Second); !strings.Contains(ev, "Bea had a turn") {
		t.Fatalf("reconnected Ana missed Bea's edit: %s", ev)
	}
}

// A join link must survive the SPA fallback and the session info endpoint
// must report the room accurately.
func TestJoinFlowOverHTTP(t *testing.T) {
	h := NewHandler(t.TempDir(), t.TempDir())
	ts := httptest.NewServer(h)
	defer ts.Close()

	res := postJSON(t, ts.URL+"/api/sessions", map[string]any{"document": collabDoc()})
	sid, _ := res["id"].(string)
	url, _ := res["url"].(string)
	if !strings.Contains(url, "/join/"+sid) {
		t.Fatalf("share url %q does not point at /join/%s", url, sid)
	}

	// Room info before anyone joins.
	info := map[string]any{}
	ires, err := http.Get(ts.URL + "/api/sessions/" + sid)
	if err != nil {
		t.Fatal(err)
	}
	_ = json.NewDecoder(ires.Body).Decode(&info)
	ires.Body.Close()
	if info["name"] != "Shared" {
		t.Fatalf("session info wrong: %v", info)
	}

	// Unknown sessions are a clean 404 (the client shows "session ended").
	bad, err := http.Get(ts.URL + "/api/sessions/s_nope/events?name=X")
	if err != nil {
		t.Fatal(err)
	}
	bad.Body.Close()
	if bad.StatusCode != 404 {
		t.Fatalf("unknown session status = %d, want 404", bad.StatusCode)
	}
}

// Presence/document posts for a peer that never connected must be
// rejected, not crash the room.
func TestUnknownPeerRejected(t *testing.T) {
	h := NewHandler(t.TempDir(), t.TempDir())
	ts := httptest.NewServer(h)
	defer ts.Close()

	res := postJSON(t, ts.URL+"/api/sessions", map[string]any{"document": collabDoc()})
	sid := fmt.Sprint(res["id"])

	b, _ := json.Marshal(map[string]any{"peer": "p_ghost", "x": 1, "y": 1, "sceneId": "s1", "active": true})
	pr, err := http.Post(ts.URL+"/api/sessions/"+sid+"/presence", "application/json", bytes.NewReader(b))
	if err != nil {
		t.Fatal(err)
	}
	pr.Body.Close()
	if pr.StatusCode != 409 {
		t.Fatalf("ghost presence status = %d, want 409", pr.StatusCode)
	}
}
