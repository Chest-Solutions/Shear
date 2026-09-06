//go:build !webview && (headless || !cgo)

package main

import (
	"log"
	"os"
	"os/exec"
	"runtime"
	"time"
)

// runWebView previews the in-process site in a native frame.
//
// The tagged `webview` / CGO build uses WebView2 (Windows) or WKWebView /
// WebKitGTK. This fallback still opens Microsoft Edge in app mode on
// Windows — a WebView2-backed site window — so `go run .` is never just
// a log console.
func runWebView(url string) {
	if runtime.GOOS == "windows" {
		if openEdgeApp(url) {
			select {}
		}
	}
	log.Printf("Shear is serving the editor at %s", url)
	log.Printf("Build with CGO (or -tags webview) for an in-process Microsoft WebView2 window.")
	select {}
}

func openEdgeApp(url string) bool {
	candidates := []string{
		os.Getenv("PROGRAMFILES") + `\Microsoft\Edge\Application\msedge.exe`,
		os.Getenv("PROGRAMFILES(X86)") + `\Microsoft\Edge\Application\msedge.exe`,
		`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`,
		`C:\Program Files\Microsoft\Edge\Application\msedge.exe`,
		"msedge",
	}
	args := []string{"--app=" + url, "--window-size=1440,900", "--disable-features=Translate"}
	for _, exe := range candidates {
		if exe == "" || exe == `\Microsoft\Edge\Application\msedge.exe` {
			continue
		}
		cmd := exec.Command(exe, args...)
		if err := cmd.Start(); err != nil {
			continue
		}
		log.Printf("Edge WebView app window → %s", url)
		go func() {
			_ = cmd.Wait()
			time.Sleep(200 * time.Millisecond)
			os.Exit(0)
		}()
		return true
	}
	return false
}
