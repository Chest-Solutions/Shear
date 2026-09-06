//go:build webview || (cgo && !headless)

package main

import (
	"log"

	wv "github.com/webview/webview_go"
)

// runWebView hosts the editor site in a native WebView window.
// On Windows this is Microsoft Edge WebView2.
func runWebView(url string) {
	w := wv.New(true)
	w.SetTitle("Shear")
	w.SetSize(1440, 900, wv.HintNone)
	w.Navigate(url)
	log.Printf("WebView previewing %s", url)
	w.Run()
}
