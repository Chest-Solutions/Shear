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
