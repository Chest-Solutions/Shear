package app

import (
	"bytes"
	"embed"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"math"
	"strconv"
	"strings"
	"sync"

	xfont "golang.org/x/image/font"
	"golang.org/x/image/font/opentype"
	"golang.org/x/image/math/fixed"
)

//go:embed fonts/*.ttf
var fontFS embed.FS

var fontData = struct {
	Regular  []byte
	Medium   []byte
	SemiBold []byte
	Bold     []byte
}{
	Regular:  mustFont("Lato-Regular.ttf"),
	Medium:   mustFont("Lato-Medium.ttf"),
	SemiBold: mustFont("Lato-SemiBold.ttf"),
	Bold:     mustFont("Lato-Bold.ttf"),
}

func mustFont(name string) []byte {
	b, err := fontFS.ReadFile("fonts/" + name)
	if err != nil {
		panic("embedded font missing: " + name)
	}
	return b
}

var (
	faceCache   = map[string]xfont.Face{}
	faceCacheMu sync.Mutex
)

// faceFor returns a cached face for the given size and weight class.
func faceFor(size float64, weight int) (xfont.Face, error) {
	if size < 1 {
		size = 1
	}
	// Round size to 0.5px steps to keep the cache small.
	size = math.Round(size*2) / 2
	var data []byte
	switch {
	case weight <= 400:
		data = fontData.Regular
	case weight <= 550:
		data = fontData.Medium
	case weight <= 650:
		data = fontData.SemiBold
	default:
		data = fontData.Bold
	}
	key := fmt.Sprintf("%g/%d", size, weight)
	faceCacheMu.Lock()
	defer faceCacheMu.Unlock()
	if f, ok := faceCache[key]; ok {
		return f, nil
	}
	ft, err := opentype.Parse(data)
	if err != nil {
		return nil, err
	}
	f, err := opentype.NewFace(ft, &opentype.FaceOptions{Size: size, DPI: 72})
	if err != nil {
		return nil, err
	}
	faceCache[key] = f
	return f, nil
}

// ParseColor parses #RGB, #RRGGBB or #RRGGBBAA hex colors.
func ParseColor(s string) (color.RGBA, bool) {
	s = strings.TrimSpace(s)
	if strings.HasPrefix(s, "#") {
		s = s[1:]
	}
	s = strings.ToLower(s)
	if len(s) == 3 {
		s = string([]byte{s[0], s[0], s[1], s[1], s[2], s[2]})
	}
	if len(s) < 6 {
		return color.RGBA{}, false
	}
	v, err := strconv.ParseUint(s[:6], 16, 32)
	if err != nil {
		return color.RGBA{}, false
	}
	r, g, b := byte(v>>16), byte(v>>8), byte(v)
	a := byte(255)
	if len(s) >= 8 {
		if av, err := strconv.ParseUint(s[6:8], 16, 8); err == nil {
			a = byte(av)
		}
	}
	return color.RGBA{R: r, G: g, B: b, A: a}, true
}

func clamp01(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}

// blendOver composites src (with coverage cov in [0,1]) over dst at (x,y).
// image.RGBA stores non-premultiplied (straight) alpha.
func blendOver(dst *image.RGBA, x, y int, src color.RGBA, cov float64) {
	if cov <= 0 || src.A == 0 {
		return
	}
	if cov > 1 {
		cov = 1
	}
	sa := float64(src.A) / 255 * cov
	p := dst.PixOffset(x, y)
	da := float64(dst.Pix[p+3]) / 255
	outA := sa + da*(1-sa)
	if outA <= 0 {
		return
	}
	dst.Pix[p+0] = byte((float64(src.R)*sa + float64(dst.Pix[p+0])*da*(1-sa)) / outA)
	dst.Pix[p+1] = byte((float64(src.G)*sa + float64(dst.Pix[p+1])*da*(1-sa)) / outA)
	dst.Pix[p+2] = byte((float64(src.B)*sa + float64(dst.Pix[p+2])*da*(1-sa)) / outA)
	dst.Pix[p+3] = byte(outA * 255)
}

// rrectCoverage is the anti-aliased coverage of a rounded rectangle at a point.
func rrectCoverage(px, py, cx, cy, hw, hh, r float64) float64 {
	if r > hw {
		r = hw
	}
	if r > hh {
		r = hh
	}
	dx := math.Abs(px-cx) - (hw - r)
	dy := math.Abs(py-cy) - (hh - r)
	ax := math.Max(dx, 0)
	ay := math.Max(dy, 0)
	d := math.Hypot(ax, ay) + math.Min(math.Max(dx, dy), 0) - r
	return clamp01(0.5 - d)
}

func ellipseCoverage(px, py, cx, cy, a, b float64) float64 {
	if a <= 0 || b <= 0 {
		return 0
	}
	qx := (px - cx) / a
	qy := (py - cy) / b
	d := (math.Hypot(qx, qy) - 1) * math.Min(a, b)
	return clamp01(0.5 - d)
}

func segDistance(px, py, ax, ay, bx, by float64) float64 {
	dx, dy := bx-ax, by-ay
	l2 := dx*dx + dy*dy
	var t float64
	if l2 > 0 {
		t = ((px-ax)*dx + (py-ay)*dy) / l2
		if t < 0 {
			t = 0
		}
		if t > 1 {
			t = 1
		}
	}
	cx, cy := ax+t*dx, ay+t*dy
	return math.Hypot(px-cx, py-cy)
}

// paintBounds iterates the intersection of the given rect with img bounds.
func paintBounds(img *image.RGBA, x0, y0, x1, y1 float64, fn func(x, y int)) {
	b := img.Bounds()
	i0x, i0y := int(math.Floor(x0)), int(math.Floor(y0))
	i1x, i1y := int(math.Ceil(x1)), int(math.Ceil(y1))
	if i0x < b.Min.X {
		i0x = b.Min.X
	}
	if i0y < b.Min.Y {
		i0y = b.Min.Y
	}
	if i1x > b.Max.X {
		i1x = b.Max.X
	}
	if i1y > b.Max.Y {
		i1y = b.Max.Y
	}
	for y := i0y; y < i1y; y++ {
		for x := i0x; x < i1x; x++ {
			fn(x, y)
		}
	}
}

func drawRRect(img *image.RGBA, x0, y0, x1, y1, r float64, col color.RGBA) {
	cx, cy := (x0+x1)/2, (y0+y1)/2
	hw, hh := (x1-x0)/2, (y1-y0)/2
	paintBounds(img, x0, y0, x1, y1, func(x, y int) {
		blendOver(img, x, y, col, rrectCoverage(float64(x)+0.5, float64(y)+0.5, cx, cy, hw, hh, r))
	})
}

// strokeRRectBand paints the centered stroke band of a rounded rect.
func strokeRRectBand(img *image.RGBA, x0, y0, x1, y1, r, sw float64, col color.RGBA) {
	half := sw / 2
	ix0, iy0, ix1, iy1 := x0+half, y0+half, x1-half, y1-half
	if ix1 <= ix0 || iy1 <= iy0 {
		// Thinner than the stroke: solid fill.
		drawRRect(img, x0-half, y0-half, x1+half, y1+half, r+half, col)
		return
	}
	ir := r - half
	if ir < 0 {
		ir = 0
	}
	or := r + half
	ocx, ocy := (x0-half+x1+half)/2, (y0-half+y1+half)/2
	ohw, ohh := (x1-x0)/2+half, (y1-y0)/2+half
	icx, icy := (ix0+ix1)/2, (iy0+iy1)/2
	ihw, ihh := (ix1-ix0)/2, (iy1-iy0)/2
	paintBounds(img, x0-half, y0-half, x1+half, y1+half, func(x, y int) {
		px, py := float64(x)+0.5, float64(y)+0.5
		o := rrectCoverage(px, py, ocx, ocy, ohw, ohh, or)
		i := rrectCoverage(px, py, icx, icy, ihw, ihh, ir)
		blendOver(img, x, y, col, o-i)
	})
}

func drawEllipse(img *image.RGBA, cx, cy, a, b float64, col color.RGBA) {
	r := math.Max(a, b) + 1
	paintBounds(img, cx-r, cy-r, cx+r, cy+r, func(x, y int) {
		blendOver(img, x, y, col, ellipseCoverage(float64(x)+0.5, float64(y)+0.5, cx, cy, a, b))
	})
}

func strokeEllipse(img *image.RGBA, cx, cy, a, b, sw float64, col color.RGBA) {
	ai, bi := a-sw/2, b-sw/2
	ao, bo := a+sw/2, b+sw/2
	r := math.Max(ao, bo) + 1
	if ai <= 0 || bi <= 0 {
		paintBounds(img, cx-r, cy-r, cx+r, cy+r, func(x, y int) {
			blendOver(img, x, y, col, ellipseCoverage(float64(x)+0.5, float64(y)+0.5, cx, cy, ao, bo))
		})
		return
	}
	paintBounds(img, cx-r, cy-r, cx+r, cy+r, func(x, y int) {
		px, py := float64(x)+0.5, float64(y)+0.5
		o := ellipseCoverage(px, py, cx, cy, ao, bo)
		i := ellipseCoverage(px, py, cx, cy, ai, bi)
		blendOver(img, x, y, col, o-i)
	})
}

func drawLine(img *image.RGBA, ax, ay, bx, by, sw float64, col color.RGBA) {
	r := sw / 2
	x0, y0 := math.Min(ax, bx)-r-1, math.Min(ay, by)-r-1
	x1, y1 := math.Max(ax, bx)+r+1, math.Max(ay, by)+r+1
	paintBounds(img, x0, y0, x1, y1, func(x, y int) {
		d := segDistance(float64(x)+0.5, float64(y)+0.5, ax, ay, bx, by)
		blendOver(img, x, y, col, 0.5-(d-r))
	})
}

func measureString(face xfont.Face, s string) float64 {
	var w float64
	for _, r := range s {
		adv, ok := face.GlyphAdvance(r)
		if !ok {
			continue
		}
		w += float64(adv) / 64
	}
	return w
}

// drawText renders text into a node's local canvas. (pad,pad) is the node
// origin in canvas coordinates.
func drawText(img *image.RGBA, n Node, pad float64) {
	t := n.Text
	if t == nil || t.FontSize < 1 {
		return
	}
	col, ok := ParseColor(t.Color)
	if !ok {
		col = color.RGBA{255, 255, 255, 255}
	}
	face, err := faceFor(t.FontSize, t.FontWeight)
	if err != nil {
		return
	}
	metrics := face.Metrics()
	lineHeight := t.FontSize * 1.3

	lines := strings.Split(t.Content, "\n")
	for len(lines) > 0 && lines[len(lines)-1] == "" {
		lines = lines[:len(lines)-1]
	}
	if len(lines) == 0 {
		return
	}

	maxW := 0.0
	for _, ln := range lines {
		if w := measureString(face, ln); w > maxW {
			maxW = w
		}
	}

	ox := pad
	switch t.Align {
	case AlignCenter:
		ox = pad + (n.Width-maxW)/2
	case AlignRight:
		ox = pad + (n.Width - maxW)
	}

	baselineY := pad + float64(metrics.Ascent)/64
	for _, ln := range lines {
		if ln != "" {
			d := xfont.Drawer{
				Dst:  img,
				Src:  image.NewUniform(col),
				Face: face,
				Dot:  fixed.P(int(math.Round(ox)), int(math.Round(baselineY))),
			}
			d.DrawString(ln)
		}
		baselineY += lineHeight
	}
}

// clipToBox zeroes alpha outside the node box [pad, pad+w) x [pad, pad+h).
func clipToBox(img *image.RGBA, pad, w, h float64) {
	b := img.Bounds()
	x1, y1 := int(math.Ceil(pad+w)), int(math.Ceil(pad+h))
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			if x < int(pad) || x >= x1 || y < int(pad) || y >= y1 {
				p := img.PixOffset(x, y)
				img.Pix[p+3] = 0
			}
		}
	}
}

// nodeCanvas renders one node's own geometry (frame children excluded)
// into a padded RGBA canvas. Returns the canvas and the padding.
func nodeCanvas(n Node) (*image.RGBA, float64) {
	sw := 0.0
	if n.Stroke != nil && n.Stroke.Width > 0 {
		sw = n.Stroke.Width
	}
	pad := math.Ceil(sw/2) + 2
	w := int(math.Ceil(n.Width)) + int(pad*2)
	h := int(math.Ceil(n.Height)) + int(pad*2)
	if w < 1 {
		w = 1
	}
	if h < 1 {
		h = 1
	}
	img := image.NewRGBA(image.Rect(0, 0, w, h))

	fillCol, hasFill := color.RGBA{}, false
	if n.Fill != nil {
		if c, ok := ParseColor(*n.Fill); ok {
			fillCol, hasFill = c, true
		}
	}
	strokeCol, hasStroke := color.RGBA{}, false
	if n.Stroke != nil && n.Stroke.Width > 0 {
		if c, ok := ParseColor(n.Stroke.Color); ok {
			strokeCol, hasStroke = c, true
		}
	}

	switch n.Type {
	case NodeFrame, NodeRect:
		if hasFill {
			drawRRect(img, pad, pad, pad+n.Width, pad+n.Height, n.CornerRadius, fillCol)
		}
		if hasStroke {
			strokeRRectBand(img, pad, pad, pad+n.Width, pad+n.Height, n.CornerRadius, n.Stroke.Width, strokeCol)
		}
	case NodeEllipse:
		cx, cy := pad+n.Width/2, pad+n.Height/2
		if hasFill {
			drawEllipse(img, cx, cy, n.Width/2, n.Height/2, fillCol)
		}
		if hasStroke {
			strokeEllipse(img, cx, cy, n.Width/2, n.Height/2, n.Stroke.Width, strokeCol)
		}
	case NodeLine:
		x0, y0, x1, y1 := pad, pad, pad+n.Width, pad+n.Height
		if n.Flip {
			x0, x1 = x1, x0
		}
		col := strokeCol
		if !hasStroke {
			col = color.RGBA{255, 255, 255, 255}
		}
		sw := n.Stroke.Width
		if sw <= 0 {
			sw = 2
		}
		drawLine(img, x0, y0, x1, y1, sw, col)
	case NodeText:
		drawText(img, n, pad)
		clipToBox(img, pad, n.Width, n.Height)
	}
	return img, pad
}

func sampleBilinear(src *image.RGBA, x, y float64) color.RGBA {
	b := src.Bounds()
	if x < 0 || y < 0 || x >= float64(b.Dx()) || y >= float64(b.Dy()) {
		return color.RGBA{}
	}
	x0 := int(math.Floor(x))
	y0 := int(math.Floor(y))
	fx, fy := x-float64(x0), y-float64(y0)
	if x0+1 >= b.Dx() {
		x0--
		fx = 1
	}
	if y0+1 >= b.Dy() {
		y0--
		fy = 1
	}
	if x0 < 0 || y0 < 0 {
		return color.RGBA{}
	}
	c00 := src.RGBAAt(b.Min.X+x0, b.Min.Y+y0)
	c10 := src.RGBAAt(b.Min.X+x0+1, b.Min.Y+y0)
	c01 := src.RGBAAt(b.Min.X+x0, b.Min.Y+y0+1)
	c11 := src.RGBAAt(b.Min.X+x0+1, b.Min.Y+y0+1)
	mix := func(a, b2 byte, t float64) byte {
		return byte(float64(a) + (float64(b2)-float64(a))*t)
	}
	return color.RGBA{
		R: mix(mix(c00.R, c10.R, fx), mix(c01.R, c11.R, fx), fy),
		G: mix(mix(c00.G, c10.G, fx), mix(c01.G, c11.G, fx), fy),
		B: mix(mix(c00.B, c10.B, fx), mix(c01.B, c11.B, fx), fy),
		A: mix(mix(c00.A, c10.A, fx), mix(c01.A, c11.A, fx), fy),
	}
}

// compositeFlat blots a node canvas onto dst at (ox,oy) without rotation.
func compositeFlat(dst *image.RGBA, src *image.RGBA, ox, oy, opacity float64) {
	if opacity <= 0 {
		return
	}
	if opacity > 1 {
		opacity = 1
	}
	iox, ioy := int(math.Round(ox)), int(math.Round(oy))
	db := dst.Bounds()
	sb := src.Bounds()
	x0, y0 := iox, ioy
	x1, y1 := iox+sb.Dx(), ioy+sb.Dy()
	if x0 < db.Min.X {
		x0 = db.Min.X
	}
	if y0 < db.Min.Y {
		y0 = db.Min.Y
	}
	if x1 > db.Max.X {
		x1 = db.Max.X
	}
	if y1 > db.Max.Y {
		y1 = db.Max.Y
	}
	for y := y0; y < y1; y++ {
		for x := x0; x < x1; x++ {
			col := src.RGBAAt(x-iox, y-ioy)
			if col.A > 0 {
				col.A = byte(float64(col.A) * opacity)
				blendOver(dst, x, y, col, 1)
			}
		}
	}
}

// compositeNode blots a node canvas at (ox,oy), rotating around (cx,cy)
// by angleDeg and applying opacity (bilinear sampling).
func compositeNode(dst *image.RGBA, src *image.RGBA, ox, oy, cx, cy, angleDeg, opacity float64) {
	if opacity <= 0 {
		return
	}
	if opacity > 1 {
		opacity = 1
	}
	sx, sy := float64(src.Rect.Dx())+0.5, float64(src.Rect.Dy())+0.5
	sxc, syc := float64(src.Rect.Dx())/2, float64(src.Rect.Dy())/2
	ang := angleDeg * math.Pi / 180
	ca, sa := math.Cos(ang), math.Sin(ang)

	minX, minY, maxX, maxY := math.Inf(1), math.Inf(1), math.Inf(-1), math.Inf(-1)
	for _, c := range [][2]float64{{ox, oy}, {ox + sx, oy}, {ox + sx, oy + sy}, {ox, oy + sy}} {
		dx, dy := c[0]-cx, c[1]-cy
		rx := cx + dx*ca - dy*sa
		ry := cy + dx*sa + dy*ca
		if rx < minX {
			minX = rx
		}
		if ry < minY {
			minY = ry
		}
		if rx > maxX {
			maxX = rx
		}
		if ry > maxY {
			maxY = ry
		}
	}
	db := dst.Bounds()
	x0, y0 := int(math.Floor(minX)), int(math.Floor(minY))
	x1, y1 := int(math.Ceil(maxX)), int(math.Ceil(maxY))
	if x0 < db.Min.X {
		x0 = db.Min.X
	}
	if y0 < db.Min.Y {
		y0 = db.Min.Y
	}
	if x1 > db.Max.X {
		x1 = db.Max.X
	}
	if y1 > db.Max.Y {
		y1 = db.Max.Y
	}
	if x1 <= x0 || y1 <= y0 {
		return
	}

	for y := y0; y < y1; y++ {
		for x := x0; x < x1; x++ {
			dx, dy := float64(x)+0.5-cx, float64(y)+0.5-cy
			ux := dx*ca + dy*sa
			uy := -dx*sa + dy*ca
			col := sampleBilinear(src, ux+sxc, uy+syc)
			if col.A > 0 {
				col.A = byte(float64(col.A) * opacity)
				blendOver(dst, x, y, col, 1)
			}
		}
	}
}

func renderTree(img *image.RGBA, nodes []Node, ox, oy float64) {
	for i := range nodes {
		renderNode(img, &nodes[i], ox, oy)
	}
}

func renderNode(img *image.RGBA, n *Node, ox, oy float64) {
	if !n.Visible {
		return
	}
	if n.Type != NodeLine && n.Type != NodeText && (n.Width < 0.5 || n.Height < 0.5) {
		return
	}

	var children []Node
	if n.Type == NodeFrame {
		children = n.Children
		n.Children = nil
	}

	canvas, pad := nodeCanvas(*n)

	cx := ox + n.X + n.Width/2
	cy := oy + n.Y + n.Height/2

	if n.Rotation == 0 {
		compositeFlat(img, canvas, ox+n.X-pad, oy+n.Y-pad, n.Opacity)
	} else {
		compositeNode(img, canvas, ox+n.X-pad, oy+n.Y-pad, cx, cy, n.Rotation, n.Opacity)
	}

	n.Children = children
	if n.Type == NodeFrame && len(children) > 0 {
		renderTree(img, children, ox+n.X, oy+n.Y)
	}
}

func encodePNG(img image.Image) ([]byte, error) {
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// RenderScene renders one scene to a PNG at the given pixel scale
// (2 gives Retina-quality output). Scenes are rasterized at 1x and
// bilinearly upscaled, keeping SDF cost proportional to scene size.
func RenderScene(s Scene, scale float64) ([]byte, error) {
	if scale <= 0 {
		scale = 2
	}
	if scale > 4 {
		scale = 4
	}

	loW := int(math.Ceil(s.Width))
	loH := int(math.Ceil(s.Height))
	if loW < 1 || loH < 1 {
		return nil, fmt.Errorf("scene size must be positive")
	}
	if loW > 8192 || loH > 8192 {
		return nil, fmt.Errorf("scene too large (max 8192px)")
	}

	bg, ok := ParseColor(s.Background)
	if !ok {
		bg = color.RGBA{R: 23, G: 23, B: 23, A: 255}
	}
	if bg.A == 0 {
		bg.A = 255
	}

	lo := image.NewRGBA(image.Rect(0, 0, loW, loH))
	for y := 0; y < loH; y++ {
		p := lo.PixOffset(0, y)
		for x := 0; x < loW; x++ {
			lo.Pix[p+0] = bg.R
			lo.Pix[p+1] = bg.G
			lo.Pix[p+2] = bg.B
			lo.Pix[p+3] = 255
			p += 4
		}
	}
	renderTree(lo, s.Nodes, 0, 0)

	if scale == 1 {
		return encodePNG(lo)
	}

	dst := image.NewRGBA(image.Rect(0, 0, int(math.Ceil(s.Width*scale)), int(math.Ceil(s.Height*scale))))
	for y := 0; y < dst.Rect.Dy(); y++ {
		sy := (float64(y) + 0.5) / scale
		y0 := int(math.Floor(sy))
		fy := sy - float64(y0)
		for x := 0; x < dst.Rect.Dx(); x++ {
			sx := (float64(x) + 0.5) / scale
			x0 := int(math.Floor(sx))
			fx := sx - float64(x0)
			col := sampleBilinear(lo, float64(x0)+fx, float64(y0)+fy)
			col.A = 255
			dst.SetRGBA(x, y, col)
		}
	}
	return encodePNG(dst)
}
