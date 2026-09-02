package app

import (
	"encoding/json"
	"errors"
	"time"
)

// DocumentVersion is the current save format version.
const DocumentVersion = 1

// NodeType identifies what a node draws.
type NodeType string

const (
	NodeFrame   NodeType = "frame"
	NodeRect    NodeType = "rect"
	NodeEllipse NodeType = "ellipse"
	NodeLine    NodeType = "line"
	NodeText    NodeType = "text"
)

// TextAlign controls horizontal text alignment inside a text node.
type TextAlign string

const (
	AlignLeft   TextAlign = "left"
	AlignCenter TextAlign = "center"
	AlignRight  TextAlign = "right"
)

// Stroke is an optional outline applied to shapes.
type Stroke struct {
	Color string  `json:"color"`
	Width float64 `json:"width"`
}

type CornerRadii struct {
	TL     float64 `json:"tl"`
	TR     float64 `json:"tr"`
	BR     float64 `json:"br"`
	BL     float64 `json:"bl"`
	Linked bool    `json:"linked"`
}

type Effect struct {
	ID      string  `json:"id"`
	Type    string  `json:"type"`
	Visible bool    `json:"visible"`
	Color   string  `json:"color,omitempty"`
	X       float64 `json:"x,omitempty"`
	Y       float64 `json:"y,omitempty"`
	Blur    float64 `json:"blur"`
	Spread  float64 `json:"spread,omitempty"`
}

type CSSFilters struct {
	Invert     float64 `json:"invert"`
	Grayscale  float64 `json:"grayscale"`
	Sepia      float64 `json:"sepia"`
	Blur       float64 `json:"blur"`
	Brightness float64 `json:"brightness"`
	Contrast   float64 `json:"contrast"`
	Saturate   float64 `json:"saturate"`
	HueRotate  float64 `json:"hueRotate"`
}

// TextData holds the typographic properties of a text node.
type TextData struct {
	Content    string    `json:"content"`
	FontSize   float64   `json:"fontSize"`
	FontWeight int       `json:"fontWeight"`
	Color      string    `json:"color"`
	Align      TextAlign `json:"align"`
}

// Node is a single element on a scene. Frames own children; every node
// lives in its parent's coordinate space.
type Node struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Type        NodeType `json:"type"`
	X           float64 `json:"x"`
	Y           float64 `json:"y"`
	Width       float64 `json:"width"`
	Height      float64 `json:"height"`
	Rotation    float64 `json:"rotation"` // degrees, clockwise
	Opacity     float64 `json:"opacity"`
	Visible     bool    `json:"visible"`
	Locked      bool    `json:"locked"`
	Fill         *string      `json:"fill"`
	Stroke       *Stroke      `json:"stroke,omitempty"`
	CornerRadius float64      `json:"cornerRadius,omitempty"`
	CornerRadii  *CornerRadii `json:"cornerRadii,omitempty"`
	Effects      []Effect     `json:"effects,omitempty"`
	Filters      *CSSFilters  `json:"filters,omitempty"`
	// Flip is line-only: true draws top-right to bottom-left.
	Flip bool `json:"flip,omitempty"`
	// Text is text-only.
	Text *TextData `json:"text,omitempty"`
	// Children are frame-only.
	Children []Node `json:"children,omitempty"`
}

// UnmarshalJSON applies editor-friendly defaults: a missing "opacity"
// means fully opaque, a missing "visible" means visible.
func (n *Node) UnmarshalJSON(b []byte) error {
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(b, &raw); err != nil {
		return err
	}
	opacity := 1.0
	if v, ok := raw["opacity"]; ok {
		_ = json.Unmarshal(v, &opacity)
	}
	visible := true
	if v, ok := raw["visible"]; ok {
		_ = json.Unmarshal(v, &visible)
	}
	type nodeAlias Node
	var nn nodeAlias
	if err := json.Unmarshal(b, &nn); err != nil {
		return err
	}
	nn.Opacity = opacity
	nn.Visible = visible
	*n = Node(nn)
	return nil
}

// Scene is a fixed-size artboard containing a tree of nodes.
type Scene struct {
	ID         string  `json:"id"`
	Name       string  `json:"name"`
	Width      float64 `json:"width"`
	Height     float64 `json:"height"`
	Background string  `json:"background"`
	Nodes      []Node  `json:"nodes"`
}

// Document is the whole design file.
type Document struct {
	Version         int     `json:"version"`
	App             string  `json:"app"`
	ID              string  `json:"id"`
	Name            string  `json:"name"`
	UpdatedAt       string  `json:"updatedAt"`
	SelectedSceneID string  `json:"selectedSceneId"`
	Scenes          []Scene `json:"scenes"`
}

// Now returns the canonical timestamp used by the document.
func Now() string { return time.Now().UTC().Format(time.RFC3339) }

// Clone returns a deep copy of the document (safe to mutate).
func (d Document) Clone() Document {
	b, _ := json.Marshal(d)
	var out Document
	_ = json.Unmarshal(b, &out)
	return out
}

// Scene looks up a scene by id, or nil.
func (d *Document) Scene(id string) *Scene {
	for i := range d.Scenes {
		if d.Scenes[i].ID == id {
			return &d.Scenes[i]
		}
	}
	return nil
}

// CurrentScene returns the selected scene, falling back to the first one.
func (d *Document) CurrentScene() *Scene {
	if s := d.Scene(d.SelectedSceneID); s != nil {
		return s
	}
	if len(d.Scenes) > 0 {
		return &d.Scenes[0]
	}
	return nil
}

// Validate checks structural invariants of a document.
func (d *Document) Validate() error {
	if len(d.Scenes) == 0 {
		return errors.New("document has no scenes")
	}
	for i := range d.Scenes {
		s := &d.Scenes[i]
		if s.Width < 1 || s.Height < 1 {
			return errors.New("scene dimensions must be positive")
		}
		if s.Width > 20000 || s.Height > 20000 {
			return errors.New("scene too large (max 20000px)")
		}
		if err := validateNodes(s.Nodes, 0); err != nil {
			return err
		}
	}
	return nil
}

func validateNodes(nodes []Node, depth int) error {
	if depth > 64 {
		return errors.New("node tree too deep")
	}
	for i := range nodes {
		n := &nodes[i]
		switch n.Type {
		case NodeFrame, NodeRect, NodeEllipse, NodeLine, NodeText:
		default:
			return errors.New("unknown node type: " + string(n.Type))
		}
		if n.Width < 0 || n.Height < 0 {
			return errors.New("negative node size")
		}
		if n.Opacity < 0 || n.Opacity > 1 {
			return errors.New("opacity out of range")
		}
		if n.Type == NodeText && n.Text == nil {
			return errors.New("text node missing text data")
		}
		if err := validateNodes(n.Children, depth+1); err != nil {
			return err
		}
	}
	return nil
}
