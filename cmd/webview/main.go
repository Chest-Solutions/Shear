// Shear desktop shell.
//
// Builds a native window (WKWebView on macOS, WebKitGTK on Linux, WebView2
// on Windows) that hosts the editor, with the Go backend running in-process
// on a local port.
//
//	go build -tags webview -o shear .
//
// The plain (untagged) build is just the local web server.
//
//go:build webview

package main

import (
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"

	wv "github.com/webview/webview_go"
	"shear/internal/app"
)

func main() {
	// Find a free local port for the in-process backend.
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		log.Fatal(err)
	}
	port := l.Addr().(*net.TCPAddr).Port
	_ = l.Close()

	dataDir := os.Getenv("SHEAR_DATA")
	if dataDir == "" {
		home, _ := os.UserHomeDir()
		dataDir = filepath.Join(home, ".shear", "data")
	}
	distDir := os.Getenv("SHEAR_DIST")
	if distDir == "" {
		distDir = "web/dist"
	}

	srv := &http.Server{Addr: fmt.Sprintf("127.0.0.1:%d", port), Handler: app.NewHandler(dataDir, distDir)}
	go func() {
		log.Printf("backend on 127.0.0.1:%d (data: %s, web: %s)", port, dataDir, distDir)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal(err)
		}
	}()

	// Make sure the OS knows this binary owns shear:// links, so a share
	// link opened in a browser can hand the session to this app.
	if err := app.RegisterProtocol(); err != nil {
		log.Printf("note: could not register the shear:// handler: %v", err)
	}

	// A share link can be handed to the app as a launch argument, either
	// as shear://host/join/<id> or as the plain http link. Both point at
	// the *host's* backend, so we navigate there instead of to our own.
	start := fmt.Sprintf("http://127.0.0.1:%d", port)
	if len(os.Args) > 1 {
		if join := app.ParseJoinArg(os.Args[1]); join != "" {
			start = join
		}
	}

	window := wv.New(false)
	window.SetTitle("Shear")
	window.SetSize(1440, 900, wv.HintNone)
	window.Navigate(start)
	window.Run()
}

