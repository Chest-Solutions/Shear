// Shear — a golang alternative to Figma.
//
// The plain binary is a local web server: it serves the built frontend
// (web/dist) and the small API used by the editor (document persistence
// and PNG rendering of scenes).
package main

import (
	"log"
	"net"
	"net/http"
	"os"
	"strings"

	"shear/internal/app"
)

func main() {
	addr := os.Getenv("SHEAR_ADDR")
	if addr == "" {
		addr = ":8080"
	}

	dataDir := os.Getenv("SHEAR_DATA")
	if dataDir == "" {
		dataDir = "data"
	}

	distDir := os.Getenv("SHEAR_DIST")
	if distDir == "" {
		distDir = "web/dist"
	}

	handler := app.NewHandler(dataDir, distDir)

	srv := &http.Server{Addr: addr, Handler: handler}

	if host, _, err := net.SplitHostPort(addr); err == nil {
		if host == "" || host == "127.0.0.1" || host == "localhost" || strings.HasPrefix(host, "127.") {
			log.Println("note: set SHEAR_ADDR=0.0.0.0:8080 to reach the app from outside this machine")
		}
	}

	log.Printf("Shear listening on %s — data: %s, web: %s", addr, dataDir, distDir)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}
