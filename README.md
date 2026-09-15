# Shear

Shear is a golang alternative to Figma for designing UI prototypes —
dark, neutral, and nothing stays trapped in the editor.

- **Backend:** Go — a local web server that persists design documents,
  renders scenes server-side (PNG/SVG/HTML, anti-aliased shapes +
  embedded fonts) and hosts live collaboration rooms.
- **Frontend:** React + TypeScript + Tailwind + Framer Motion + Lucide,
  hosted in a webview (or any browser).
- **Design language:** near-black neutral surfaces, white as the only
  accent, soft blur/fade transitions.

## Features

- **Start page** — your recent designs as live thumbnails, one click to
  open, duplicate or delete, one button (or tile) to start a new one,
  `.shear` import lives here too
- Scenes (artboards) with their own size and background
- Frames (with phone/tablet/desktop **presets**), rectangles, ellipses,
  lines, multi-line text and **icons**
- **Icon library** — 2,495 glyphs from Lucide + Heroicons, searchable
  in the left panel; an icon lands on the canvas as a tintable vector
  object that scales without blur
- **Color variables** — a document palette; bind any fill, stroke, text
  colour or scene background to a variable and every reference updates
  when the variable changes (managed in the Colors tab, pickable from
  every colour field)
- **Multi-select** — marquee or shift-click, then move, nudge,
  duplicate or delete the whole group
- Select, move, resize (8 handles, shift = square), rotate, opacity,
  hand tool for panning, smart guides with snapping
- **Custom cursors** — Figma/Lunacy-style pointer, hand, crosshair,
  I-beam and rotation-aware resize arrows
- Layers panel: rename, show/hide, lock, drag to reorder
- Live property editing: position/size, fill, stroke, corner radius
  (per-corner on canvas), typography (size, weight, colour, alignment)
- Drop shadows, inner shadows, layer blur and background blur
- **Animations** — every object can carry several trigger→motion rules
  (`On view`, `On hover`, `On click`, `Loop`), each with its own delay,
  duration and draggable cubic-bézier easing curve
- **Preview (⇧⌘P)** — plays the scene as real DOM, exactly as it exports
- Undo / redo (⌘Z / ⇧⌘Z), duplicate (⌘D), nudge with arrow keys
- Autosave to the Go backend (JSON on disk in `data/`)

### Export — nothing stays trapped in the editor

| Format | What you get |
| --- | --- |
| `.shear` | The whole document: scenes, styles, variables, animations. Hand it to another designer, they open it. |
| PNG | One scene, rendered server-side in Go at 2×. |
| SVG | One scene as vectors, with filters, shadows and icons. |
| HTML | A self-contained page — the animations, triggers and easing curves all still run. |
| React | One scene as a dependency-free `.tsx` component. |

If the backend can't be reached, SVG / HTML / PNG transparently fall
back to the editor's own exporters.

### Work together

Press **Share → Start session**. The Go backend opens a room and you get
a link (built from the address you're actually connected through).
Whoever opens it types a name, joins **in the browser**, and lands in
the same document. Every participant gets a name and a colour; their
cursor and current selection are visible to everyone else.

Robustness: peers keep a stable identity across reconnects, documents
carry the room's revision number so stale echoes are dropped, and a
heartbeat keeps idle peers from being reaped. Transport is one
Server-Sent Events stream per peer plus small JSON posts — standard
library only, so the desktop build stays a single binary with no broker
to run.

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

### Frontend-only environments

`node scripts/dev-server.mjs` mirrors the API (documents + live
sessions + SPA hosting) with zero dependencies, so the editor runs where
the Go toolchain isn't available. Scene rendering lives in Go, so the
editor's client-side exporters cover PNG/SVG/HTML there.

## Architecture

```
main.go                 server entry (web + API)
cmd/webview/main.go     desktop shell (build tag: webview)
internal/app/
  types.go              document / scene / node model (the JSON format)
  render.go             software PNG renderer (SDF shapes, embedded Lato)
  export.go             SVG / HTML exporters
  store.go              document persistence (data/<id>.json)
  server.go             HTTP routes
  collab.go             live-session hub (SSE + JSON posts)
  fonts/                embedded TTF weights used by the renderer
scripts/
  dev-server.mjs        zero-dependency API mirror for frontend dev
  e2e-collab.mjs        two-peer wire-protocol check (CI + local)
web/                    React editor (Vite + Tailwind + Framer Motion)
  scripts/gen-icons.mjs regenerates the icon library from source SVGs
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
  "variables": [{ "id": "…", "name": "Primary", "color": "#fafafa" }],
  "scenes": [{
    "id": "…",
    "name": "Scene 1",
    "width": 1440, "height": 900,
    "background": "#171717",
    "backgroundVar": "…",            // optional variable id
    "nodes": [{
      "id": "…",
      "name": "Rectangle 1",
      "type": "frame | rect | ellipse | line | text | icon",
      "x": 0, "y": 0, "width": 100, "height": 100,
      "rotation": 0,          // degrees
      "opacity": 1,           // 0..1 (absent → 1)
      "visible": true,        // absent → true
      "locked": false,
      "fill": "#ffffff" | null,
      "fillVar": "…",                // optional variable id (strokeVar/textVar too)
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
      "icon": {               // icon only
        "svg": "<svg …>…</svg>",     // currentColor markup from the library
        "color": "#ffffff"
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
| POST   | `/api/export/svg`     | `{ "scene" }`           | `image/svg+xml`     |
| POST   | `/api/export/html`    | `{ "scene" }`           | `text/html`         |
| POST   | `/api/sessions`       | `{ "document" }`        | `{ id, url, name }` |
| GET    | `/api/sessions/{id}`  | —                       | room info           |
| GET    | `/api/sessions/{id}/events` | `?name&peer&scene` | SSE: hello, peers, presence, document |
| POST   | `/api/sessions/{id}/presence` | `{ peer, x, y, … }` | relayed      |
| POST   | `/api/sessions/{id}/document` | `{ peer, document }` | relayed + rev |

## Shortcuts

| Key            | Action                        |
| -------------- | ----------------------------- |
| `V / H / F / R / O / L / T` | Select / Hand / Frame / Rect / Ellipse / Line / Text |
| Drag empty canvas | Marquee-select (⇧ adds)    |
| `⌫` / `Delete` | Delete selection              |
| `⌘Z` / `⇧⌘Z`   | Undo / redo                   |
| `⌘D`           | Duplicate selection           |
| `⌘E`           | Export                        |
| `⇧⌘P`          | Preview                       |
| `⌘0` / `⌘1`    | Zoom to 100% / fit scene      |
| `⌘/Ctrl + scroll` | Zoom                       |
| `Space + drag` / hand tool | Pan               |
| `Shift + drag` on a corner | Square / single corner |
| `↑↓←→`         | Nudge selection (⇧ = ×10)     |
| `Esc`          | Deselect / close              |
| Double-click text | Edit text                  |

## Development notes

- `go test ./internal/app/` — renderer, model, exporters and the
  two-peer collaboration flow (writes `testdata/*.png`)
- CI runs `go vet` + `go test`, then builds the real server and runs
  `scripts/e2e-collab.mjs` against it — two simulated designers join one
  room over the wire (SSE + posts), trade edits and cursors, drop and
  reconnect. Reports land in `ci-reports/`.
- The frontend dev server proxies `/api` to `:8080`:
  `cd web && npm run dev`, then start the Go server (or
  `node scripts/dev-server.mjs`).
- Icon library: `node web/scripts/gen-icons.mjs <lucide-repo>
  <heroicons-repo>` regenerates `web/src/icons/library.ts`.
