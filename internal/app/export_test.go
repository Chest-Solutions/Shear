package app

import (
	"strings"
	"testing"
)

func sampleScene() Scene {
	fill := "#ffffff"
	return Scene{
		ID: "sc1", Name: "Scene 1", Width: 400, Height: 300, Background: "#171717",
		Nodes: []Node{
			{
				ID: "n1", Name: "Card", Type: NodeRect, X: 20, Y: 30, Width: 120, Height: 80,
				Opacity: 1, Visible: true, Fill: &fill, CornerRadius: 12,
				Effects: []Effect{{ID: "e1", Type: "drop-shadow", Visible: true, Color: "#000000", X: 0, Y: 8, Blur: 24}},
				Timeline: &Timeline{
					Duration: 1, Trigger: TriggerView,
					Tracks: []Track{{
						ID: "t1", Property: "opacity",
						Keys: []Keyframe{
							{ID: "k1", Time: 0, Value: float64(0), Easing: [4]float64{0.25, 0.1, 0.25, 1}},
							{ID: "k2", Time: 1, Value: float64(1), Easing: [4]float64{0.25, 0.1, 0.25, 1}},
						},
					}},
				},
			},
			{
				ID: "n2", Name: "Label", Type: NodeText, X: 20, Y: 140, Width: 200, Height: 30,
				Opacity: 1, Visible: true,
				Text: &TextData{Content: "Hello\nShear", FontSize: 18, FontWeight: 500, Color: "#ededed", Align: AlignLeft},
			},
		},
	}
}

func TestRenderSceneSVG(t *testing.T) {
	out := RenderSceneSVG(sampleScene())
	for _, want := range []string{"<svg", `viewBox="0 0 400 300"`, "<rect", "feDropShadow", "<text", "Shear", "</svg>"} {
		if !strings.Contains(out, want) {
			t.Errorf("svg missing %q\n%s", want, out)
		}
	}
}

func TestRenderSceneHTMLKeepsAnimation(t *testing.T) {
	out := RenderSceneHTML(sampleScene())
	for _, want := range []string{"<!doctype html>", "@keyframes", "cubic-bezier(0.25,0.1,0.25,1)", "box-shadow", "animation:", "opacity: 0", "opacity: 1"} {
		if !strings.Contains(out, want) {
			t.Errorf("html missing %q", want)
		}
	}
}

func TestHoverTimelineRunsOnHover(t *testing.T) {
	s := sampleScene()
	s.Nodes[0].Timeline = &Timeline{
		Duration: 0.25, Trigger: TriggerHover,
		Tracks: []Track{{
			ID: "t2", Property: "scale",
			Keys: []Keyframe{
				{ID: "k1", Time: 0, Value: float64(1), Easing: [4]float64{0.16, 1, 0.3, 1}},
				{ID: "k2", Time: 0.25, Value: float64(1.04), Easing: [4]float64{0.16, 1, 0.3, 1}},
			},
		}},
	}
	out := RenderSceneHTML(s)
	if !strings.Contains(out, ":hover") || !strings.Contains(out, "animation-play-state: running") {
		t.Errorf("hover rule missing:\n%s", out)
	}
	if !strings.Contains(out, "scale(1.04)") {
		t.Errorf("scale keyframe missing:\n%s", out)
	}
}

func TestKeyframeTrackSampling(t *testing.T) {
	tr := Track{Property: "x", Keys: []Keyframe{
		{Time: 0, Value: float64(0)},
		{Time: 2, Value: float64(100)},
	}}
	if v, on, _ := sampleTrack(tr, 0); toF(v) != 0 || !on {
		t.Errorf("at t=0 want 0 on-key, got %v %v", v, on)
	}
	if v, _, _ := sampleTrack(tr, 1); toF(v) != 50 {
		t.Errorf("midpoint should interpolate to 50, got %v", v)
	}
	if v, _, _ := sampleTrack(tr, 9); toF(v) != 100 {
		t.Errorf("past the end should hold 100, got %v", v)
	}
}

func TestMixHex(t *testing.T) {
	if got := mixHex("#000000", "#ffffff", 0.5); got != "#808080" {
		t.Errorf("mixHex midpoint = %q, want #808080", got)
	}
}

func TestAdjustmentsAreOffsets(t *testing.T) {
	n := Node{Adjust: &Adjust{}}
	if got := cssFilter(n); got != "" {
		t.Errorf("zeroed adjustments should produce no filter, got %q", got)
	}
	n.Adjust.Brightness = 50
	if got := cssFilter(n); !strings.Contains(got, "brightness(1.5)") {
		t.Errorf("brightness +50 should be 1.5, got %q", got)
	}
}

func TestNumTrimsZeros(t *testing.T) {
	cases := map[float64]string{12: "12", 12.5: "12.5", 0.25: "0.25", 0: "0"}
	for in, want := range cases {
		if got := num(in); got != want {
			t.Errorf("num(%v) = %q, want %q", in, got, want)
		}
	}
}

func TestShareHostSwapsLoopback(t *testing.T) {
	t.Setenv("SHEAR_PUBLIC_HOST", "")
	got := ShareHost("192.168.1.20:8080")
	if got != "192.168.1.20:8080" {
		t.Errorf("non-loopback host should pass through, got %q", got)
	}
}

func TestParseJoinArg(t *testing.T) {
	cases := map[string]string{
		"shear://192.168.1.20:8080/join/s_abc": "http://192.168.1.20:8080/join/s_abc",
		"http://192.168.1.20:8080/join/s_abc":  "http://192.168.1.20:8080/join/s_abc",
		"shear://192.168.1.20:8080/":           "",
		"/tmp/some-file.shear":                 "",
		"":                                     "",
	}
	for in, want := range cases {
		if got := ParseJoinArg(in); got != want {
			t.Errorf("ParseJoinArg(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestJoinURL(t *testing.T) {
	if got := JoinURL("http://10.0.0.5:8080/join/s_x"); got != "shear://10.0.0.5:8080/join/s_x" {
		t.Errorf("JoinURL = %q", got)
	}
}
