import { useCallback, useEffect, useRef, useState } from 'react'
import type { Node, Peer, Scene, Tool } from '../types'
import { drawScene, onIconReady, screenToWorld, worldToScreen, type Viewport } from '../render'
import { clamp, defaultCornerRadii, makeNode, nextName, round1 } from '../utils'
import { PresenceLayer } from './Presence'
import {
  CURSOR_CROSSHAIR,
  CURSOR_GRABBING,
  CURSOR_HAND,
  CURSOR_MOVE,
  CURSOR_ROTATE,
  CURSOR_TEXT,
  resizeCursor,
} from '../cursors'

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
const HANDLES: { id: HandleId; fx: number; fy: number }[] = [
  { id: 'nw', fx: 0, fy: 0 },
  { id: 'n', fx: 0.5, fy: 0 },
  { id: 'ne', fx: 1, fy: 0 },
  { id: 'e', fx: 1, fy: 0.5 },
  { id: 'se', fx: 1, fy: 1 },
  { id: 's', fx: 0.5, fy: 1 },
  { id: 'sw', fx: 0, fy: 1 },
  { id: 'w', fx: 0, fy: 0.5 },
]

function handleWorld(n: Node, world: Mat, h: { fx: number; fy: number }): { x: number; y: number } {
  return applyMat(world, n.width * h.fx, n.height * h.fy)
}

interface Props {
  scene: Scene
  tool: Tool
  selectionIds: string[]
  editingId: string | null
  viewport: Viewport
  onViewport: (vp: Viewport) => void
  select: (ids: string[]) => void
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
  /** Icon stamp armed from the library: a ghost rides the cursor until placed. */
  stamp?: { svg: string; color: string } | null
  onPlaceStamp?: (x: number, y: number) => void
  /** Editor builds the drawn node (shape variants live there). */
  createDrawn?: (kind: 'rect' | 'ellipse' | 'line', x0: number, y0: number, x1: number, y1: number) => void
  lockAspect?: boolean
}

interface DragState {
  kind: 'move' | 'resize' | 'draw' | 'pan' | 'rotate' | 'corner' | 'marquee'
  startWorld: { x: number; y: number }
  startClient: { x: number; y: number }
  startPan?: { x: number; y: number }
  handle?: HandleId
  corner?: CornerId
  startRotation?: number
  startRadii?: { tl: number; tr: number; br: number; bl: number; linked: boolean }
  drawTool?: 'rect' | 'ellipse' | 'line'
  nodeStart?: { x: number; y: number; w: number; h: number; flip: boolean; rotation?: number }
  /** move drags carry the starting box of every selected node */
  groupStart?: Map<string, { x: number; y: number }>
  shift?: boolean
}

export function CanvasView(props: Props) {
  const { scene, tool, selectionIds, editingId, viewport, onViewport } = props
  const selectionId = selectionIds.length > 0 ? selectionIds[selectionIds.length - 1] : null
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [preview, setPreview] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const [guides, setGuides] = useState<{ x?: number[]; y?: number[] }>({})
  const [menu, setMenu] = useState<{ sx: number; sy: number; wx: number; wy: number; nodeId: string | null } | null>(null)
  const [spaceDown, setSpaceDown] = useState(false)
  const [stampAt, setStampAt] = useState<{ x: number; y: number } | null>(null)
  const stampRef = useRef(props.stamp ?? null)
  stampRef.current = props.stamp ?? null
  const placeStampRef = useRef(props.onPlaceStamp)
  placeStampRef.current = props.onPlaceStamp
  const createDrawnRef = useRef(props.createDrawn)
  createDrawnRef.current = props.createDrawn
  const lockAspectRef = useRef(!!props.lockAspect)
  lockAspectRef.current = !!props.lockAspect
  // repaints once a lazily-decoded icon glyph arrives
  const [, forceRepaint] = useState(0)
  const dragRef = useRef<DragState | null>(null)
  const gestureDirty = useRef(false)
  const editingTextRef = useRef<string | null>(null)
  editingTextRef.current = editingId

  useEffect(() => onIconReady(() => forceRepaint((v) => v + 1)), [])

  // ---- viewport helpers ----
  const fitView = useCallback(() => {
    const el = wrapRef.current
    if (!el) return
    const { width: vw, height: vh } = el.getBoundingClientRect()
    const pad = 72
    const zoom = clamp(Math.min((vw - pad * 2) / scene.width, (vh - pad * 2) / scene.height), 0.05, 4)
    onViewport({ zoom, panX: (vw - scene.width * zoom) / 2, panY: (vh - scene.height * zoom) / 2 })
  }, [scene.width, scene.height, onViewport])

  useEffect(() => {
    fitView()
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    ctx.fillStyle = '#1b1b1b'
    ctx.fillRect(0, 0, w, h)
    ctx.translate(viewport.panX, viewport.panY)
    ctx.scale(viewport.zoom, viewport.zoom)

    drawScene(ctx, visibleScene)

    // selection overlay
    if (selectionIds.length > 0) {
      const worlds = nodeWorlds(scene.nodes)
      const selected = worlds.filter((x) => selectionIds.includes(x.node.id))
      const primary = selected[selected.length - 1]
      for (const hit of selected) {
        const { node, world } = hit
        const pts = [
          applyMat(world, 0, 0),
          applyMat(world, node.width, 0),
          applyMat(world, node.width, node.height),
          applyMat(world, 0, node.height),
        ]
        ctx.save()
        ctx.strokeStyle = 'rgba(45, 125, 255, 0.95)'
        ctx.lineWidth = 1.25 / viewport.zoom
        ctx.beginPath()
        ctx.moveTo(pts[0].x, pts[0].y)
        for (const pt of pts.slice(1)) ctx.lineTo(pt.x, pt.y)
        ctx.closePath()
        ctx.stroke()
        ctx.restore()
      }
      // handles + corner-radius dots only when exactly one node is selected
      if (selectionIds.length === 1 && primary) {
        const { node, world } = primary
        ctx.save()
        const hs = 7 / viewport.zoom
        for (const hd of HANDLES) {
          const hp = handleWorld(node, world, hd)
          ctx.fillStyle = '#ffffff'
          ctx.strokeStyle = 'rgba(18,18,18,0.9)'
          ctx.lineWidth = 1 / viewport.zoom
          ctx.beginPath()
          ctx.rect(hp.x - hs / 2, hp.y - hs / 2, hs, hs)
          ctx.fill()
          ctx.stroke()
        }
        if (node.type === 'rect' && node.width > 20 && node.height > 20) {
          const rs = cornerRadii(node)
          const cornerPts = [
            { id: 'tl', x: cornerInset(rs.tl), y: cornerInset(rs.tl) },
            { id: 'tr', x: node.width - cornerInset(rs.tr), y: cornerInset(rs.tr) },
            { id: 'br', x: node.width - cornerInset(rs.br), y: node.height - cornerInset(rs.br) },
            { id: 'bl', x: cornerInset(rs.bl), y: node.height - cornerInset(rs.bl) },
          ] as const
          for (const cp of cornerPts) {
            const p = applyMat(world, cp.x, cp.y)
            ctx.beginPath()
            ctx.arc(p.x, p.y, 5 / viewport.zoom, 0, Math.PI * 2)
            ctx.fillStyle = '#2d7dff'
            ctx.strokeStyle = '#0e0e0e'
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
      ctx.strokeStyle = 'rgba(45, 125, 255, 0.9)'
      ctx.lineWidth = 1 / viewport.zoom
      ctx.setLineDash([6 / viewport.zoom, 3 / viewport.zoom])
      for (const x of guides.x ?? []) { ctx.beginPath(); ctx.moveTo(x, -100000); ctx.lineTo(x, 100000); ctx.stroke() }
      for (const y of guides.y ?? []) { ctx.beginPath(); ctx.moveTo(-100000, y); ctx.lineTo(100000, y); ctx.stroke() }
      ctx.restore()
    }

    // draw preview (while drawing shapes) or the marquee rectangle
    if (preview) {
      ctx.save()
      const x = Math.min(preview.x0, preview.x1)
      const y = Math.min(preview.y0, preview.y1)
      const wdt = Math.abs(preview.x1 - preview.x0)
      const hgt = Math.abs(preview.y1 - preview.y0)
      if (dragRef.current?.kind === 'marquee') {
        ctx.fillStyle = 'rgba(45, 125, 255, 0.08)'
        ctx.strokeStyle = 'rgba(45, 125, 255, 0.8)'
        ctx.lineWidth = 1 / viewport.zoom
        ctx.fillRect(x, y, wdt, hgt)
        ctx.strokeRect(x, y, wdt, hgt)
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.75)'
        ctx.lineWidth = 1.25 / viewport.zoom
        ctx.setLineDash([4 / viewport.zoom, 3 / viewport.zoom])
        if (tool === 'line') {
          ctx.beginPath()
          ctx.moveTo(preview.x0, preview.y0)
          ctx.lineTo(preview.x1, preview.y1)
          ctx.stroke()
        } else {
          ctx.strokeRect(x, y, wdt, hgt)
        }
      }
      ctx.restore()
    }

    // size badge under the selection, like Lunacy's blue pill
    if (selectionIds.length > 0) {
      const worlds = nodeWorlds(scene.nodes).filter((x) => selectionIds.includes(x.node.id))
      if (worlds.length) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
        for (const { node, world } of worlds) {
          for (const cp of [applyMat(world, 0, 0), applyMat(world, node.width, 0), applyMat(world, node.width, node.height), applyMat(world, 0, node.height)]) {
            x0 = Math.min(x0, cp.x); y0 = Math.min(y0, cp.y); x1 = Math.max(x1, cp.x); y1 = Math.max(y1, cp.y)
          }
        }
        const sx0 = x0 * viewport.zoom + viewport.panX
        const sy1 = y1 * viewport.zoom + viewport.panY
        const label = `${Math.round(x1 - x0)} × ${Math.round(y1 - y0)}`
        ctx.font = '600 10px Inter, sans-serif'
        const tw = ctx.measureText(label).width
        const bw = tw + 14
        const bh = 18
        const bx = sx0 + ((x1 - x0) * viewport.zoom) / 2 - bw / 2
        const by = sy1 + 10
        ctx.fillStyle = '#2d7dff'
        ctx.beginPath()
        ctx.roundRect(bx, by, bw, bh, 4)
        ctx.fill()
        ctx.fillStyle = '#ffffff'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(label, bx + bw / 2, by + bh / 2 + 0.5)
        ctx.textAlign = 'left'
      }
    }

    // rulers, screen space, like Lunacy's default view
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const R = 20
    ctx.fillStyle = '#202020'
    ctx.fillRect(0, 0, w, R)
    ctx.fillRect(0, 0, R, h)
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(0, R + 0.5); ctx.lineTo(w, R + 0.5); ctx.moveTo(R + 0.5, 0); ctx.lineTo(R + 0.5, h); ctx.stroke()
    const step = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000].find((st) => st * viewport.zoom >= 48) ?? 2000
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.font = '8px Inter, sans-serif'
    ctx.textBaseline = 'top'
    const wx0 = Math.floor((-viewport.panX) / viewport.zoom / step) * step
    const wx1 = Math.ceil((w - viewport.panX) / viewport.zoom / step) * step
    for (let x = wx0; x <= wx1; x += step) {
      const sx = x * viewport.zoom + viewport.panX
      ctx.fillRect(sx, R - 5, 1, 5)
      ctx.fillText(String(x), sx + 3, 4)
    }
    const wy0 = Math.floor((-viewport.panY) / viewport.zoom / step) * step
    const wy1 = Math.ceil((h - viewport.panY) / viewport.zoom / step) * step
    for (let y = wy0; y <= wy1; y += step) {
      const sy = y * viewport.zoom + viewport.panY
      ctx.fillRect(R - 5, sy, 5, 1)
      ctx.save(); ctx.translate(4, sy + 3); ctx.rotate(Math.PI / 2); ctx.fillText(String(y), 0, 0); ctx.restore()
    }
  }, [scene, selectionIds, viewport, preview, tool, guides])

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
        const zoom = clamp(viewport.zoom * factor, 0.05, 4)
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
    if (selectionIds.length !== 1 || !selectionId) return null
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
    if (selectionIds.length !== 1) return false
    const hit = selectedWorld()
    if (!hit) return false
    const lp = applyMat(invert(hit.world), wpt.x, wpt.y)
    const pad = 16 / viewport.zoom
    const nearX = lp.x >= -pad && lp.x <= hit.node.width + pad
    const nearY = lp.y >= -pad && lp.y <= hit.node.height + pad
    const inside = lp.x >= 0 && lp.x <= hit.node.width && lp.y >= 0 && lp.y <= hit.node.height
    return nearX && nearY && !inside
  }

  const cornerInset = (r: number) => Math.max(r, 14 / viewport.zoom)

  const cornerHit = (wpt: { x: number; y: number }): CornerId | null => {
    if (selectionIds.length !== 1) return null
    const hit = selectedWorld()
    if (!hit || hit.node.type !== 'rect') return null
    const rs = cornerRadii(hit.node)
    const pts: { id: CornerId; x: number; y: number }[] = [
      { id: 'tl', x: cornerInset(rs.tl), y: cornerInset(rs.tl) },
      { id: 'tr', x: hit.node.width - cornerInset(rs.tr), y: cornerInset(rs.tr) },
      { id: 'br', x: hit.node.width - cornerInset(rs.br), y: hit.node.height - cornerInset(rs.br) },
      { id: 'bl', x: cornerInset(rs.bl), y: hit.node.height - cornerInset(rs.bl) },
    ]
    const r = 8 / viewport.zoom
    for (const c of pts) {
      const p = applyMat(hit.world, c.x, c.y)
      if (Math.hypot(p.x - wpt.x, p.y - wpt.y) <= r) return c.id
    }
    return null
  }

  const CORNER_TO_HANDLE: Record<CornerId, HandleId> = { tl: 'nw', tr: 'ne', br: 'se', bl: 'sw' }

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && (spaceDown || tool === 'hand'))) {
      dragRef.current = {
        kind: 'pan',
        startWorld: { x: 0, y: 0 },
        startClient: { x: e.clientX, y: e.clientY },
        startPan: { x: viewport.panX, y: viewport.panY },
      }
      if (canvasRef.current) canvasRef.current.style.cursor = CURSOR_GRABBING
      e.preventDefault()
      return
    }
    setMenu(null)
    if (e.button !== 0) return

    const wpt = toWorld(e)

    if (stampRef.current && placeStampRef.current) {
      placeStampRef.current(wpt.x, wpt.y)
      return
    }

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
            startRadii: cornerRadii(n),
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
        // Shift toggles membership; otherwise clicking outside the current
        // selection replaces it, inside keeps the whole group.
        if (e.shiftKey) {
          const next = selectionIds.includes(target.id)
            ? selectionIds.filter((id) => id !== target.id)
            : [...selectionIds, target.id]
          props.select(next)
          return
        }
        if (!selectionIds.includes(target.id)) props.select([target.id])
        if (!target.locked) {
          props.gestureBegin()
          gestureDirty.current = false
          const groupStart = new Map<string, { x: number; y: number }>()
          const ids = selectionIds.includes(target.id) ? selectionIds : [target.id]
          for (const id of ids) {
            const n = findAny(scene.nodes, id)
            if (n && !n.locked) groupStart.set(id, { x: n.x, y: n.y })
          }
          dragRef.current = {
            kind: 'move',
            startWorld: wpt,
            startClient: { x: e.clientX, y: e.clientY },
            groupStart,
            nodeStart: { x: target.x, y: target.y, w: target.width, h: target.height, flip: !!target.flip },
          }
        }
      } else {
        // empty pasteboard: start a marquee; a plain click clears
        dragRef.current = {
          kind: 'marquee',
          startWorld: wpt,
          startClient: { x: e.clientX, y: e.clientY },
          shift: e.shiftKey,
        }
        setPreview({ x0: wpt.x, y0: wpt.y, x1: wpt.x, y1: wpt.y })
      }
      return
    }

    if (tool === 'text') {
      const n = makeNode('text', wpt.x, wpt.y, 200, 32)
      n.name = nextName(scene.nodes, 'text')
      props.addNode(n)
      props.select([n.id])
      props.onToolDone()
      props.startTextEdit(n.id)
      return
    }

    // drawing tools: rect / ellipse / line
    if (tool !== 'rect' && tool !== 'ellipse' && tool !== 'line') return
    props.gestureBegin()
    gestureDirty.current = false
    dragRef.current = {
      kind: 'draw',
      startWorld: wpt,
      startClient: { x: e.clientX, y: e.clientY },
      drawTool: tool as DragState['drawTool'],
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
        // hover cursor / stamp ghost
        if (canvas && !spaceDown) {
          const rect = canvas.getBoundingClientRect()
          const wpt = screenToWorld(viewport, e.clientX - rect.left, e.clientY - rect.top)
          canvas.style.cursor = hoverCursor(wpt)
        }
        if (stampRef.current && wrapRef.current) {
          const wr = wrapRef.current.getBoundingClientRect()
          setStampAt({ x: e.clientX - wr.left, y: e.clientY - wr.top })
        } else if (stampAt) {
          setStampAt(null)
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

      if (drag.kind === 'marquee') {
        setPreview({ x0: drag.startWorld.x, y0: drag.startWorld.y, x1: wpt.x, y1: wpt.y })
        return
      }

      if (drag.kind === 'move' && drag.groupStart) {
        const dx = wpt.x - drag.startWorld.x
        const dy = wpt.y - drag.startWorld.y
        // snap using the primary node's box
        let snapped = { x: 0, y: 0, guides: {} as { x?: number[]; y?: number[] } }
        let anchored = false
        props.mutate(
          (nodes) => {
            for (const [id, start] of drag.groupStart!) {
              const n = findAny(nodes, id)
              if (!n) continue
              const parent = findParent(nodes, id)
              const pMat = parent ? nodeMat(parent) : IDENTITY
              const ldx = pMat.a * dx + pMat.b * dy
              const ldy = pMat.c * dx + pMat.d * dy
              if (!anchored && drag.nodeStart) {
                const s = snapRectToGuides(
                  { x: start.x + ldx, y: start.y + ldy, w: drag.nodeStart.w, h: drag.nodeStart.h },
                  scene,
                  [...drag.groupStart!.keys()],
                  viewport,
                )
                snapped = { x: s.x - start.x, y: s.y - start.y, guides: s.guides }
                anchored = true
              }
              n.x = start.x + snapped.x
              n.y = start.y + snapped.y
            }
          },
          false,
        )
        setGuides(snapped.guides)
        gestureDirty.current = true
        return
      }

      if (drag.kind === 'resize' && drag.handle && drag.nodeStart) {
        const id = selectionId
        if (!id) return
        const n0 = drag.nodeStart
        const shift = e.shiftKey
        const dx = wpt.x - drag.startWorld.x
        const dy = wpt.y - drag.startWorld.y
        const parent = findParent(scene.nodes, id)
        const pMat = parent ? nodeMat(parent) : IDENTITY
        const ldx = pMat.a * dx + pMat.b * dy
        const ldy = pMat.c * dx + pMat.d * dy

        let { x, y, w, h, flip } = { x: n0.x, y: n0.y, w: n0.w, h: n0.h, flip: n0.flip }
        const hd = drag.handle
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
        // Shift makes W and H equal while scaling a corner, the way
        // Photoshop/Figma do it — not locked to the old aspect ratio.
        if (shift && hd.length === 2) {
          const size = Math.max(Math.abs(w), Math.abs(h))
          w = size
          h = size
          if (hd.includes('w')) x = n0.x + n0.w - w
          if (hd.includes('n')) y = n0.y + n0.h - h
        }
        if (lockAspectRef.current && hd.length === 2 && !shift && n0.h > 0) {
          const ar = n0.w / n0.h
          if (Math.abs(w) / ar > Math.abs(h)) h = (h < 0 ? -1 : 1) * (Math.abs(w) / ar)
          else w = (w < 0 ? -1 : 1) * (Math.abs(h) * ar)
          if (hd.includes('w')) x = n0.x + n0.w - w
          if (hd.includes('n')) y = n0.y + n0.h - h
        }
        // Alt anchors the resize at the centre, like Lunacy/Photoshop
        if (e.altKey) {
          x = n0.x + n0.w / 2 - w / 2
          y = n0.y + n0.h / 2 - h / 2
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
            const next = { ...cornerRadii(n), linked: !e.shiftKey }
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
        const drawTool = drag.drawTool ?? 'rect'
        const snapped = constrainDrawPoint(drawTool, drag.startWorld, wpt, e.shiftKey)
        const sg = snapPointToGuides(snapped, scene, [], viewport)
        setGuides(sg.guides)
        setPreview({ x0: drag.startWorld.x, y0: drag.startWorld.y, x1: sg.x, y1: sg.y })
      }
    }

    const onUp = (e: MouseEvent) => {
      const drag = dragRef.current
      if (!drag) return
      dragRef.current = null

      if (drag.kind === 'marquee' && preview) {
        const x0 = Math.min(preview.x0, preview.x1)
        const y0 = Math.min(preview.y0, preview.y1)
        const x1 = Math.max(preview.x0, preview.x1)
        const y1 = Math.max(preview.y0, preview.y1)
        if (x1 - x0 < 3 / viewport.zoom && y1 - y0 < 3 / viewport.zoom) {
          // it was a plain click on empty space
          props.select([])
        } else {
          const hitIds: string[] = []
          const collect = (list: Node[]) => {
            for (const n of list) {
              if (!n.visible) continue
              const overlaps = n.x < x1 && n.x + n.width > x0 && n.y < y1 && n.y + n.height > y0
              if (overlaps) hitIds.push(n.id)
              // frames: only pick the frame itself, matching Figma's
              // "select what you touch at the top level" behaviour
            }
          }
          collect(scene.nodes)
          const base = drag.shift ? selectionIds : []
          props.select([...new Set([...base, ...hitIds])])
        }
      }

      if (drag.kind === 'draw') {
        const canvas = canvasRef.current
        const drawTool = drag.drawTool ?? 'rect'
        if (canvas) {
          const rect = canvas.getBoundingClientRect()
          let wpt = screenToWorld(viewport, e.clientX - rect.left, e.clientY - rect.top)
          const x0 = drag.startWorld.x
          const y0 = drag.startWorld.y
          const constrained = constrainDrawPoint(drawTool, drag.startWorld, wpt, e.shiftKey)
          const snappedEnd = snapPointToGuides(constrained, scene, [], viewport)
          let x1 = snappedEnd.x
          let y1 = snappedEnd.y
          if (Math.abs(x1 - x0) > 0.5 || Math.abs(y1 - y0) > 0.5 || drawTool === 'line') {
            createDrawnRef.current?.(drawTool, x0, y0, x1, y1)
          }
          props.onToolDone()
        }
      } else if (drag.kind === 'move' || drag.kind === 'resize' || drag.kind === 'rotate' || drag.kind === 'corner') {
        // snap to 0.1
        props.mutate(
          (nodes) => {
            const ids = drag.kind === 'move' && drag.groupStart ? [...drag.groupStart.keys()] : selectionId ? [selectionId] : []
            for (const id of ids) {
              const n = findAny(nodes, id)
              if (n) {
                n.x = round1(n.x)
                n.y = round1(n.y)
                n.width = round1(n.width)
                n.height = round1(n.height)
              }
            }
          },
          false,
        )
      }
      if (gestureDirty.current) props.gestureEnd()
      gestureDirty.current = false
      setPreview(null)
      setGuides({})
      if (canvasRef.current && !spaceDown && tool !== 'hand') canvasRef.current.style.cursor = hoverCursor(toWorld(e))
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport, scene, selectionIds, tool, spaceDown, preview, stampAt])

  /** Figma/Lunacy-style cursor for whatever is under the pointer. */
  const hoverCursor = (wpt: { x: number; y: number }): string => {
    if (spaceDown || tool === 'hand') return CURSOR_HAND
    if (tool === 'text') return CURSOR_TEXT
    if (tool !== 'select') return CURSOR_CROSSHAIR
    const c = cornerHit(wpt)
    if (c) {
      const n = selectionId ? findAny(scene.nodes, selectionId) : null
      return resizeCursor(CORNER_TO_HANDLE[c], n?.rotation ?? 0)
    }
    const h = handleHit(wpt)
    if (h) {
      const n = selectionId ? findAny(scene.nodes, selectionId) : null
      return resizeCursor(h, n?.rotation ?? 0)
    }
    if (selectionId && rotateHit(wpt)) return CURSOR_ROTATE
    const target = hitTest(scene.nodes, wpt)
    if (target) return target.locked ? 'default' : CURSOR_MOVE
    return 'default'
  }

  const onDoubleClick = (e: React.MouseEvent) => {
    const wpt = toWorld(e)
    const hit = hitTest(scene.nodes, wpt)
    if (hit && hit.type === 'text') {
      if (!selectionIds.includes(hit.id)) props.select([hit.id])
      props.startTextEdit(hit.id)
    }
  }

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    const wpt = toWorld(e)
    const target = hitTest(scene.nodes, wpt)
    if (target && !selectionIds.includes(target.id)) props.select([target.id])
    setMenu({ sx: e.clientX, sy: e.clientY, wx: wpt.x, wy: wpt.y, nodeId: target?.id ?? null })
  }

  const contextMenu = menu ? (
    <div
      className="absolute z-30 min-w-44 overflow-hidden rounded-lg border border-white/10 bg-ink-925/95 p-1 text-[12px] text-neutral-200 shadow-2xl backdrop-blur-xl"
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
          <MenuItem onClick={() => { const n = makeNode('rect', menu.wx, menu.wy, 160, 100); n.name = nextName(scene.nodes, 'rect'); props.addNode(n); props.select([n.id]); setMenu(null) }}>Insert rectangle</MenuItem>
          <MenuItem onClick={() => { const n = makeNode('text', menu.wx, menu.wy, 200, 32); n.name = nextName(scene.nodes, 'text'); props.addNode(n); props.select([n.id]); setMenu(null) }}>Insert text</MenuItem>
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
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden bg-ink-800">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        onMouseDown={onMouseDown}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
        style={{ cursor: props.stamp ? 'none' : spaceDown || tool === 'hand' ? CURSOR_HAND : tool === 'select' ? undefined : tool === 'text' ? CURSOR_TEXT : CURSOR_CROSSHAIR }}
        onMouseLeave={() => setStampAt(null)}
      />
      {props.stamp && stampAt && (
        <div
          className="pointer-events-none absolute z-20"
          style={{ left: stampAt.x - 16, top: stampAt.y - 16, width: 32, height: 32, opacity: 0.85 }}
          dangerouslySetInnerHTML={{
            __html: props.stamp.svg
              .split('currentColor')
              .join(props.stamp.color)
              .replace('<svg', '<svg style="width:100%;height:100%;display:block" preserveAspectRatio="none"'),
          }}
        />
      )}
      {props.peers && props.peers.length > 0 && (
        <PresenceLayer peers={props.peers} viewport={viewport} scene={scene} />
      )}
      {overlay}
      {contextMenu}

    </div>
  )
}

function MenuItem({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button onClick={onClick} className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-white/10">{children}</button>
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

function flattenNodes(nodes: Node[], exceptIds: string[], out: Node[] = []): Node[] {
  for (const n of nodes) {
    if (!exceptIds.includes(n.id) && n.visible) out.push(n)
    if (n.children) flattenNodes(n.children, exceptIds, out)
  }
  return out
}

function guideTargets(scene: Scene, exceptIds: string[]) {
  const xs = [0, scene.width / 2, scene.width]
  const ys = [0, scene.height / 2, scene.height]
  for (const n of flattenNodes(scene.nodes, exceptIds)) {
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

function snapRectToGuides(rect: { x: number; y: number; w: number; h: number }, scene: Scene, exceptIds: string[], viewport: Viewport) {
  const tol = 7 / viewport.zoom
  const targets = guideTargets(scene, exceptIds)
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

function snapPointToGuides(p: { x: number; y: number }, scene: Scene, exceptIds: string[], viewport: Viewport) {
  const tol = 7 / viewport.zoom
  const targets = guideTargets(scene, exceptIds)
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

