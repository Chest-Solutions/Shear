package app

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

// A share link like /join/<id> must serve the app, not bounce forever.
func TestJoinRouteDoesNotRedirect(t *testing.T) {
	dist := t.TempDir()
	if err := os.WriteFile(filepath.Join(dist, "index.html"), []byte("<html>shear</html>"), 0o644); err != nil {
		t.Fatal(err)
	}
	h := NewHandler(t.TempDir(), dist)

	for _, path := range []string{"/", "/join/s_abc", "/join/s_abc/"} {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
		if rec.Code != 200 {
			t.Errorf("GET %s = %d, want 200 (redirect loop?)", path, rec.Code)
		}
	}
}

func TestCORSPreflight(t *testing.T) {
	dist := t.TempDir()
	if err := os.WriteFile(filepath.Join(dist, "index.html"), []byte("<html>shear</html>"), 0o644); err != nil {
		t.Fatal(err)
	}
	h := NewHandler(t.TempDir(), dist)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodOptions, "/api/sessions", nil)
	h.ServeHTTP(rec, req)
	if rec.Code != 204 {
		t.Fatalf("OPTIONS = %d, want 204", rec.Code)
	}
	if rec.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Fatal("missing CORS allow origin")
	}
}
