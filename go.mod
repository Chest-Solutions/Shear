module shear

go 1.23.0

require golang.org/x/image v0.24.0

require (
	github.com/webview/webview_go v0.0.0-20240831120633-6173450d4dd6 // indirect
	golang.org/x/text v0.22.0 // indirect
)

// The module proxy (proxy.golang.org) is unreachable in the author's
// sandbox; the x/ modules live on github.com, so point them at their
// GitHub mirrors. These replaces are also valid anywhere else.
replace golang.org/x/image => github.com/golang/image v0.24.0

replace golang.org/x/text => github.com/golang/text v0.22.0

replace golang.org/x/net => github.com/golang/net v0.35.0
