import { useCallback, useEffect, useRef, useState } from 'react'
import { Maximize2, Minus, Plus } from 'lucide-react'
import type { Node, Peer, Scene, Tool } from '../types'
import { drawScene, screenToWorld, worldToScreen, type Viewport } from '../render'
import { clamp, defaultCornerRadii, makeNode, nextName, round1 } from '../utils'
import { PresenceLayer } from './Presence'

// ---- affine matrix helpers (row-major 2x3) ----
interface Mat {
  a: number
  b: number
  c: number
  d: number
  tx: number
  ty: number
}
const IDENTITY: Mat = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }

function mul(m: Mat, n: Mat): Mat {
  // m ∘ n : apply n first
  return {
    a: m.a * n.a + m.c * n.b,
    b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d,
    d: m.b * n.c + m.d * n.d,
    tx: m.a * n.tx + m.c * n.ty + m.tx,
    ty: m.b * n.tx + m.d * n.ty + m.ty,
  }
}

function applyMat(m: Mat, x: number, y: number): { x: number; y: number } {
  return { x: m.a * x + m.c * y + m.tx, y: m.b * x + m.d * y + m.ty }
}

function invert(m: Mat): Mat {
  const det = m.a * m.d - m.c * m.b || 1e-9
  const a = m.d / det
  const b = -m.b / det
  const c = -m.c / det
  const d = m.a / det
  return { a, b, c, d, tx: -(a * m.tx + c * m.ty), ty: -(b * m.tx + d * m.ty) }
}

/** Local transform of a node in its parent's space (translate + rotation around the node center). */
function nodeMat(n: Node): Mat {
  const cos = Math.cos((n.rotation * Math.PI) / 180)
  const sin = Math.sin((n.rotation * Math.PI) / 180)
  const cx = n.width / 2
  const cy = n.height / 2
  // T(x+cx,y+cy) · R · T(-cx,-cy). The old code forgot T(x,y), causing
  // selection boxes/hit handles to stay stuck at 0,0 after moving an object.
  return {
    a: cos,
    b: sin,
    c: -sin,
    d: cos,
    tx: n.x + cx - cos * cx + sin * cy,
    ty: n.y + cy - sin * cx - cos * cy,
  }
}

/** World matrices for every node in paint order. */
function nodeWorlds(nodes: Node[]): { node: Node; world: Mat }[] {
  const out: { node: Node; world: Mat }[] = []
  const walk = (list: Node[], parent: Mat) => {
    for (const n of list) {
      const world = mul(parent, nodeMat(n))
      out.push({ node: n, world })
      if (n.children) walk(n.children, world)
    }
  }
  walk(nodes, IDENTITY)
  return out
}

function hitTest(nodes: Node[], p: { x: number; y: number }): Node | null {
  const worlds = nodeWorlds(nodes)
  for (let i = worlds.length - 1; i >= 0; i--) {
    const { node, world } = worlds[i]
    if (!node.visible) continue
    const lp = applyMat(invert(world), p.x, p.y)
    if (node.type === 'line') {
      const ax = node.flip ? node.width : 0
      const ay = 0
      const bx = node.flip ? 0 : node.width
      const by = node.height
      const d = pointSegDistance(lp.x, lp.y, ax, ay, bx, by)
      if (d <= Math.max(6, (node.stroke?.width ?? 2) + 4)) return node
    } else if (lp.x >= 0 && lp.x <= node.width && lp.y >= 0 && lp.y <= node.height) return node
  }
  return null
}

type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
type CornerId = 'tl' | 'tr' | 'br' | 'bl'
const HANDLES: { id: HandleId; fx: number; fy: number; cursor: string }[] = [
  { id: 'nw', fx: 0, fy: 0, cursor: 'nwse-resize' },
  { id: 'n', fx: 0.5, fy: 0, cursor: 'ns-resize' },
  { id: 'ne', fx: 1, fy: 0, cursor: 'nesw-resize' },
  { id: 'e', fx: 1, fy: 0.5, cursor: 'ew-resize' },
  { id: 'se', fx: 1, fy: 1, cursor: 'nwse-resize' },
  { id: 's', fx: 0.5, fy: 1, cursor: 'ns-resize' },
  { id: 'sw', fx: 0, fy: 1, cursor: 'nesw-resize' },
  { id: 'w', fx: 0, fy: 0.5, cursor: 'ew-resize' },
]

function handleWorld(n: Node, world: Mat, h: { fx: number; fy: number }): { x: number; y: number } {
  return applyMat(world, n.width * h.fx, n.height * h.fy)
}

interface Props {
  scene: Scene
  tool: Tool
  selectionId: string | null
  editingId: string | null
  viewport: Viewport
  onViewport: (vp: Viewport) => void
  select: (id: string | null) => void
  /** Mutate the scene's nodes. record=false for live drag frames. */
  mutate: (fn: (nodes: Node[]) => void, record: boolean) => void
  gestureBegin: () => void
  gestureEnd: () => void
  addNode: (n: Node) => void
  startTextEdit: (id: string) => void
  liveTextEdit: (id: string, content: string) => void
  commitTextEdit: (id: string, content: string) => void
  onToolDone: () => void
  onFit: () => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
  /** Live-session extras: other designers' cursors and our own broadcast. */
  peers?: Peer[]
  onPointer?: (p: { x: number; y: number }) => void
}

export function CanvasView(props: Props) {
  const { scene, tool, selectionId, editingId, viewport, onViewport } = props
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [preview, setPreview] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const [guides, setGuides] = useState<{ x?: number[]; y?: number[] }>({})
  const [menu, setMenu] = useState<{ sx: number; sy: number; wx: number; wy: number; nodeId: string | null } | null>(null)
  const [spaceDown, setSpaceDown] = useState(false)
  const dragRef = useRef<DragState | null>(null)
  const gestureDirty = useRef(false)
  const editingTextRef = useRef<string | null>(null)
  editingTextRef.current = editingId
  const [viewSize, setViewSize] = useState({ w: 0, h: 0 })

  // ---- viewport helpers ----
  const fitView = useCallback(() => {
    const el = wrapRef.current
    if (!el) return
    const { width: vw, height: vh } = el.getBoundingClientRect()
    const pad = 72
    const zoom = clamp(Math.min((vw - pad * 2) / scene.width, (vh - pad * 2) / scene.height), 0.02, 64)
    onViewport({ zoom, panX: (vw - scene.width * zoom) / 2, panY: (vh - scene.height * zoom) / 2 })
  }, [scene.width, scene.height, onViewport])

  useEffect(() => {
    fitView()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep the backing store in sync with the wrap size. Without this the
  // scene scale looks "stuck" until the next pan/zoom because we only
  // resized the canvas when other deps changed.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      setViewSize({ w: r.width, h: r.height })
    })
    ro.observe(el)
    const r = el.getBoundingClientRect()
    setViewSize({ w: r.width, h: r.height })
    return () => ro.disconnect()
  }, [])

  // ---- drawing ----
  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const dpr = window.devicePixelRatio || 1
    const w = wrap.clientWidth
    const h = wrap.clientHeight
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    drawPasteboardGrid(ctx, w, h, viewport)
    ctx.translate(viewport.panX, viewport.panY)
    ctx.scale(viewport.zoom, viewport.zoom)

    drawScene(ctx, visibleScene)

    // selection overlay
    if (selectionId) {
      const worlds = nodeWorlds(scene.nodes)
      const hit = worlds.find((x) => x.node.id === selectionId)
      if (hit) {
        const { node, world } = hit
        const pts = [
          applyMat(world, 0, 0),
          applyMat(world, node.width, 0),
          applyMat(world, node.width, node.height),
          applyMat(world, 0, node.height),
        ]
        ctx.save()
        ctx.strokeStyle = 'rgba(82, 154, 255, 0.98)'
        ctx.lineWidth = 1.25 / viewport.zoom
        ctx.beginPath()
        ctx.moveTo(pts[0].x, pts[0].y)
        for (const pt of pts.slice(1)) ctx.lineTo(pt.x, pt.y)
        ctx.closePath()
        ctx.stroke()
        const hs = 7 / viewport.zoom
        for (const hd of HANDLES) {
          const hp = handleWorld(node, world, hd)
          ctx.fillStyle = '#ffffff'
          ctx.strokeStyle = 'rgba(23,23,23,0.9)'
          ctx.lineWidth = 1 / viewport.zoom
          ctx.beginPath()
          ctx.rect(hp.x - hs / 2, hp.y - hs / 2, hs, hs)
          ctx.fill()
          ctx.stroke()
        }
        if ((node.type === 'rect' || node.type === 'frame') && node.width > 20 && node.height > 20) {
          const rs = clampedRadii(node)
          const cornerPts = [
            { id: 'tl', x: rs.tl, y: rs.tl },
            { id: 'tr', x: node.width - rs.tr, y: rs.tr },
            { id: 'br', x: node.width - rs.br, y: node.height - rs.br },
            { id: 'bl', x: rs.bl, y: node.height - rs.bl },
          ] as const
          for (const cp of cornerPts) {
            const p = applyMat(world, cp.x, cp.y)
            ctx.beginPath()
            ctx.arc(p.x, p.y, 5 / viewport.zoom, 0, Math.PI * 2)
            ctx.fillStyle = '#2d7dff'
            ctx.strokeStyle = '#111827'
            ctx.lineWidth = 1.5 / viewport.zoom
            ctx.fill(); ctx.stroke()
          }
        }
        ctx.restore()
      }
    }

    // smart guides
    if (guides.x?.length || guides.y?.length) {
      ctx.save()
      ctx.strokeStyle = 'rgba(255, 49, 132, 0.95)'
      ctx.lineWidth = 1 / viewport.zoom
      ctx.setLineDash([6 / viewport.zoom, 3 / viewport.zoom])
      for (const x of guides.x ?? []) { ctx.beginPath(); ctx.moveTo(x, -100000); ctx.lineTo(x, 100000); ctx.stroke() }
      for (const y of guides.y ?? []) { ctx.beginPath(); ctx.moveTo(-100000, y); ctx.lineTo(100000, y); ctx.stroke() }
      ctx.restore()
    }

    // draw preview (only while actively drawing)
    if (preview) {
      ctx.save()
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'
      ctx.lineWidth = 1.25 / viewport.zoom
      ctx.setLineDash([4 / viewport.zoom, 3 / viewport.zoom])
      const x = Math.min(preview.x0, preview.x1)
      const y = Math.min(preview.y0, preview.y1)
      const wdt = Math.abs(preview.x1 - preview.x0)
      const hgt = Math.abs(preview.y1 - preview.y0)
      if (tool === 'line') {
        ctx.beginPath()
        ctx.moveTo(preview.x0, preview.y0)
        ctx.lineTo(preview.x1, preview.y1)
        ctx.stroke()
      } else {
        ctx.strokeRect(x, y, wdt, hgt)
      }
      ctx.restore()
    }
  }, [scene, selectionId, viewport, preview, tool, guides, viewSize])

  // ---- wheel (zoom / pan), non-passive ----
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        const rect = canvas.getBoundingClientRect()
        const mx = e.clientX - rect.left
        const my = e.clientY - rect.top
        const factor = Math.exp(-e.deltaY * 0.0022)
        const zoom = clamp(viewport.zoom * factor, 0.02, 64)
        const wx = (mx - viewport.panX) / viewport.zoom
        const wy = (my - viewport.panY) / viewport.zoom
        onViewport({ zoom, panX: mx - wx * zoom, panY: my - wy * zoom })
      } else {
        onViewport({ ...viewport, panX: viewport.panX - e.deltaX, panY: viewport.panY - e.deltaY })
      }
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [viewport, onViewport])

  // ---- space-to-pan ----
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target as HTMLElement).closest('input,textarea,select,[contenteditable]')) {
        setSpaceDown(true)
        e.preventDefault()
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceDown(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  // ---- pointer interactions ----
  const toWorld = (e: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return screenToWorld(viewport, e.clientX - rect.left, e.clientY - rect.top)
  }

  const handleHit = (wpt: { x: number; y: number }): HandleId | null => {
    if (!selectionId) return null
    const worlds = nodeWorlds(scene.nodes)
    const hit = worlds.find((x) => x.node.id === selectionId)
    if (!hit) return null
    const r = 8 / viewport.zoom
    for (const h of HANDLES) {
      const p = handleWorld(hit.node, hit.world, h)
      if (Math.abs(p.x - wpt.x) <= r && Math.abs(p.y - wpt.y) <= r) return h.id
    }
    return null
  }

  const selectedWorld = () => selectionId ? nodeWorlds(scene.nodes).find((x) => x.node.id === selectionId) ?? null : null

  const rotateHit = (wpt: { x: number; y: number }): boolean => {
    const hit = selectedWorld()
    if (!hit) return false
    const lp = applyMat(invert(hit.world), wpt.x, wpt.y)
    const pad = 16 / viewport.zoom
    const nearX = lp.x >= -pad && lp.x <= hit.node.width + pad
    const nearY = lp.y >= -pad && lp.y <= hit.node.height + pad
    const inside = lp.x >= 0 && lp.x <= hit.node.width && lp.y >= 0 && lp.y <= hit.node.height
    return nearX && nearY && !inside
  }

  const cornerHit = (wpt: { x: number; y: number }): CornerId | null => {
    const hit = selectedWorld()
    if (!hit || (hit.node.type !== 'rect' && hit.node.type !== 'frame')) return null
    const rs = clampedRadii(hit.node)
    const pts: { id: CornerId; x: number; y: number }[] = [
      { id: 'tl', x: rs.tl, y: rs.tl },
      { id: 'tr', x: hit.node.width - rs.tr, y: rs.tr },
      { id: 'br', x: hit.node.width - rs.br, y: hit.node.height - rs.br },
      { id: 'bl', x: rs.bl, y: hit.node.height - rs.bl },
    ]
    const r = 8 / viewport.zoom
    for (const c of pts) {
      const p = applyMat(hit.world, c.x, c.y)
      if (Math.hypot(p.x - wpt.x, p.y - wpt.y) <= r) return c.id
    }
    return null
  }

  interface DragState {
    kind: 'move' | 'resize' | 'draw' | 'pan' | 'rotate' | 'corner'
    startWorld: { x: number; y: number }
    startClient: { x: number; y: number }
    startPan?: { x: number; y: number }
    handle?: HandleId
    corner?: CornerId
    startRotation?: number
    startRadii?: { tl: number; tr: number; br: number; bl: number; linked: boolean }
    drawTool?: 'rect' | 'ellipse' | 'line'
    nodeStart?: { x: number; y: number; w: number; h: number; flip: boolean; rotation?: number }
  }

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && spaceDown)) {
      dragRef.current = {
        kind: 'pan',
        startWorld: { x: 0, y: 0 },
        startClient: { x: e.clientX, y: e.clientY },
        startPan: { x: viewport.panX, y: viewport.panY },
      }
      e.preventDefault()
      return
    }
    setMenu(null)
    if (e.button !== 0) return

    const wpt = toWorld(e)

    if (tool === 'select') {
      const corner = cornerHit(wpt)
      const handle = handleHit(wpt)
      const target = hitTest(scene.nodes, wpt)
      if (corner && selectionId) {
        const n = findAny(scene.nodes, selectionId)
        if (n) {
          props.gestureBegin()
          gestureDirty.current = false
          dragRef.current = {
            kind: 'corner',
            startWorld: wpt,
            startClient: { x: e.clientX, y: e.clientY },
            corner,
            startRadii: clampedRadii(n),
            nodeStart: { x: n.x, y: n.y, w: n.width, h: n.height, flip: !!n.flip },
          }
          return
        }
      }
      if (handle && selectionId) {
        const n = scene.nodes && findAny(scene.nodes, selectionId)
        if (n) {
          props.gestureBegin()
          gestureDirty.current = false
          dragRef.current = {
            kind: 'resize',
            startWorld: wpt,
            startClient: { x: e.clientX, y: e.clientY },
            handle,
            nodeStart: { x: n.x, y: n.y, w: n.width, h: n.height, flip: !!n.flip },
          }
          return
        }
      }
      if (selectionId && rotateHit(wpt)) {
        const n = findAny(scene.nodes, selectionId)
        if (n) {
          const hit = selectedWorld()
          const center = hit ? applyMat(hit.world, n.width / 2, n.height / 2) : applyMat(nodeMat(n), n.width / 2, n.height / 2)
          props.gestureBegin()
          gestureDirty.current = false
          dragRef.current = {
            kind: 'rotate',
            startWorld: wpt,
            startClient: { x: e.clientX, y: e.clientY },
            startRotation: angleDeg(center, wpt) - n.rotation,
            nodeStart: { x: n.x, y: n.y, w: n.width, h: n.height, flip: !!n.flip, rotation: n.rotation },
          }
          return
        }
      }
      if (target) {
        if (target.id !== selectionId) props.select(target.id)
        if (!target.locked) {
          props.gestureBegin()
          gestureDirty.current = false
          dragRef.current = {
            kind: 'move',
            startWorld: wpt,
            startClient: { x: e.clientX, y: e.clientY },
            nodeStart: { x: target.x, y: target.y, w: target.width, h: target.height, flip: !!target.flip },
          }
        }
      } else {
        props.select(null)
      }
      return
    }

    if (tool === 'text') {
      const n = makeNode('text', wpt.x, wpt.y, 200, 32)
      n.name = nextName(scene.nodes, 'text')
      props.addNode(n)
      props.select(n.id)
      props.onToolDone()
      props.startTextEdit(n.id)
      return
    }

    // drawing tools
    props.gestureBegin()
    gestureDirty.current = false
    dragRef.current = {
      kind: 'draw',
      startWorld: wpt,
      startClient: { x: e.clientX, y: e.clientY },
      drawTool: tool,
    }
    setPreview({ x0: wpt.x, y0: wpt.y, x1: wpt.x, y1: wpt.y })
  }

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const drag = dragRef.current
      const canvas = canvasRef.current
      if (canvas && props.onPointer) {
        const rect = canvas.getBoundingClientRect()
        const wp = screenToWorld(viewport, e.clientX - rect.left, e.clientY - rect.top)
        props.onPointer(wp)
      }
      if (!drag || !canvas) {
        // hover cursor
        if (canvas && !spaceDown) {
          const rect = canvas.getBoundingClientRect()
          const wpt = screenToWorld(viewport, e.clientX - rect.left, e.clientY - rect.top)
          let cursor = tool === 'select' ? 'default' : 'crosshair'
          if (tool === 'select') {
            const c = cornerHit(wpt)
            const h = handleHit(wpt)
            if (c) {
              cursor = 'cell'
            } else if (h) {
              const def = HANDLES.find((x) => x.id === h)
              cursor = def?.cursor ?? 'default'
            } else if (selectionId && rotateHit(wpt)) {
              cursor = 'grab'
            } else if (hitTest(scene.nodes, wpt)) {
              cursor = 'move'
            }
          }
          canvas.style.cursor = cursor
        }
        return
      }

      if (drag.kind === 'pan' && drag.startPan) {
        onViewport({
          zoom: viewport.zoom,
          panX: drag.startPan.x + (e.clientX - drag.startClient.x),
          panY: drag.startPan.y + (e.clientY - drag.startClient.y),
        })
        return
      }

      const wpt = toWorld(e)

      if (drag.kind === 'move' && drag.nodeStart) {
        const id = selectionId
        if (!id) return
        const dx = wpt.x - drag.startWorld.x
        const dy = wpt.y - drag.startWorld.y
        // world delta → parent-local delta (inverse of the parent rotation)
        const parent = findParent(scene.nodes, id)
        const pMat = parent ? nodeMat(parent) : IDENTITY
        const ldx = pMat.a * dx + pMat.b * dy
        const ldy = pMat.c * dx + pMat.d * dy
        const snapped = snapRectToGuides(
          { x: drag.nodeStart!.x + ldx, y: drag.nodeStart!.y + ldy, w: drag.nodeStart!.w, h: drag.nodeStart!.h },
          scene,
          id,
          viewport,
        )
        setGuides(snapped.guides)
        props.mutate(
          (nodes) => {
            const n = findAny(nodes, id)
            if (n) {
              n.x = snapped.x
              n.y = snapped.y
            }
          },
          false,
        )
        gestureDirty.current = true
        return
      }

      if (drag.kind === 'resize' && drag.handle && drag.nodeStart) {
        const id = selectionId
        if (!id) return
        const n0 = drag.nodeStart
        const shift = e.shiftKey
        // pointer in node-local space (unrotated box coordinates)
        const dx = wpt.x - drag.startWorld.x
        const dy = wpt.y - drag.startWorld.y
        const parent = findParent(scene.nodes, id)
        const pMat = parent ? nodeMat(parent) : IDENTITY
        const ldx = pMat.a * dx + pMat.b * dy
        const ldy = pMat.c * dx + pMat.d * dy

        let { x, y, w, h, flip } = { x: n0.x, y: n0.y, w: n0.w, h: n0.h, flip: n0.flip }
        const hd = drag.handle
        const alt = e.altKey
        if (alt) {
          // Scale from the center: the opposite edge moves as much as this one.
          if (hd.includes('e')) { w = n0.w + ldx * 2; x = n0.x - ldx }
          if (hd.includes('s')) { h = n0.h + ldy * 2; y = n0.y - ldy }
          if (hd.includes('w')) { w = n0.w - ldx * 2; x = n0.x + ldx }
          if (hd.includes('n')) { h = n0.h - ldy * 2; y = n0.y + ldy }
        } else {
          if (hd.includes('e')) w = n0.w + ldx
          if (hd.includes('s')) h = n0.h + ldy
          if (hd.includes('w')) {
            w = n0.w - ldx
            x = n0.x + ldx
          }
          if (hd.includes('n')) {
            h = n0.h - ldy
            y = n0.y + ldy
          }
        }
        // Photoshop/Figma-style square lock while scaling: Shift makes W and H equal,
        // not locked to the old aspect ratio.
        if (shift && hd.length === 2) {
          const size = Math.max(Math.abs(w), Math.abs(h))
          w = size
          h = size
          if (alt) {
            x = n0.x + n0.w / 2 - w / 2
            y = n0.y + n0.h / 2 - h / 2
          } else {
            if (hd.includes('w')) x = n0.x + n0.w - w
            if (hd.includes('n')) y = n0.y + n0.h - h
          }
        }
        // line: crossing the anchor flips the direction
        if (hd.includes('w') && w < 0) {
          w = -w
          x = x + w
          flip = !flip
        }
        if (hd.includes('n') && h < 0) {
          h = -h
          y = y + h
          flip = !flip
        }
        w = Math.max(n0.w === 0 ? 0 : 1, w)
        h = Math.max(n0.h === 0 ? 0 : 1, h)
        props.mutate(
          (nodes) => {
            const n = findAny(nodes, id)
            if (n) {
              n.x = x
              n.y = y
              n.width = w
              n.height = h
              if (n.type === 'line') n.flip = flip
              clampRadiiInPlace(n)
            }
          },
          false,
        )
        gestureDirty.current = true
        return
      }

      if (drag.kind === 'rotate' && selectionId && drag.startRotation !== undefined) {
        const hit = selectedWorld()
        if (!hit) return
        const center = applyMat(hit.world, hit.node.width / 2, hit.node.height / 2)
        let rot = angleDeg(center, wpt) - drag.startRotation
        if (e.shiftKey) rot = Math.round(rot / 15) * 15
        props.mutate((nodes) => {
          const n = findAny(nodes, selectionId)
          if (n) n.rotation = round1(((rot % 360) + 360) % 360)
        }, false)
        gestureDirty.current = true
        return
      }

      if (drag.kind === 'corner' && selectionId && drag.corner && drag.nodeStart) {
        const hit = selectedWorld()
        if (!hit) return
        const lp = applyMat(invert(hit.world), wpt.x, wpt.y)
        const maxR = Math.min(hit.node.width, hit.node.height) / 2
        let r = 0
        if (drag.corner === 'tl') r = Math.min(lp.x, lp.y)
        if (drag.corner === 'tr') r = Math.min(hit.node.width - lp.x, lp.y)
        if (drag.corner === 'br') r = Math.min(hit.node.width - lp.x, hit.node.height - lp.y)
        if (drag.corner === 'bl') r = Math.min(lp.x, hit.node.height - lp.y)
        r = round1(clamp(r, 0, maxR))
        props.mutate((nodes) => {
          const n = findAny(nodes, selectionId)
          if (n) {
            const next = { ...clampedRadii(n), linked: !e.shiftKey }
            if (e.shiftKey) next[drag.corner!] = r
            else next.tl = next.tr = next.br = next.bl = r
            n.cornerRadii = next
            n.cornerRadius = next.linked ? r : Math.max(next.tl, next.tr, next.br, next.bl)
          }
        }, false)
        gestureDirty.current = true
        return
      }

      if (drag.kind === 'draw') {
        const snapped = constrainDrawPoint(drag.drawTool ?? 'rect', drag.startWorld, wpt, e.shiftKey)
        const sg = snapPointToGuides(snapped, scene, null, viewport)
        setGuides(sg.guides)
        setPreview({ x0: drag.startWorld.x, y0: drag.startWorld.y, x1: sg.x, y1: sg.y })
      }
    }

    const onUp = (e: MouseEvent) => {
      const drag = dragRef.current
      if (!drag) return
      dragRef.current = null

      if (drag.kind === 'draw') {
        const canvas = canvasRef.current
        const drawTool = drag.drawTool ?? 'rect'
        if (canvas) {
          const rect = canvas.getBoundingClientRect()
          let wpt = screenToWorld(viewport, e.clientX - rect.left, e.clientY - rect.top)
          const x0 = drag.startWorld.x
          const y0 = drag.startWorld.y
          wpt = constrainDrawPoint(drawTool, drag.startWorld, wpt, e.shiftKey)
          const snappedEnd = snapPointToGuides(wpt, scene, null, viewport)
          let x1 = snappedEnd.x
          let y1 = snappedEnd.y
          if (Math.abs(x1 - x0) > 0.5 || Math.abs(y1 - y0) > 0.5 || drawTool === 'line') {
            let n: Node
            if (drawTool === 'line') {
              n = makeNode('line', 0, 0, 1, 1)
              let dx = x1 - x0
              let dy = y1 - y0
              if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
                dx = 120
                dy = 0
                x1 = x0 + dx
                y1 = y0 + dy
              }
              n.x = Math.min(x0, x1)
              n.y = Math.min(y0, y1)
              n.width = Math.abs(x1 - x0)
              n.height = Math.abs(y1 - y0)
              // Negative slope uses the alternate diagonal. This fixes all four draw directions.
              n.flip = (x1 - x0) * (y1 - y0) < 0
            } else {
              n = makeNode(drawTool, 0, 0, 1, 1)
              n.x = Math.min(x0, x1)
              n.y = Math.min(y0, y1)
              n.width = Math.max(1, Math.abs(x1 - x0))
              n.height = Math.max(1, Math.abs(y1 - y0))
            }
            n.name = nextName(scene.nodes, n.type)
            n.x = round1(n.x)
            n.y = round1(n.y)
            n.width = round1(n.width)
            n.height = round1(n.height)
            props.addNode(n)
            props.select(n.id)
          }
          props.onToolDone()
        }
      } else if (drag.kind === 'move' || drag.kind === 'resize' || drag.kind === 'rotate' || drag.kind === 'corner') {
        // snap to 0.1
        if (selectionId) {
          props.mutate(
            (nodes) => {
              const n = findAny(nodes, selectionId)
              if (n) {
                n.x = round1(n.x)
                n.y = round1(n.y)
                n.width = round1(n.width)
                n.height = round1(n.height)
              }
            },
            false,
          )
        }
      }
      if (gestureDirty.current) props.gestureEnd()
      setPreview(null)
      setGuides({})
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport, scene, selectionId, tool, spaceDown])

  const onDoubleClick = (e: React.MouseEvent) => {
    const wpt = toWorld(e)
    const hit = hitTest(scene.nodes, wpt)
    if (hit && hit.type === 'text') {
      if (hit.id !== selectionId) props.select(hit.id)
      props.startTextEdit(hit.id)
    }
  }

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    const wpt = toWorld(e)
    const target = hitTest(scene.nodes, wpt)
    if (target) props.select(target.id)
    setMenu({ sx: e.clientX, sy: e.clientY, wx: wpt.x, wy: wpt.y, nodeId: target?.id ?? null })
  }

  const contextMenu = menu ? (
    <div
      className="absolute z-30 min-w-44 overflow-hidden rounded-lg border border-white/10 bg-neutral-950/95 p-1 text-[12px] text-neutral-200 shadow-2xl backdrop-blur-xl"
      style={{ left: menu.sx - (wrapRef.current?.getBoundingClientRect().left ?? 0), top: menu.sy - (wrapRef.current?.getBoundingClientRect().top ?? 0) }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {menu.nodeId ? (
        <>
          <MenuItem onClick={() => { props.onDuplicate(menu.nodeId!); setMenu(null) }}>Duplicate</MenuItem>
          <MenuItem onClick={() => { props.onDelete(menu.nodeId!); setMenu(null) }}>Delete</MenuItem>
          <MenuItem onClick={() => { props.mutate(nodes => { const n = findAny(nodes, menu.nodeId!); if (n) n.locked = !n.locked }, true); setMenu(null) }}>Lock / unlock</MenuItem>
          <MenuItem onClick={() => { props.mutate(nodes => { const n = findAny(nodes, menu.nodeId!); if (n) n.visible = !n.visible }, true); setMenu(null) }}>Show / hide</MenuItem>
        </>
      ) : (
        <>
          <MenuItem onClick={() => { const n = makeNode('rect', menu.wx, menu.wy, 160, 100); n.name = nextName(scene.nodes, 'rect'); props.addNode(n); props.select(n.id); setMenu(null) }}>Insert rectangle</MenuItem>
          <MenuItem onClick={() => { const n = makeNode('text', menu.wx, menu.wy, 200, 32); n.name = nextName(scene.nodes, 'text'); props.addNode(n); props.select(n.id); setMenu(null) }}>Insert text</MenuItem>
          <MenuItem onClick={() => { props.onFit(); setMenu(null) }}>Fit canvas</MenuItem>
        </>
      )}
    </div>
  ) : null

  // ---- text editing overlay ----
  const editingNode = editingId ? findAny(scene.nodes, editingId) : null
  const editingParent = editingNode ? findParent(scene.nodes, editingNode.id) : null
  let overlay: React.ReactNode = null
  if (editingNode && editingNode.text) {
    const world = mul(editingParent ? nodeMat(editingParent) : IDENTITY, nodeMat(editingNode))
    const tl = applyMat(world, 0, 0)
    const sp = worldToScreen(viewport, tl.x, tl.y)
    overlay = (
      <div
        className="absolute z-10"
        style={{
          left: sp.x,
          top: sp.y,
          width: editingNode.width * viewport.zoom,
          height: editingNode.height * viewport.zoom,
          transform: `rotate(${editingNode.rotation}deg)`,
          transformOrigin: 'center',
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <textarea
          autoFocus
          value={editingNode.text.content}
          onChange={(e) => props.liveTextEdit(editingNode.id, e.target.value)}
          onBlur={() => props.commitTextEdit(editingNode.id, editingNode.text!.content)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              ;(e.target as HTMLTextAreaElement).blur()
            }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              ;(e.target as HTMLTextAreaElement).blur()
            }
            e.stopPropagation()
          }}
          spellCheck={false}
          className="h-full w-full resize-none overflow-hidden bg-transparent p-0 text-neutral-950 outline-none ring-1 ring-white"
          style={{
            fontSize: editingNode.text.fontSize * viewport.zoom,
            fontWeight: editingNode.text.fontWeight,
            color: editingNode.text.color,
            textAlign: editingNode.text.align,
            lineHeight: 1.3,
            fontFamily: 'inherit',
          }}
        />
      </div>
    )
  }

  // skip rendering the text being edited underneath the overlay
  const visibleScene = editingNode
    ? { ...scene, nodes: hideText(scene.nodes, editingNode.id) }
    : scene

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden bg-neutral-800">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        onMouseDown={onMouseDown}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
        style={{ cursor: spaceDown ? 'grab' : undefined }}
      />
      {props.peers && props.peers.length > 0 && (
        <PresenceLayer peers={props.peers} viewport={viewport} scene={scene} />
      )}
      {overlay}
      {contextMenu}

      {/* zoom controls */}
      <div className="absolute bottom-3 right-3 z-10 flex items-center gap-0.5 rounded-lg border border-white/5 bg-neutral-900/70 p-0.5 shadow-panel backdrop-blur-xl select-none">
        <ZoomBtn title="Zoom out" onClick={() => zoomBy(1 / 1.2)}>
          <Minus size={12} strokeWidth={2} />
        </ZoomBtn>
        <button
          onClick={() => {
            const el = wrapRef.current
            if (!el) return
            const { width: vw, height: vh } = el.getBoundingClientRect()
            const cx = vw / 2
            const cy = vh / 2
            const wx = (cx - viewport.panX) / viewport.zoom
            const wy = (cy - viewport.panY) / viewport.zoom
            onViewport({ zoom: 1, panX: cx - wx, panY: cy - wy })
          }}
          className="w-12 rounded-md py-1 text-center text-[11px] tabular-nums text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-100"
          title="Reset to 100%"
        >
          {Math.round(viewport.zoom * 100)}%
        </button>
        <ZoomBtn title="Zoom in" onClick={() => zoomBy(1.2)}>
          <Plus size={12} strokeWidth={2} />
        </ZoomBtn>
        <div className="mx-0.5 h-4 w-px bg-white/10" />
        <ZoomBtn title="Fit scene" onClick={props.onFit}>
          <Maximize2 size={12} strokeWidth={2} />
        </ZoomBtn>
      </div>
    </div>
  )

  function zoomBy(factor: number) {
    const el = wrapRef.current
    if (!el) return
    const { width: vw, height: vh } = el.getBoundingClientRect()
    const cx = vw / 2
    const cy = vh / 2
    const zoom = clamp(viewport.zoom * factor, 0.02, 64)
    const wx = (cx - viewport.panX) / viewport.zoom
    const wy = (cy - viewport.panY) / viewport.zoom
    onViewport({ zoom, panX: cx - wx * zoom, panY: cy - wy * zoom })
  }
}

function MenuItem({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button onClick={onClick} className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-white/10">{children}</button>
}

function ZoomBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="flex h-6 w-6 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-100"
    >
      {children}
    </button>
  )
}

// ---- node lookup helpers ----
export function findAny(nodes: Node[], id: string): Node | null {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.children) {
      const hit = findAny(n.children, id)
      if (hit) return hit
    }
  }
  return null
}

function findParent(nodes: Node[], id: string): Node | null {
  for (const n of nodes) {
    if (n.id === id) return null
    if (n.children) {
      if (n.children.some((c) => c.id === id)) return n
      const hit = findParent(n.children, id)
      if (hit) return hit
    }
  }
  return null
}

function hideText(nodes: Node[], id: string): Node[] {
  return nodes.map((n) => {
    if (n.id === id && n.type === 'text') return { ...n, text: { ...(n.text as NonNullable<Node['text']>), content: '' } }
    if (n.children) return { ...n, children: hideText(n.children, id) }
    return n
  })
}

function pointSegDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const l2 = dx * dx + dy * dy || 1
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1)
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

function angleDeg(c: { x: number; y: number }, p: { x: number; y: number }): number {
  return (Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI
}

function cornerRadii(n: Node) {
  const fallback = n.cornerRadius ?? 0
  return n.cornerRadii ? { ...defaultCornerRadii(fallback), ...n.cornerRadii } : defaultCornerRadii(fallback)
}

function flattenNodes(nodes: Node[], exceptId: string | null, out: Node[] = []): Node[] {
  for (const n of nodes) {
    if (n.id !== exceptId && n.visible) out.push(n)
    if (n.children) flattenNodes(n.children, exceptId, out)
  }
  return out
}

function guideTargets(scene: Scene, exceptId: string | null) {
  const xs = [0, scene.width / 2, scene.width]
  const ys = [0, scene.height / 2, scene.height]
  for (const n of flattenNodes(scene.nodes, exceptId)) {
    xs.push(n.x, n.x + n.width / 2, n.x + n.width)
    ys.push(n.y, n.y + n.height / 2, n.y + n.height)
  }
  return { xs, ys }
}

function snapValue(v: number, targets: number[], tolerance: number): { v: number; guide?: number } {
  let best = v
  let guide: number | undefined
  let dist = tolerance
  for (const t of targets) {
    const d = Math.abs(v - t)
    if (d <= dist) { best = t; guide = t; dist = d }
  }
  return { v: best, guide }
}

function snapRectToGuides(rect: { x: number; y: number; w: number; h: number }, scene: Scene, exceptId: string | null, viewport: Viewport) {
  const tol = 7 / viewport.zoom
  const targets = guideTargets(scene, exceptId)
  const xCandidates = [{ p: rect.x, off: 0 }, { p: rect.x + rect.w / 2, off: rect.w / 2 }, { p: rect.x + rect.w, off: rect.w }]
  const yCandidates = [{ p: rect.y, off: 0 }, { p: rect.y + rect.h / 2, off: rect.h / 2 }, { p: rect.y + rect.h, off: rect.h }]
  let x = rect.x, y = rect.y
  const guides: { x?: number[]; y?: number[] } = {}
  for (const c of xCandidates) {
    const s = snapValue(c.p, targets.xs, tol)
    if (s.guide !== undefined) { x = s.v - c.off; guides.x = [s.guide]; break }
  }
  for (const c of yCandidates) {
    const s = snapValue(c.p, targets.ys, tol)
    if (s.guide !== undefined) { y = s.v - c.off; guides.y = [s.guide]; break }
  }
  return { x, y, guides }
}

function snapPointToGuides(p: { x: number; y: number }, scene: Scene, exceptId: string | null, viewport: Viewport) {
  const tol = 7 / viewport.zoom
  const targets = guideTargets(scene, exceptId)
  const sx = snapValue(p.x, targets.xs, tol)
  const sy = snapValue(p.y, targets.ys, tol)
  return { x: sx.v, y: sy.v, guides: { x: sx.guide !== undefined ? [sx.guide] : undefined, y: sy.guide !== undefined ? [sy.guide] : undefined } }
}

function constrainDrawPoint(tool: 'rect' | 'ellipse' | 'line', start: { x: number; y: number }, p: { x: number; y: number }, shift: boolean) {
  if (!shift) return p
  const dx = p.x - start.x
  const dy = p.y - start.y
  if (tool === 'line') {
    const len = Math.hypot(dx, dy)
    if (len < 0.01) return p
    const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4)
    return { x: start.x + Math.cos(a) * len, y: start.y + Math.sin(a) * len }
  }
  const size = Math.max(Math.abs(dx), Math.abs(dy))
  return { x: start.x + Math.sign(dx || 1) * size, y: start.y + Math.sign(dy || 1) * size }
}

function drawPasteboardGrid(ctx: CanvasRenderingContext2D, w: number, h: number, viewport: Viewport) {
  ctx.save()
  ctx.fillStyle = '#262626'
  ctx.fillRect(0, 0, w, h)
  const minor = 20 * viewport.zoom
  if (minor >= 6) {
    const ox = ((viewport.panX % minor) + minor) % minor
    const oy = ((viewport.panY % minor) + minor) % minor
    ctx.fillStyle = 'rgba(255,255,255,0.10)'
    for (let x = ox; x < w; x += minor) for (let y = oy; y < h; y += minor) ctx.fillRect(Math.round(x), Math.round(y), 1, 1)
  }
  ctx.restore()
}
