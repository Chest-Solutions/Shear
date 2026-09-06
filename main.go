// Shear — a golang alternative to Figma.
//
// The process hosts the editor as a website and previews that site in a
// native WebView window (Microsoft Edge WebView2 on Windows). The backend
// binds every interface so a forwarded port can reach the same session.
package main

import (
	"embed"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"time"

	"shear/internal/app"
)

//go:embed all:ui
var embeddedDist embed.FS

func main() {
	addr := os.Getenv("SHEAR_ADDR")
	if addr == "" {
		addr = "0.0.0.0:8080"
	}

	dataDir := os.Getenv("SHEAR_DATA")
	if dataDir == "" {
		dataDir = "data"
	}
	distDir := os.Getenv("SHEAR_DIST")
	if distDir == "" {
		distDir = "web/dist"
	}

	ln, err := net.Listen("tcp", addr)
	if err != nil {
		ln, err = net.Listen("tcp", "0.0.0.0:0")
		if err != nil {
			log.Fatal(err)
		}
	}
	port := ln.Addr().(*net.TCPAddr).Port

	if sub, err := fs.Sub(embeddedDist, "ui"); err == nil {
		app.EmbeddedDist = sub
	}
	handler := app.NewHandler(dataDir, distDir)
	srv := &http.Server{Handler: handler}
	go func() {
		if err := srv.Serve(ln); err != nil && err != http.ErrServerClosed {
			log.Fatal(err)
		}
	}()

	if err := app.RegisterProtocol(); err != nil {
		log.Printf("note: could not register shear:// — %v", err)
	}

	// Local window always talks to loopback; guests use the 0.0.0.0 bind.
	start := fmt.Sprintf("http://127.0.0.1:%d", port)
	if len(os.Args) > 1 {
		if join := app.ParseJoinArg(os.Args[1]); join != "" {
			start = join
		}
	}

	waitUntilUp(fmt.Sprintf("http://127.0.0.1:%d/api/health", port))
	log.Printf("Shear %s — data %s — web %s", ln.Addr(), dataDir, distDir)

	if os.Getenv("SHEAR_HEADLESS") != "" {
		log.Printf("headless; editor at %s", start)
		select {}
	}

	runWebView(start)
}

func waitUntilUp(url string) {
	deadline := time.Now().Add(8 * time.Second)
	for time.Now().Before(deadline) {
		res, err := http.Get(url)
		if err == nil {
			_ = res.Body.Close()
			if res.StatusCode < 500 {
				return
			}
		}
		time.Sleep(40 * time.Millisecond)
	}
}
