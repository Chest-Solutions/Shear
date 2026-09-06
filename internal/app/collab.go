package app

// Live collaboration ("Work together").
//
// A session is an in-memory room holding the shared document plus the
// presence of every peer (cursor position, selection, name, colour).
// Transport is deliberately dependency-free: peers receive a Server-Sent
// Events stream and push their own updates with small JSON POSTs. That
// keeps the whole feature inside the Go standard library, which matters
// for a single-binary desktop app.

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

// Peer is one connected designer.
type Peer struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	Color     string  `json:"color"`
	X         float64 `json:"x"`
	Y         float64 `json:"y"`
	SceneID   string  `json:"sceneId"`
	Selection string  `json:"selection"`
	Active    bool    `json:"active"`

	ch     chan sseEvent
	seenAt time.Time
}

type sseEvent struct {
	Name string
	Data any
}

// Session is a shared editing room.
type Session struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Host      string    `json:"host"`
	CreatedAt time.Time `json:"createdAt"`

	mu    sync.Mutex
	doc   Document
	peers map[string]*Peer
	rev   int
}

// Hub owns every live session.
type Hub struct {
	mu       sync.Mutex
	sessions map[string]*Session
}

// NewHub creates an empty hub and starts its janitor.
func NewHub() *Hub {
	h := &Hub{sessions: map[string]*Session{}}
	go h.reap()
	return h
}

// reap drops sessions that have had no peers for a while.
func (h *Hub) reap() {
	for range time.Tick(30 * time.Second) {
		h.mu.Lock()
		for id, s := range h.sessions {
			s.mu.Lock()
			for pid, p := range s.peers {
				if time.Since(p.seenAt) > 45*time.Second {
					close(p.ch)
					delete(s.peers, pid)
				}
			}
			empty := len(s.peers) == 0 && time.Since(s.CreatedAt) > 2*time.Minute
			s.mu.Unlock()
			if empty {
				delete(h.sessions, id)
			}
		}
		h.mu.Unlock()
	}
}

func (h *Hub) get(id string) (*Session, bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	s, ok := h.sessions[id]
	return s, ok
}

// Create opens a new session seeded with a document.
func (h *Hub) Create(doc Document, host string) *Session {
	s := &Session{
		ID:        NewID("s"),
		Name:      doc.Name,
		Host:      host,
		CreatedAt: time.Now(),
		doc:       doc,
		peers:     map[string]*Peer{},
	}
	h.mu.Lock()
	h.sessions[s.ID] = s
	h.mu.Unlock()
	return s
}

// broadcast fans an event out to every peer except `except` (may be empty).
func (s *Session) broadcast(except string, name string, data any) {
	ev := sseEvent{Name: name, Data: data}
	for id, p := range s.peers {
		if id == except {
			continue
		}
		select {
		case p.ch <- ev:
		default: // slow consumer: drop the frame rather than stall the room
		}
	}
}

func (s *Session) peerList() []Peer {
	out := make([]Peer, 0, len(s.peers))
	for _, p := range s.peers {
		out = append(out, *p)
	}
	return out
}

// ---------------------------------------------------------------- handlers

type createSessionRequest struct {
	Document Document `json:"document"`
}

type createSessionResponse struct {
	ID   string `json:"id"`
	URL  string `json:"url"`
	Name string `json:"name"`
}

func (s *Server) handleCreateSession(w http.ResponseWriter, r *http.Request) {
	var req createSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, 400, "invalid session request: "+err.Error())
		return
	}
	if err := req.Document.Validate(); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	sess := s.Hub.Create(req.Document, r.Host)

	// Prefer the origin the browser actually used (X-Forwarded-* when
	// sitting behind a tunnel / port-forward, else the request Host).
	// Falling back to the LAN address covers a host that opened the
	// editor at localhost.
	host := publicHost(r)
	scheme := publicScheme(r)
	writeJSON(w, 200, createSessionResponse{
		ID:   sess.ID,
		URL:  fmt.Sprintf("%s://%s/join/%s", scheme, host, sess.ID),
		Name: sess.Name,
	})
}

func publicScheme(r *http.Request) string {
	if v := r.Header.Get("X-Forwarded-Proto"); v != "" {
		return strings.Split(v, ",")[0]
	}
	if r.TLS != nil {
		return "https"
	}
	return "http"
}

func publicHost(r *http.Request) string {
	if v := r.Header.Get("X-Forwarded-Host"); v != "" {
		return strings.TrimSpace(strings.Split(v, ",")[0])
	}
	return ShareHost(r.Host)
}

func (s *Server) handleSessionInfo(w http.ResponseWriter, r *http.Request) {
	sess, ok := s.Hub.get(r.PathValue("id"))
	if !ok {
		writeErr(w, 404, "session not found or ended")
		return
	}
	sess.mu.Lock()
	defer sess.mu.Unlock()
	writeJSON(w, 200, map[string]any{
		"id":    sess.ID,
		"name":  sess.doc.Name,
		"peers": len(sess.peers),
	})
}

// handleSessionEvents is the SSE stream: one long-lived response per peer.
func (s *Server) handleSessionEvents(w http.ResponseWriter, r *http.Request) {
	sess, ok := s.Hub.get(r.PathValue("id"))
	if !ok {
		writeErr(w, 404, "session not found or ended")
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeErr(w, 500, "streaming unsupported")
		return
	}

	q := r.URL.Query()
	peer := &Peer{
		ID:      firstNonEmpty(q.Get("peer"), NewID("p")),
		Name:    firstNonEmpty(strings.TrimSpace(q.Get("name")), randomName()),
		Color:   q.Get("color"),
		Active:  true,
		ch:      make(chan sseEvent, 64),
		seenAt:  time.Now(),
		SceneID: q.Get("scene"),
	}

	sess.mu.Lock()
	if peer.Color == "" {
		peer.Color = peerColor(len(sess.peers))
	}
	sess.peers[peer.ID] = peer
	doc := sess.doc.Clone()
	rev := sess.rev
	peers := sess.peerList()
	sess.broadcast(peer.ID, "peers", peers)
	sess.mu.Unlock()

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(200)

	writeSSE(w, "hello", map[string]any{"peer": peer, "document": doc, "rev": rev, "peers": peers})
	flusher.Flush()

	ping := time.NewTicker(15 * time.Second)
	defer ping.Stop()
	ctx := r.Context()

	for {
		select {
		case <-ctx.Done():
			sess.mu.Lock()
			if p, still := sess.peers[peer.ID]; still && p == peer {
				delete(sess.peers, peer.ID)
				close(peer.ch)
			}
			sess.broadcast(peer.ID, "peers", sess.peerList())
			sess.mu.Unlock()
			return
		case ev, open := <-peer.ch:
			if !open {
				return
			}
			writeSSE(w, ev.Name, ev.Data)
			flusher.Flush()
		case <-ping.C:
			_, _ = fmt.Fprint(w, ": ping\n\n")
			flusher.Flush()
		}
	}
}

func writeSSE(w http.ResponseWriter, event string, data any) {
	b, err := json.Marshal(data)
	if err != nil {
		return
	}
	_, _ = fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, b)
}

type presenceRequest struct {
	Peer      string  `json:"peer"`
	Name      string  `json:"name"`
	Color     string  `json:"color"`
	X         float64 `json:"x"`
	Y         float64 `json:"y"`
	SceneID   string  `json:"sceneId"`
	Selection string  `json:"selection"`
	Active    bool    `json:"active"`
}

func (s *Server) handlePresence(w http.ResponseWriter, r *http.Request) {
	sess, ok := s.Hub.get(r.PathValue("id"))
	if !ok {
		writeErr(w, 404, "session not found or ended")
		return
	}
	var req presenceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, 400, "invalid presence")
		return
	}
	sess.mu.Lock()
	p, ok := sess.peers[req.Peer]
	if ok {
		p.X, p.Y = req.X, req.Y
		p.SceneID, p.Selection, p.Active = req.SceneID, req.Selection, req.Active
		if req.Name != "" {
			p.Name = req.Name
		}
		if req.Color != "" {
			p.Color = req.Color
		}
		p.seenAt = time.Now()
		sess.broadcast(p.ID, "presence", p)
	}
	sess.mu.Unlock()
	if !ok {
		writeErr(w, 409, "unknown peer — reconnect")
		return
	}
	w.WriteHeader(204)
}

type docUpdateRequest struct {
	Peer     string   `json:"peer"`
	Document Document `json:"document"`
}

func (s *Server) handleSessionDoc(w http.ResponseWriter, r *http.Request) {
	sess, ok := s.Hub.get(r.PathValue("id"))
	if !ok {
		writeErr(w, 404, "session not found or ended")
		return
	}
	var req docUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, 400, "invalid document")
		return
	}
	if err := req.Document.Validate(); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	sess.mu.Lock()
	sess.doc = req.Document
	sess.rev++
	rev := sess.rev
	if p, live := sess.peers[req.Peer]; live {
		p.seenAt = time.Now()
	}
	sess.broadcast(req.Peer, "document", map[string]any{"document": sess.doc, "rev": rev, "from": req.Peer})
	sess.mu.Unlock()
	writeJSON(w, 200, map[string]any{"rev": rev})
}

// ---------------------------------------------------------------- helpers

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}

// peerColors are neutral-friendly cursor tints: distinguishable from each
// other, and from the greyscale UI.
var peerColors = []string{"#7AA2F7", "#F7768E", "#9ECE6A", "#E0AF68", "#BB9AF7", "#7DCFFF", "#F5A97F", "#A6DA95"}

func peerColor(i int) string { return peerColors[i%len(peerColors)] }

var nameAdjectives = []string{"Quiet", "Soft", "Bright", "Calm", "Clear", "Warm", "Fine", "Light"}
var nameNouns = []string{"Pixel", "Vector", "Frame", "Curve", "Layer", "Anchor", "Shape", "Glyph"}

func randomName() string {
	return nameAdjectives[rand.Intn(len(nameAdjectives))] + " " + nameNouns[rand.Intn(len(nameNouns))]
}

// ShareHost returns a host:port other machines on the network can reach.
// It keeps the port of the local request and swaps a loopback address for
// the first non-loopback IPv4 interface.
func ShareHost(reqHost string) string {
	host, port, err := net.SplitHostPort(reqHost)
	if err != nil {
		host, port = reqHost, ""
	}
	if v := os.Getenv("SHEAR_PUBLIC_HOST"); v != "" {
		return v
	}
	loopback := host == "" || host == "localhost" || strings.HasPrefix(host, "127.") || host == "::1" || host == "[::1]"
	if !loopback {
		return reqHost
	}
	if ip := lanIP(); ip != "" && port != "" {
		return net.JoinHostPort(ip, port)
	}
	return reqHost
}

func lanIP() string {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return ""
	}
	var fallback string
	for _, a := range addrs {
		ipnet, ok := a.(*net.IPNet)
		if !ok || ipnet.IP.IsLoopback() {
			continue
		}
		ip4 := ipnet.IP.To4()
		if ip4 == nil || ip4.IsLinkLocalUnicast() {
			continue
		}
		if ip4.IsPrivate() {
			return ip4.String()
		}
		if fallback == "" {
			fallback = ip4.String()
		}
	}
	return fallback
}
