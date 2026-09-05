package app

// Exporters. Shear's promise is that nothing is trapped in the editor:
// every scene can leave as SVG (vector) or as a self-contained HTML page
// that keeps the animations, easing curves and triggers intact.

import (
	"fmt"
	"html"
	"math"
	"sort"
	"strings"
)

// ---------------------------------------------------------------- SVG

// RenderSceneSVG returns a standalone SVG document for one scene.
func RenderSceneSVG(s Scene) string {
	var b strings.Builder
	fmt.Fprintf(&b, `<svg xmlns="http://www.w3.org/2000/svg" width="%s" height="%s" viewBox="0 0 %s %s">`+"\n",
		num(s.Width), num(s.Height), num(s.Width), num(s.Height))

	defs := &strings.Builder{}
	body := &strings.Builder{}
	ctr := 0
	for _, n := range s.Nodes {
		svgNode(body, defs, n, &ctr)
	}
	if defs.Len() > 0 {
		fmt.Fprintf(&b, "<defs>\n%s</defs>\n", defs.String())
	}
	fmt.Fprintf(&b, `<rect width="%s" height="%s" fill="%s"/>`+"\n", num(s.Width), num(s.Height), attr(s.Background))
	b.WriteString(body.String())
	b.WriteString("</svg>\n")
	return b.String()
}

func svgNode(body, defs *strings.Builder, n Node, ctr *int) {
	if !n.Visible {
		return
	}
	*ctr++
	id := fmt.Sprintf("f%d", *ctr)

	var filters []string
	for _, e := range n.Effects {
		if !e.Visible {
			continue
		}
		switch e.Type {
		case "drop-shadow":
			filters = append(filters, fmt.Sprintf(
				`<feDropShadow dx="%s" dy="%s" stdDeviation="%s" flood-color="%s"/>`,
				num(e.X), num(e.Y), num(e.Blur/2), attr(e.Color)))
		case "layer-blur":
			filters = append(filters, fmt.Sprintf(`<feGaussianBlur stdDeviation="%s"/>`, num(e.Blur/2)))
		}
	}
	if a := n.Adjust; a != nil && a.Blur > 0 {
		filters = append(filters, fmt.Sprintf(`<feGaussianBlur stdDeviation="%s"/>`, num(a.Blur/2)))
	}

	attrs := []string{}
	if len(filters) > 0 {
		fmt.Fprintf(defs, `<filter id="%s" x="-50%%" y="-50%%" width="200%%" height="200%%">%s</filter>`+"\n",
			id, strings.Join(filters, ""))
		attrs = append(attrs, fmt.Sprintf(`filter="url(#%s)"`, id))
	}
	if n.Opacity < 1 {
		attrs = append(attrs, fmt.Sprintf(`opacity="%s"`, num(n.Opacity)))
	}
	if n.Rotation != 0 {
		attrs = append(attrs, fmt.Sprintf(`transform="rotate(%s %s %s)"`,
			num(n.Rotation), num(n.X+n.Width/2), num(n.Y+n.Height/2)))
	}
	open := "<g"
	if len(attrs) > 0 {
		open += " " + strings.Join(attrs, " ")
	}
	body.WriteString(open + ">\n")

	fill := "none"
	if n.Fill != nil {
		fill = *n.Fill
	}
	stroke := ""
	if n.Stroke != nil && n.Stroke.Width > 0 {
		stroke = fmt.Sprintf(` stroke="%s" stroke-width="%s"`, attr(n.Stroke.Color), num(n.Stroke.Width))
	}

	switch n.Type {
	case NodeRect, NodeFrame:
		r := nodeRadii(n)
		if r.TL == r.TR && r.TR == r.BR && r.BR == r.BL {
			fmt.Fprintf(body, `<rect x="%s" y="%s" width="%s" height="%s" rx="%s" fill="%s"%s/>`+"\n",
				num(n.X), num(n.Y), num(n.Width), num(n.Height), num(r.TL), attr(fill), stroke)
		} else {
			fmt.Fprintf(body, `<path d="%s" fill="%s"%s/>`+"\n", roundedRectPath(n.X, n.Y, n.Width, n.Height, r), attr(fill), stroke)
		}
	case NodeEllipse:
		fmt.Fprintf(body, `<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="%s"%s/>`+"\n",
			num(n.X+n.Width/2), num(n.Y+n.Height/2), num(n.Width/2), num(n.Height/2), attr(fill), stroke)
	case NodeLine:
		x1, y1, x2, y2 := n.X, n.Y, n.X+n.Width, n.Y+n.Height
		if n.Flip {
			x1, x2 = n.X+n.Width, n.X
		}
		fmt.Fprintf(body, `<line x1="%s" y1="%s" x2="%s" y2="%s" stroke-linecap="round"%s/>`+"\n",
			num(x1), num(y1), num(x2), num(y2), defaultStroke(stroke))
	case NodeText:
		if n.Text != nil {
			svgText(body, n)
		}
	}

	for _, c := range n.Children {
		child := c
		child.X += n.X
		child.Y += n.Y
		svgNode(body, defs, child, ctr)
	}
	body.WriteString("</g>\n")
}

func svgText(body *strings.Builder, n Node) {
	t := n.Text
	lineHeight := t.FontSize * 1.3
	anchor, x := "start", n.X
	switch t.Align {
	case AlignCenter:
		anchor, x = "middle", n.X+n.Width/2
	case AlignRight:
		anchor, x = "end", n.X+n.Width
	}
	fmt.Fprintf(body, `<text x="%s" y="%s" fill="%s" font-family="-apple-system, SF Pro Text, Inter, sans-serif" font-size="%s" font-weight="%d" text-anchor="%s">`,
		num(x), num(n.Y+t.FontSize), attr(t.Color), num(t.FontSize), t.FontWeight, anchor)
	for i, line := range strings.Split(t.Content, "\n") {
		fmt.Fprintf(body, `<tspan x="%s" dy="%s">%s</tspan>`, num(x), num(float64(boolInt(i > 0))*lineHeight), html.EscapeString(line))
	}
	body.WriteString("</text>\n")
}

func defaultStroke(s string) string {
	if s == "" {
		return ` stroke="#ffffff" stroke-width="1"`
	}
	return s
}

func roundedRectPath(x, y, w, h float64, r CornerRadii) string {
	max := math.Min(w, h) / 2
	tl, tr, br, bl := math.Min(r.TL, max), math.Min(r.TR, max), math.Min(r.BR, max), math.Min(r.BL, max)
	return fmt.Sprintf("M%s %sh%sa%s %s 0 0 1 %s %sv%sa%s %s 0 0 1 -%s %sh-%sa%s %s 0 0 1 -%s -%sv-%sa%s %s 0 0 1 %s -%sz",
		num(x+tl), num(y), num(w-tl-tr),
		num(tr), num(tr), num(tr), num(tr), num(h-tr-br),
		num(br), num(br), num(br), num(br), num(w-br-bl),
		num(bl), num(bl), num(bl), num(bl), num(h-bl-tl),
		num(tl), num(tl), num(tl), num(tl))
}

func nodeRadii(n Node) CornerRadii {
	if n.CornerRadii != nil {
		return *n.CornerRadii
	}
	v := n.CornerRadius
	return CornerRadii{TL: v, TR: v, BR: v, BL: v, Linked: true}
}

// ---------------------------------------------------------------- HTML

// RenderSceneHTML returns a self-contained HTML page: absolutely
// positioned divs, CSS effects, and one keyframe/transition per
// animation so triggers still work in a browser.
func RenderSceneHTML(s Scene) string {
	css := &strings.Builder{}
	body := &strings.Builder{}
	ctr := 0
	for _, n := range s.Nodes {
		htmlNode(body, css, n, &ctr, 2)
	}

	return fmt.Sprintf(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>%s</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; display: grid; place-items: center; min-height: 100vh; background: #1c1c1e;
         font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, "Segoe UI", sans-serif; }
  .scene { position: relative; overflow: hidden; width: %spx; height: %spx; background: %s; }
  .node { position: absolute; }
  @media (prefers-reduced-motion: reduce) { .node { animation: none !important; transition: none !important; } }
%s</style>
</head>
<body>
  <div class="scene">
%s  </div>
</body>
</html>
`, html.EscapeString(s.Name), num(s.Width), num(s.Height), attr(s.Background), css.String(), body.String())
}

func htmlNode(body, css *strings.Builder, n Node, ctr *int, indent int) {
	if !n.Visible {
		return
	}
	*ctr++
	cls := fmt.Sprintf("n%d", *ctr)
	pad := strings.Repeat(" ", indent)

	style := []string{
		"left:" + num(n.X) + "px",
		"top:" + num(n.Y) + "px",
		"width:" + num(n.Width) + "px",
		"height:" + num(n.Height) + "px",
	}
	if n.Opacity < 1 {
		style = append(style, "opacity:"+num(n.Opacity))
	}
	if n.Rotation != 0 {
		style = append(style, "transform:rotate("+num(n.Rotation)+"deg)")
	}
	if n.Fill != nil {
		style = append(style, "background:"+*n.Fill)
	}
	if n.Stroke != nil && n.Stroke.Width > 0 {
		style = append(style, fmt.Sprintf("border:%spx solid %s", num(n.Stroke.Width), n.Stroke.Color))
	}
	if r := nodeRadii(n); r.TL+r.TR+r.BR+r.BL > 0 {
		style = append(style, fmt.Sprintf("border-radius:%spx %spx %spx %spx", num(r.TL), num(r.TR), num(r.BR), num(r.BL)))
	}
	if sh := cssShadows(n); sh != "" {
		style = append(style, "box-shadow:"+sh)
	}
	if f := cssFilter(n); f != "" {
		style = append(style, "filter:"+f)
	}
	if bb := backdropBlur(n); bb > 0 {
		style = append(style, fmt.Sprintf("backdrop-filter:blur(%spx);-webkit-backdrop-filter:blur(%spx)", num(bb), num(bb)))
	}

	content := ""
	if n.Type == NodeText && n.Text != nil {
		style = append(style,
			"color:"+n.Text.Color,
			"font-size:"+num(n.Text.FontSize)+"px",
			fmt.Sprintf("font-weight:%d", n.Text.FontWeight),
			"text-align:"+string(n.Text.Align),
			"line-height:1.3",
			"white-space:pre-wrap")
		content = html.EscapeString(n.Text.Content)
	}
	if n.Type == NodeLine {
		w := 1.0
		col := "#ffffff"
		if n.Stroke != nil {
			w, col = n.Stroke.Width, n.Stroke.Color
		}
		style = append(style, "border:none", fmt.Sprintf("border-top:%spx solid %s", num(w), col))
	}

	writeAnimationCSS(css, cls, n)

	fmt.Fprintf(body, `%s<div class="node %s" style="%s">%s`, pad, cls, strings.Join(style, ";"), content)
	if len(n.Children) > 0 {
		body.WriteString("\n")
		for _, c := range n.Children {
			htmlNode(body, css, c, ctr, indent+2)
		}
		body.WriteString(pad)
	}
	body.WriteString("</div>\n")
}

// writeAnimationCSS turns a node's keyframe tracks into CSS. Each track
// becomes percentage stops in one @keyframes rule; the easing stored on a
// keyframe is applied to the segment leaving it, which is what
// animation-timing-function does at a stop.
func writeAnimationCSS(css *strings.Builder, cls string, n Node) {
	tl := n.Timeline
	if tl == nil || len(tl.Tracks) == 0 || tl.Duration <= 0 {
		return
	}

	// Collect every distinct keyframe time across all tracks so one rule
	// can carry the whole animation.
	timeSet := map[float64]bool{0: true, tl.Duration: true}
	for _, tr := range tl.Tracks {
		for _, k := range tr.Keys {
			if k.Time >= 0 && k.Time <= tl.Duration {
				timeSet[k.Time] = true
			}
		}
	}
	times := make([]float64, 0, len(timeSet))
	for t := range timeSet {
		times = append(times, t)
	}
	sort.Float64s(times)

	name := cls + "-tl"
	fmt.Fprintf(css, "  @keyframes %s {\n", name)
	for _, t := range times {
		pct := t / tl.Duration * 100
		decls, ease := trackDecls(tl, t)
		if decls == "" {
			continue
		}
		if ease != "" {
			decls += "; animation-timing-function: " + ease
		}
		fmt.Fprintf(css, "    %s%% { %s }\n", num(pct), decls)
	}
	css.WriteString("  }\n")

	iterations := "1"
	fill := "both"
	if tl.Loop {
		iterations = "infinite"
	}

	switch tl.Trigger {
	case TriggerHover:
		fmt.Fprintf(css, "  .%s { animation: %s %ss linear %s %s paused; }\n", cls, name, num(tl.Duration), iterations, fill)
		fmt.Fprintf(css, "  .%s:hover { animation-play-state: running; }\n", cls)
	case TriggerClick:
		fmt.Fprintf(css, "  .%s { animation: %s %ss linear %s %s paused; }\n", cls, name, num(tl.Duration), iterations, fill)
		fmt.Fprintf(css, "  .%s:active { animation-play-state: running; }\n", cls)
	default: // view + loop
		if tl.Trigger == TriggerLoop {
			iterations = "infinite"
		}
		fmt.Fprintf(css, "  .%s { animation: %s %ss linear 0s %s %s; }\n", cls, name, num(tl.Duration), iterations, fill)
	}
}

// trackDecls returns the CSS declarations for every track at time t, plus
// the easing of whichever keyframe sits exactly on t.
func trackDecls(tl *Timeline, t float64) (string, string) {
	var decls []string
	var transforms []string
	ease := ""

	for _, tr := range tl.Tracks {
		v, on, e := sampleTrack(tr, t)
		if v == nil {
			continue
		}
		if on && ease == "" {
			ease = fmt.Sprintf("cubic-bezier(%s,%s,%s,%s)", num(e[0]), num(e[1]), num(e[2]), num(e[3]))
		}
		switch tr.Property {
		case "x":
			transforms = append(transforms, fmt.Sprintf("translateX(%spx)", num(toF(v))))
		case "y":
			transforms = append(transforms, fmt.Sprintf("translateY(%spx)", num(toF(v))))
		case "rotation":
			transforms = append(transforms, fmt.Sprintf("rotate(%sdeg)", num(toF(v))))
		case "scale":
			transforms = append(transforms, fmt.Sprintf("scale(%s)", num(toF(v))))
		case "width":
			decls = append(decls, fmt.Sprintf("width: %spx", num(toF(v))))
		case "height":
			decls = append(decls, fmt.Sprintf("height: %spx", num(toF(v))))
		case "opacity":
			decls = append(decls, fmt.Sprintf("opacity: %s", num(toF(v))))
		case "radius":
			decls = append(decls, fmt.Sprintf("border-radius: %spx", num(toF(v))))
		case "fill":
			if c, ok := v.(string); ok {
				decls = append(decls, "background: "+c)
			}
		case "blur":
			decls = append(decls, fmt.Sprintf("filter: blur(%spx)", num(toF(v))))
		case "brightness":
			decls = append(decls, fmt.Sprintf("filter: brightness(%s)", num((100+toF(v))/100)))
		case "contrast":
			decls = append(decls, fmt.Sprintf("filter: contrast(%s)", num((100+toF(v))/100)))
		case "saturation":
			decls = append(decls, fmt.Sprintf("filter: saturate(%s)", num((100+toF(v))/100)))
		case "hue":
			decls = append(decls, fmt.Sprintf("filter: hue-rotate(%sdeg)", num(toF(v))))
		}
	}

	if len(transforms) > 0 {
		decls = append(decls, "transform: "+strings.Join(transforms, " "))
	}
	return strings.Join(decls, "; "), ease
}

// sampleTrack evaluates a track at time t. It reports whether a keyframe
// sits exactly on t and, if so, that keyframe's outgoing easing.
func sampleTrack(tr Track, t float64) (any, bool, [4]float64) {
	if len(tr.Keys) == 0 {
		return nil, false, [4]float64{}
	}
	keys := append([]Keyframe(nil), tr.Keys...)
	sort.SliceStable(keys, func(i, j int) bool { return keys[i].Time < keys[j].Time })

	for _, k := range keys {
		if math.Abs(k.Time-t) < 1e-6 {
			return k.Value, true, k.Easing
		}
	}
	if t <= keys[0].Time {
		return keys[0].Value, false, [4]float64{}
	}
	last := keys[len(keys)-1]
	if t >= last.Time {
		return last.Value, false, [4]float64{}
	}
	for i := 0; i < len(keys)-1; i++ {
		a, b := keys[i], keys[i+1]
		if t >= a.Time && t <= b.Time {
			span := b.Time - a.Time
			if span <= 0 {
				return b.Value, false, [4]float64{}
			}
			p := (t - a.Time) / span
			// Intermediate stops are only emitted for times that already
			// have a keyframe somewhere, so a linear read is right here —
			// the curve is carried by animation-timing-function.
			if as, ok := a.Value.(string); ok {
				if bs, ok2 := b.Value.(string); ok2 {
					return mixHex(as, bs, p), false, [4]float64{}
				}
				return as, false, [4]float64{}
			}
			return toF(a.Value) + (toF(b.Value)-toF(a.Value))*p, false, [4]float64{}
		}
	}
	return last.Value, false, [4]float64{}
}

func toF(v any) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case int:
		return float64(n)
	}
	return 0
}

// mixHex blends two #rrggbb colours.
func mixHex(a, b string, t float64) string {
	ar, ag, ab := hexParts(a)
	br, bg, bb := hexParts(b)
	mix := func(x, y int) int { return int(float64(x) + (float64(y)-float64(x))*t + 0.5) }
	return fmt.Sprintf("#%02x%02x%02x", mix(ar, br), mix(ag, bg), mix(ab, bb))
}

func hexParts(h string) (int, int, int) {
	h = strings.TrimPrefix(h, "#")
	if len(h) == 3 {
		h = string([]byte{h[0], h[0], h[1], h[1], h[2], h[2]})
	}
	if len(h) < 6 {
		return 255, 255, 255
	}
	var r, g, b int
	_, _ = fmt.Sscanf(h[:6], "%02x%02x%02x", &r, &g, &b)
	return r, g, b
}

func cssShadows(n Node) string {
	out := []string{}
	for _, e := range n.Effects {
		if !e.Visible {
			continue
		}
		switch e.Type {
		case "drop-shadow":
			out = append(out, fmt.Sprintf("%spx %spx %spx %spx %s", num(e.X), num(e.Y), num(e.Blur), num(e.Spread), e.Color))
		case "inner-shadow":
			out = append(out, fmt.Sprintf("inset %spx %spx %spx %spx %s", num(e.X), num(e.Y), num(e.Blur), num(e.Spread), e.Color))
		}
	}
	return strings.Join(out, ", ")
}

// cssFilter renders a node's adjustments (offsets from normal) plus any
// layer blur effect.
func cssFilter(n Node) string {
	out := []string{}
	if a := n.Adjust; a != nil {
		if a.Brightness != 0 {
			out = append(out, fmt.Sprintf("brightness(%s)", num((100+a.Brightness)/100)))
		}
		if a.Contrast != 0 {
			out = append(out, fmt.Sprintf("contrast(%s)", num((100+a.Contrast)/100)))
		}
		if a.Saturation != 0 {
			out = append(out, fmt.Sprintf("saturate(%s)", num((100+a.Saturation)/100)))
		}
		if a.Temperature != 0 {
			out = append(out, fmt.Sprintf("sepia(%s)", num(math.Abs(a.Temperature)/100*0.5)))
			if a.Temperature < 0 {
				out = append(out, "hue-rotate(180deg)")
			}
			out = append(out, fmt.Sprintf("saturate(%s)", num(1+math.Abs(a.Temperature)/200)))
		}
		if a.Hue != 0 {
			out = append(out, fmt.Sprintf("hue-rotate(%sdeg)", num(a.Hue)))
		}
		if a.Blur != 0 {
			out = append(out, fmt.Sprintf("blur(%spx)", num(a.Blur)))
		}
		if a.Grayscale != 0 {
			out = append(out, fmt.Sprintf("grayscale(%s)", num(a.Grayscale/100)))
		}
		if a.Invert != 0 {
			out = append(out, fmt.Sprintf("invert(%s)", num(a.Invert/100)))
		}
	}
	for _, e := range n.Effects {
		if e.Visible && e.Type == "layer-blur" && e.Blur > 0 {
			out = append(out, fmt.Sprintf("blur(%spx)", num(e.Blur)))
		}
	}
	return strings.Join(out, " ")
}

func backdropBlur(n Node) float64 {
	for _, e := range n.Effects {
		if e.Visible && e.Type == "background-blur" {
			return e.Blur
		}
	}
	return 0
}

// num formats a float without trailing zeros, so exports stay readable.
func num(v float64) string {
	if math.IsNaN(v) || math.IsInf(v, 0) {
		return "0"
	}
	s := fmt.Sprintf("%.2f", v)
	s = strings.TrimRight(s, "0")
	return strings.TrimSuffix(s, ".")
}

func attr(s string) string { return html.EscapeString(s) }

func boolInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
