package app

import (
	"bytes"
	"image/png"
	"strings"
	"testing"
)

func polyScene() Scene {
	fill := "#ff0000"
	return Scene{
		ID: "s1", Name: "S", Width: 200, Height: 200, Background: "#111111",
		Nodes: []Node{
			{ID: "p1", Name: "Star", Type: NodePoly, X: 20, Y: 20, Width: 80, Height: 80, Opacity: 1, Visible: true, Fill: &fill, Poly: &Poly{Kind: "star"}},
			{ID: "l1", Name: "Arrow", Type: NodeLine, X: 20, Y: 130, Width: 100, Height: 40, Opacity: 1, Visible: true, Arrow: true, Stroke: &Stroke{Color: "#ffffff", Width: 3}},
		},
	}
}

func TestPolyExports(t *testing.T) {
	s := polyScene()
	svg := RenderSceneSVG(s)
	if strings.Count(svg, "<polygon") < 2 {
		t.Fatalf("svg should contain star + arrow head polygons, got:\n%s", svg)
	}
	html := RenderSceneHTML(s)
	if !strings.Contains(html, "preserveAspectRatio") || !strings.Contains(html, "<polygon") {
		t.Fatalf("html should embed the poly svg outlines")
	}
	raw, err := RenderScene(s, 1)
	if err != nil {
		t.Fatal(err)
	}
	pngImg, err := png.Decode(bytes.NewReader(raw))
	if err != nil {
		t.Fatal(err)
	}
	// the star's centre must be painted red
	c := pngImg.At(60, 60)
	if r, _, _, _ := c.RGBA(); r>>8 < 120 {
		t.Fatalf("expected red fill at star centre, got %+v", c)
	}
}
