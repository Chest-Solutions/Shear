package app

import (
	"strings"
	"testing"
)

func iconNode() Node {
	return Node{
		ID: "ic1", Name: "Star", Type: NodeIcon,
		X: 40, Y: 50, Width: 24, Height: 24, Opacity: 1, Visible: true,
		Icon: &IconData{
			Color: "#ededed",
			SVG:   `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3 7h7l-6 4 2 8-6-5-6 5 2-8-6-4h7z"/></svg>`,
		},
	}
}

func TestValidateAcceptsIconsAndVariables(t *testing.T) {
	d := collabDoc()
	d.Scenes[0].Nodes = []Node{iconNode()}
	d.Variables = []ColorVariable{{ID: "v1", Name: "Primary", Color: "#ffffff"}}
	if err := d.Validate(); err != nil {
		t.Fatalf("document with icon + variables rejected: %v", err)
	}
}

func TestSVGExportEmbedsIcon(t *testing.T) {
	s := Scene{ID: "s", Name: "S", Width: 200, Height: 200, Background: "#171717", Nodes: []Node{iconNode()}}
	out := RenderSceneSVG(s)
	if !strings.Contains(out, "M12 2l3 7") {
		t.Errorf("svg export lost the icon path:\n%s", out)
	}
	if strings.Contains(out, "currentColor") {
		t.Errorf("svg export must tint the icon (currentColor left in place):\n%s", out)
	}
	if !strings.Contains(out, `x="40"`) || !strings.Contains(out, `width="24"`) {
		t.Errorf("icon not positioned in svg export:\n%s", out)
	}
}

func TestHTMLExportEmbedsIcon(t *testing.T) {
	s := Scene{ID: "s", Name: "S", Width: 200, Height: 200, Background: "#171717", Nodes: []Node{iconNode()}}
	out := RenderSceneHTML(s)
	if !strings.Contains(out, "<svg") || strings.Contains(out, "currentColor") {
		t.Errorf("html export must embed the tinted icon:\n%s", out)
	}
}

func TestPNGRendererSurvivesIcons(t *testing.T) {
	// The pure-Go rasterizer has no SVG interpreter, so icons are the one
	// element it cannot draw — but they must not break a render.
	s := Scene{ID: "s", Name: "S", Width: 200, Height: 200, Background: "#171717", Nodes: []Node{iconNode()}}
	data, err := RenderScene(s, 1)
	if err != nil {
		t.Fatalf("render with icon failed: %v", err)
	}
	if len(data) < 500 {
		t.Fatalf("suspiciously small png (%d bytes)", len(data))
	}
}
