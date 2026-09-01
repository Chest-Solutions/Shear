# Shear

Shear is a golang alternative to Figma for designing UI prototypes.

- **Backend:** Go — a local web server that persists design documents, and a
  pure-Go PNG renderer (anti-aliased shapes + embedded fonts, no JS, no
  image libraries).
- **Frontend:** React + TypeScript + Tailwind + Framer Motion + Lucide, hosted
  in a webview (or any browser).
- **Design language:** minimal, neutral-800 surfaces, white as the only
  "accent", soft blur/fade transitions.

## Features

- Scenes (artboards) with their own size and background
- Frames, rectangles, ellipses, lines, and multi-line text
- Select, move, resize (8 handles, shift = keep aspect), rotate, opacity
- Layers panel: rename, show/hide, lock, drag to reorder
- Live property editing: position/size, fill, stroke, corner radius,
  typography (size, weight, color, alignment)
- Undo / redo (⌘Z / ⇧⌘Z), duplicate (⌘D), nudge with arrow keys
- Autosave to the Go backend (JSON on disk in `data/`)
- **Export JSON** — the full design file (every scene, node, and property)
- **Export PNG** — one scene at a time, rendered server-side in Go at 2×

## Quick start

```sh
# 1. build the frontend (once)
cd web && npm ci && npm run build && cd ..

# 2. run the server (serves the app + API on :8080)
go run .
# open http://localhost:8080
```

Environment variables: `SHEAR_ADDR` (default `:8080`), `SHEAR_DATA`
(default `data/`), `SHEAR_DIST` (default `web/dist`).

### Desktop app (webview)

```sh
go build -tags webview -o shear .
./shear
```

This opens a native window (WKWebView / WebKitGTK / WebView2) with the Go
backend running in-process on a local port. The plain build is just the
server.

## Architecture

```
main.go                 server entry (web + API)
cmd/webview/main.go     desktop shell (build tag: webview)
internal/app/
  types.go              document / scene / node model (the JSON format)
  render.go             software PNG renderer (SDF shapes, embedded Lato)
  store.go              document persistence (data/<id>.json)
  server.go             HTTP routes
  fonts/                embedded TTF weights used by the renderer
web/                    React editor (Vite + Tailwind + Framer Motion)
```

### JSON document format

```jsonc
{
  "version": 1,
  "app": "shear",
  "id": "d_…",
  "name": "Untitled",
  "updatedAt": "2026-01-01T00:00:00Z",
  "selectedSceneId": "…",
  "scenes": [{
    "id": "…",
    "name": "Scene 1",
    "width": 1440, "height": 900,
    "background": "#171717",
    "nodes": [{
      "id": "…",
      "name": "Rectangle 1",
      "type": "frame | rect | ellipse | line | text",
      "x": 0, "y": 0, "width": 100, "height": 100,
      "rotation": 0,          // degrees
      "opacity": 1,           // 0..1 (absent → 1)
      "visible": true,        // absent → true
      "locked": false,
      "fill": "#ffffff" | null,
      "stroke": { "color": "#000", "width": 1 } | null,
      "cornerRadius": 0,      // rect / frame
      "flip": false,          // line: top-right → bottom-left
      "text": {               // text only
        "content": "Hi",
        "fontSize": 24,
        "fontWeight": 400,
        "color": "#ffffff",
        "align": "left | center | right"
      },
      "children": []          // frame only
    }]
  }]
}
```

### API

| Method | Path                  | Body                    | Result              |
| ------ | --------------------- | ----------------------- | ------------------- |
| GET    | `/api/health`         | —                       | status              |
| GET    | `/api/documents`      | —                       | stored documents    |
| GET    | `/api/documents/{id}` | —                       | document            |
| PUT    | `/api/documents/{id}` | document JSON           | upsert              |
| DELETE | `/api/documents/{id}` | —                       | delete              |
| POST   | `/api/export/png`     | `{ "scene", "scale" }`  | `image/png`         |

## Shortcuts

| Key            | Action                        |
| -------------- | ----------------------------- |
| `V / R / O / L / T` | Select / Rect / Ellipse / Line / Text |
| `⌫` / `Delete` | Delete selection              |
| `⌘Z` / `⇧⌘Z`   | Undo / redo                   |
| `⌘D`           | Duplicate                     |
| `⌘E`           | Export JSON                   |
| `⌘/Ctrl + scroll` | Zoom                          |
| `Space + drag` / two-finger | Pan                   |
| `Shift + drag` on a corner | Keep aspect               |
| `↑↓←→`         | Nudge (⇧ = ×10)               |
| `Esc`          | Deselect / close              |
| Double-click text | Edit text                    |

## Development notes

- `go test ./internal/app/` — renderer + model tests (writes `testdata/*.png`)
- The frontend dev server proxies `/api` to `:8080`:
  `cd web && npm run dev`, then start the Go server.
- The renderer rasterizes at 1× and bilinearly upscales, so cost stays
  proportional to scene size.
