package app

import (
	"os"
	"testing"
)

func str(p string) *string { return &p }

func stroke(c string, w float64) *Stroke { return &Stroke{Color: c, Width: w} }

// sampleScene exercises every node type, nesting, rotation and opacity.
func sampleScene() Scene {
	white := "#ffffff"
	dark := "#171717"
	acc := "#7dd3fc"
	return Scene{
		ID:         "s1",
		Name:       "Sample",
		Width:      960,
		Height:     600,
		Background: dark,
		Nodes: []Node{
			{
				ID: "f1", Name: "Card", Type: NodeFrame,
				X: 80, Y: 80, Width: 360, Height: 240,
				Fill: str("#262626"), CornerRadius: 20, Opacity: 1, Visible: true,
				Children: []Node{
					{ID: "t1", Name: "Title", Type: NodeText, X: 24, Y: 24, Width: 300, Height: 40,
						Fill: str(white), Opacity: 1, Visible: true,
						Text: &TextData{Content: "Shear", FontSize: 28, FontWeight: 700, Color: white, Align: AlignLeft}},
					{ID: "t2", Name: "Body", Type: NodeText, X: 24, Y: 70, Width: 300, Height: 90,
						Fill: str(white), Opacity: 1, Visible: true,
						Text: &TextData{Content: "Designed in Go.\nRendered in Go.", FontSize: 15, FontWeight: 400, Color: "#a3a3a3", Align: AlignLeft}},
					{ID: "e1", Name: "Dot", Type: NodeEllipse, X: 300, Y: 32, Width: 24, Height: 24,
						Fill: str(acc), Opacity: 1, Visible: true},
				},
			},
			{ID: "r1", Name: "Button", Type: NodeRect,
				X: 560, Y: 120, Width: 200, Height: 56,
				Fill: str(white), CornerRadius: 12, Opacity: 0.95, Visible: true},
			{ID: "rt1", Name: "Label", Type: NodeText,
				X: 560, Y: 136, Width: 200, Height: 28,
				Fill: str(dark), Opacity: 1, Visible: true,
				Text: &TextData{Content: "Export", FontSize: 16, FontWeight: 600, Color: dark, Align: AlignCenter}},
			{ID: "e2", Name: "Ring", Type: NodeEllipse,
				X: 590, Y: 240, Width: 140, Height: 140,
				Stroke: stroke(acc, 8), Opacity: 0.8, Visible: true},
			{ID: "l1", Name: "Line", Type: NodeLine,
				X: 560, Y: 440, Width: 240, Height: 40, Flip: true,
				Stroke: stroke("#737373", 3), Opacity: 1, Visible: true},
			{ID: "r2", Name: "Rotated", Type: NodeRect,
				X: 700, Y: 420, Width: 120, Height: 120,
				Fill: str("#404040"), CornerRadius: 16, Rotation: 25, Opacity: 0.9, Visible: true,
				Stroke: stroke(white, 2)},
		},
	}
}

func TestRenderScene(t *testing.T) {
	for scale, name := range map[float64]string{1: "sample-1x.png", 2: "sample-2x.png"} {
		data, err := RenderScene(sampleScene(), scale)
		if err != nil {
			t.Fatalf("render scale %v: %v", scale, err)
		}
		if len(data) < 1000 {
			t.Fatalf("suspiciously small png (%d bytes) at scale %v", len(data), scale)
		}
		if err := os.WriteFile("testdata/"+name, data, 0o644); err != nil {
			t.Fatal(err)
		}
		t.Logf("wrote testdata/%s (%d bytes)", name, len(data))
	}
}

func TestParseColor(t *testing.T) {
	if _, ok := ParseColor("#ff0000"); !ok {
		t.Error("failed to parse #ff0000")
	}
	c, ok := ParseColor("#abc")
	if !ok || c.R != 0xaa || c.G != 0xbb || c.B != 0xcc {
		t.Errorf("failed to parse #abc: %+v %v", c, ok)
	}
	if _, ok := ParseColor("nope"); ok {
		t.Error("accepted garbage color")
	}
}

func TestDocumentValidation(t *testing.T) {
	d := Document{Scenes: []Scene{{ID: "s", Width: 100, Height: 100}}}
	if err := d.Validate(); err != nil {
		t.Errorf("valid doc rejected: %v", err)
	}
	d.Scenes[0].Width = 0
	if err := d.Validate(); err == nil {
		t.Error("accepted zero-width scene")
	}
}
