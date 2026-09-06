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
	// Bind every interface so a forwarded port (or a LAN peer) can reach
	// the in-process backend. The native window still loads 127.0.0.1.
	addr := os.Getenv("SHEAR_ADDR")
	if addr == "" {
		addr = "0.0.0.0:8080"
	}
	l, err := net.Listen("tcp", addr)
	if err != nil {
		l, err = net.Listen("tcp", "0.0.0.0:0")
		if err != nil {
			log.Fatal(err)
		}
	}
	port := l.Addr().(*net.TCPAddr).Port

	dataDir := os.Getenv("SHEAR_DATA")
	if dataDir == "" {
		home, _ := os.UserHomeDir()
		dataDir = filepath.Join(home, ".shear", "data")
	}
	distDir := os.Getenv("SHEAR_DIST")
	if distDir == "" {
		distDir = "web/dist"
	}

	srv := &http.Server{Handler: app.NewHandler(dataDir, distDir)}
	go func() {
		log.Printf("backend on %s (data: %s, web: %s)", l.Addr(), dataDir, distDir)
		if err := srv.Serve(l); err != nil && err != http.ErrServerClosed {
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

	// WebView2 on Windows, WKWebView on macOS, WebKitGTK on Linux.
	window := wv.New(true)
	window.SetTitle("Shear")
	window.SetSize(1440, 900, wv.HintNone)
	window.Navigate(start)
	window.Run()
}

