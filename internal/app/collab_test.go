package app

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestHubCreateAndGet(t *testing.T) {
	h := NewHub()
	doc := Document{Version: 1, App: "shear", ID: "d1", Name: "Test", Scenes: []Scene{{ID: "s", Width: 100, Height: 100}}}
	s := h.Create(doc, "localhost:8080")
	if s.ID == "" {
		t.Fatal("session id should not be empty")
	}
	got, ok := h.get(s.ID)
	if !ok || got.ID != s.ID {
		t.Fatal("session not retrievable")
	}
	if _, ok := h.get("nope"); ok {
		t.Fatal("unknown session should not resolve")
	}
}

func TestBroadcastSkipsSender(t *testing.T) {
	s := &Session{peers: map[string]*Peer{}, CreatedAt: time.Now()}
	a := &Peer{ID: "a", ch: make(chan sseEvent, 4)}
	b := &Peer{ID: "b", ch: make(chan sseEvent, 4)}
	s.peers["a"], s.peers["b"] = a, b

	s.broadcast("a", "presence", a)

	if len(a.ch) != 0 {
		t.Error("sender should not receive its own event")
	}
	if len(b.ch) != 1 {
		t.Error("other peer should receive the event")
	}
}

func TestPublicHostPrefersForwarded(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/sessions", nil)
	r.Header.Set("X-Forwarded-Host", "example.ngrok.app")
	r.Header.Set("X-Forwarded-Proto", "https")
	if got := publicHost(r); got != "example.ngrok.app" {
		t.Fatalf("publicHost = %q", got)
	}
	if got := publicScheme(r); got != "https" {
		t.Fatalf("publicScheme = %q", got)
	}
}

func TestPeerColorsCycle(t *testing.T) {
	if peerColor(0) == peerColor(1) {
		t.Error("adjacent peers must get different colors")
	}
	if peerColor(0) != peerColor(len(peerColors)) {
		t.Error("colors should wrap around")
	}
}
