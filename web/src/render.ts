import type { Node, Scene } from './types'

export interface Viewport {
  zoom: number
  panX: number
  panY: number
}

function roundedPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.lineTo(x + w - rr, y)
  ctx.arcTo(x + w, y, x + w, y + rr, rr)
  ctx.lineTo(x + w, y + h - rr)
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr)
  ctx.lineTo(x + rr, y + h)
  ctx.arcTo(x, y + h, x, y + h - rr, rr)
  ctx.lineTo(x, y + rr)
  ctx.arcTo(x, y, x + rr, y, rr)
  ctx.closePath()
}

const UI_FONT =
  "-apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, 'Segoe UI', Helvetica, Arial, sans-serif"

function drawText(ctx: CanvasRenderingContext2D, n: Node) {
  const t = n.text
  if (!t) return
  ctx.fillStyle = t.color
  ctx.font = `${t.fontWeight} ${t.fontSize}px ${UI_FONT}`
  ctx.textAlign = t.align
  ctx.textBaseline = 'top'
  const lines = t.content.split('\n')
  const lineHeight = t.fontSize * 1.3
  const x = t.align === 'left' ? 0 : t.align === 'center' ? n.width / 2 : n.width
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]) continue
    const y = i * lineHeight + (lineHeight - t.fontSize) / 2
    ctx.fillText(lines[i], x, y)
  }
}

export function drawNode(ctx: CanvasRenderingContext2D, n: Node) {
  if (!n.visible) return
  ctx.save()
  ctx.globalAlpha = n.opacity
  ctx.translate(n.x + n.width / 2, n.y + n.height / 2)
  if (n.rotation !== 0) ctx.rotate((n.rotation * Math.PI) / 180)
  ctx.translate(-n.width / 2, -n.height / 2)

  const r = n.cornerRadius ?? 0
  switch (n.type) {
    case 'rect':
    case 'frame': {
      if (n.fill) {
        roundedPath(ctx, 0, 0, n.width, n.height, r)
        ctx.fillStyle = n.fill
        ctx.fill()
      }
      if (n.stroke && n.stroke.width > 0) {
        roundedPath(ctx, 0, 0, n.width, n.height, r)
        ctx.strokeStyle = n.stroke.color
        ctx.lineWidth = n.stroke.width
        ctx.lineJoin = 'round'
        ctx.stroke()
      }
      break
    }
    case 'ellipse': {
      ctx.beginPath()
      ctx.ellipse(n.width / 2, n.height / 2, Math.max(0, n.width / 2), Math.max(0, n.height / 2), 0, 0, Math.PI * 2)
      if (n.fill) {
        ctx.fillStyle = n.fill
        ctx.fill()
      }
      if (n.stroke && n.stroke.width > 0) {
        ctx.strokeStyle = n.stroke.color
        ctx.lineWidth = n.stroke.width
        ctx.stroke()
      }
      break
    }
    case 'line': {
      const w = n.stroke?.width ?? 2
      const color = n.stroke?.color ?? '#ffffff'
      ctx.beginPath()
      if (n.flip) {
        ctx.moveTo(n.width, 0)
        ctx.lineTo(0, n.height)
      } else {
        ctx.moveTo(0, 0)
        ctx.lineTo(n.width, n.height)
      }
      ctx.strokeStyle = color
      ctx.lineWidth = w
      ctx.lineCap = 'round'
      ctx.stroke()
      break
    }
    case 'text': {
      drawText(ctx, n)
      break
    }
  }
  ctx.restore()

  if (n.children) {
    ctx.save()
    ctx.translate(n.x, n.y)
    for (const c of n.children) drawNode(ctx, c)
    ctx.restore()
  }
}

export function drawScene(ctx: CanvasRenderingContext2D, scene: Scene) {
  // Artboard shadow + background.
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.5)'
  ctx.shadowBlur = 30
  ctx.shadowOffsetY = 4
  ctx.fillStyle = scene.background
  ctx.fillRect(0, 0, scene.width, scene.height)
  ctx.restore()

  for (const n of scene.nodes) drawNode(ctx, n)
}

/**
 * World-space transform helpers.
 * screen = world * zoom + pan
 */
export function worldToScreen(vp: Viewport, x: number, y: number): { x: number; y: number } {
  return { x: x * vp.zoom + vp.panX, y: y * vp.zoom + vp.panY }
}

export function screenToWorld(vp: Viewport, x: number, y: number): { x: number; y: number } {
  return { x: (x - vp.panX) / vp.zoom, y: (y - vp.panY) / vp.zoom }
}
