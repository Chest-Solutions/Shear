package app

// Desktop URL-scheme registration.
//
// A share link is opened in a browser, which then has to hand the session
// over to the Shear app in the taskbar. That handoff needs the OS to know
// that "shear://" belongs to this binary, so the app registers itself on
// first run.

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

// JoinURL turns a share link into the shear:// URL that launches the app.
//
//	http://192.168.1.20:8080/join/s_abc  ->  shear://192.168.1.20:8080/join/s_abc
func JoinURL(shareURL string) string {
	s := strings.TrimPrefix(shareURL, "http://")
	s = strings.TrimPrefix(s, "https://")
	return "shear://" + s
}

// ParseJoinArg turns a launch argument back into an http URL the webview
// can navigate to. It accepts both "shear://host/join/id" and a plain
// http link, and returns "" for anything else.
func ParseJoinArg(arg string) string {
	arg = strings.TrimSpace(arg)
	switch {
	case strings.HasPrefix(arg, "shear://"):
		rest := strings.TrimPrefix(arg, "shear://")
		if rest == "" || !strings.Contains(rest, "/join/") {
			return ""
		}
		return "http://" + strings.TrimSuffix(rest, "/")
	case strings.HasPrefix(arg, "http://"), strings.HasPrefix(arg, "https://"):
		if !strings.Contains(arg, "/join/") {
			return ""
		}
		return arg
	}
	return ""
}

// RegisterProtocol tells the OS that this binary handles shear:// links.
// Failures are returned but are never fatal: the app still runs, the
// browser just can't hand off to it.
func RegisterProtocol() error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	exe, _ = filepath.EvalSymlinks(exe)

	switch runtime.GOOS {
	case "linux":
		return registerLinux(exe)
	case "windows":
		return registerWindows(exe)
	case "darwin":
		// macOS reads CFBundleURLTypes from the .app bundle's Info.plist,
		// so there is nothing to do at runtime. See docs/packaging.md.
		return nil
	}
	return nil
}

func registerLinux(exe string) error {
	dir := filepath.Join(os.Getenv("HOME"), ".local", "share", "applications")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	desktop := fmt.Sprintf(`[Desktop Entry]
Type=Application
Name=Shear
Exec=%s %%u
Terminal=false
NoDisplay=false
MimeType=x-scheme-handler/shear;
Categories=Graphics;
`, exe)
	path := filepath.Join(dir, "shear.desktop")
	if err := os.WriteFile(path, []byte(desktop), 0o644); err != nil {
		return err
	}
	// Best-effort: tell the desktop database about the new handler.
	_ = exec.Command("update-desktop-database", dir).Run()
	return exec.Command("xdg-mime", "default", "shear.desktop", "x-scheme-handler/shear").Run()
}

func registerWindows(exe string) error {
	// HKCU keeps this a per-user change, so no elevation is needed.
	cmds := [][]string{
		{"add", `HKCU\Software\Classes\shear`, "/ve", "/d", "URL:Shear Protocol", "/f"},
		{"add", `HKCU\Software\Classes\shear`, "/v", "URL Protocol", "/d", "", "/f"},
		{"add", `HKCU\Software\Classes\shear\shell\open\command`, "/ve", "/d", fmt.Sprintf(`"%s" "%%1"`, exe), "/f"},
	}
	for _, args := range cmds {
		if err := exec.Command("reg", args...).Run(); err != nil {
			return err
		}
	}
	return nil
}
