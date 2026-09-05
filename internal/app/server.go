package app

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// Server holds the API dependencies.
type Server struct {
	Store   *Store
	DistDir string
	Hub     *Hub
}

// NewHandler wires up the full HTTP handler (API + static frontend).
func NewHandler(dataDir, distDir string) http.Handler {
	store, err := NewStore(dataDir)
	if err != nil {
		store, _ = NewStore(filepath.Join(os.TempDir(), "shear-data"))
	}
	s := &Server{Store: store, DistDir: distDir, Hub: NewHub()}
	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/health", s.handleHealth)
	mux.HandleFunc("GET /api/documents", s.handleListDocuments)
	mux.HandleFunc("GET /api/documents/{id}", s.handleGetDocument)
	mux.HandleFunc("PUT /api/documents/{id}", s.handlePutDocument)
	mux.HandleFunc("DELETE /api/documents/{id}", s.handleDeleteDocument)
	mux.HandleFunc("POST /api/export/png", s.handleExportPNG)
	mux.HandleFunc("POST /api/export/svg", s.handleExportSVG)
	mux.HandleFunc("POST /api/export/html", s.handleExportHTML)

	// Work together.
	mux.HandleFunc("POST /api/sessions", s.handleCreateSession)
	mux.HandleFunc("GET /api/sessions/{id}", s.handleSessionInfo)
	mux.HandleFunc("GET /api/sessions/{id}/events", s.handleSessionEvents)
	mux.HandleFunc("POST /api/sessions/{id}/presence", s.handlePresence)
	mux.HandleFunc("POST /api/sessions/{id}/document", s.handleSessionDoc)

	return s.withStatic(mux)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{"ok": true, "app": "shear", "version": DocumentVersion})
}

func (s *Server) handleListDocuments(w http.ResponseWriter, r *http.Request) {
	list := s.Store.List()
	if list == nil {
		list = []Summary{}
	}
	writeJSON(w, 200, list)
}

func (s *Server) handleGetDocument(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	d, ok := s.Store.Get(id)
	if !ok {
		writeErr(w, 404, "document not found")
		return
	}
	writeJSON(w, 200, d)
}

func (s *Server) handlePutDocument(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var d Document
	if err := json.NewDecoder(io.LimitReader(r.Body, 20<<20)).Decode(&d); err != nil {
		writeErr(w, 400, "invalid document json: "+err.Error())
		return
	}
	if d.ID == "" {
		d.ID = id
	}
	if d.ID != id {
		writeErr(w, 400, "document id mismatch")
		return
	}
	d.Version = DocumentVersion
	d.App = "shear"
	d.UpdatedAt = Now()
	if err := s.Store.Put(d); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "id": d.ID, "updatedAt": d.UpdatedAt})
}

func (s *Server) handleDeleteDocument(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := s.Store.Delete(id); err != nil {
		writeErr(w, 404, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

type pngExportRequest struct {
	Scene Scene   `json:"scene"`
	Scale float64 `json:"scale"`
}

// handleExportPNG renders a single scene to a PNG image.
func (s *Server) handleExportPNG(w http.ResponseWriter, r *http.Request) {
	var req pngExportRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, 20<<20)).Decode(&req); err != nil {
		writeErr(w, 400, "invalid export request: "+err.Error())
		return
	}
	if len(req.Scene.Nodes) > 100000 || req.Scene.Width > 20000 || req.Scene.Height > 20000 {
		writeErr(w, 400, "scene too large to export")
		return
	}
	data, err := RenderScene(req.Scene, req.Scale)
	if err != nil {
		writeErr(w, 400, "render failed: "+err.Error())
		return
	}
	w.Header().Set("Content-Type", "image/png")
	w.Header().Set("Content-Length", fmt.Sprint(len(data)))
	w.WriteHeader(200)
	_, _ = w.Write(data)
}

type sceneExportRequest struct {
	Scene Scene `json:"scene"`
}

func (s *Server) handleExportSVG(w http.ResponseWriter, r *http.Request) {
	var req sceneExportRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, 20<<20)).Decode(&req); err != nil {
		writeErr(w, 400, "invalid export request: "+err.Error())
		return
	}
	w.Header().Set("Content-Type", "image/svg+xml; charset=utf-8")
	_, _ = io.WriteString(w, RenderSceneSVG(req.Scene))
}

func (s *Server) handleExportHTML(w http.ResponseWriter, r *http.Request) {
	var req sceneExportRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, 20<<20)).Decode(&req); err != nil {
		writeErr(w, 400, "invalid export request: "+err.Error())
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = io.WriteString(w, RenderSceneHTML(req.Scene))
}

// withStatic serves the built frontend from DistDir with an SPA fallback.
func (s *Server) withStatic(api http.Handler) http.Handler {
	dist := s.DistDir
	if fi, err := os.Stat(dist); err != nil || !fi.IsDir() {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			writeErr(w, 503, "frontend not built — run: cd web && npm ci && npm run build")
		})
	}
	index := filepath.Join(dist, "index.html")
	fs := http.FileServer(http.Dir(dist))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := r.URL.Path
		if strings.HasPrefix(p, "/api/") {
			api.ServeHTTP(w, r)
			return
		}
		full := filepath.Join(dist, filepath.Clean(strings.TrimPrefix(p, "/")))
		if p != "/" {
			if st, err := os.Stat(full); err == nil && !st.IsDir() {
				fs.ServeHTTP(w, r)
				return
			}
		}
		// SPA fallback for "/" and for client routes like /join/<id>.
		//
		// This serves index.html directly rather than rewriting the path
		// and handing it to http.FileServer: FileServer canonicalises a
		// request for "index.html" by redirecting to "./", which on a
		// route like /join/<id> redirects forever ("redirected too many
		// times") instead of booting the app.
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache")
		http.ServeFile(w, r, index)
	})
}
