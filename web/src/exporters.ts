/**
 * Client-side exporters.
 *
 * The workspace has no artboard: exports are transparent unless the user
 * drew their own canvas shape. The React export is animation-aware and
 * leans on framer-motion when any node carries keyframes.
 */
import type { Node, Scene } from './types'
import { arrowHead, defaultCornerRadii, lineEnds, polyPoints, ptsAttr, slug } from './utils'
import { gradientEnds, layoutTextLines } from './render'
import { hasTimeline } from './anim'
import { drawScene } from './render'

// ---------------------------------------------------------------- helpers

function num(v: number): string {
  return String(Math.round(v * 100) / 100)
}

function radii(n: Node) {
  return { ...defaultCornerRadii(n.cornerRadius ?? 0), ...(n.cornerRadii ?? {}) }
}

function shadowCSS(n: Node): string {
  return (n.effects ?? [])
    .filter((e): e is import('./types').ShadowEffect => e.visible && (e.type === 'drop-shadow' || e.type === 'inner-shadow'))
    .map((e) => `${e.type === 'inner-shadow' ? 'inset ' : ''}${num(e.x)}px ${num(e.y)}px ${num(e.blur)}px ${num(e.spread)}px ${e.color}`)
    .join(', ')
}

function layerBlur(n: Node): number {
  const e = (n.effects ?? []).find((x) => x.visible && x.type === 'layer-blur')
  return e && 'blur' in e ? e.blur : 0
}

function backdropBlur(n: Node): number {
  const e = (n.effects ?? []).find((x) => x.visible && x.type === 'background-blur')
  return e && 'blur' in e ? e.blur : 0
}

function tintIcon(n: Node): string {
  const svg = n.icon?.svg ?? ''
  return svg.split('currentColor').join(n.icon?.color || '#ffffff')
}

/** CSS linear-gradient() matching the canvas renderer's endpoints. */
export function gradientCSS(n: Node): string | null {
  if (!n.gradient || n.gradient.stops.length === 0) return null
  const stops = [...n.gradient.stops].sort((a, b) => a.pos - b.pos)
  return `linear-gradient(${num(n.gradient.angle + 90)}deg, ${stops.map((s) => `${s.color} ${num(s.pos * 100)}%`).join(', ')})`
}

let mctx: CanvasRenderingContext2D | null = null
/** Width measurer for word wrapping outside the live canvas. */
export function measurer(font: string): (t: string) => number {
  if (!mctx) mctx = document.createElement('canvas').getContext('2d')
  const ctx = mctx
  ctx!.font = font
  return (t: string) => ctx!.measureText(t).width
}

const UI_FONT = "Inter, -apple-system, 'Segoe UI', sans-serif"

function textLines(n: Node): string[] {
  const t = n.text!
  return layoutTextLines(n, measurer(`${t.fontWeight} ${t.fontSize}px ${UI_FONT}`))
}

// ---------------------------------------------------------------- SVG

/** Scene → standalone SVG document (transparent workspace, vectors intact). */
export function sceneToSVG(s: Scene): string {
  const defs: string[] = []
  const parts: string[] = []
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${num(s.width)}" height="${num(s.height)}" viewBox="0 0 ${num(s.width)} ${num(s.height)}">`)
  const gradRef = (n: Node): string | null => {
    if (!n.gradient || n.gradient.stops.length === 0) return null
    const id = `g${n.id.replace(/[^a-zA-Z0-9]/g, '')}`
    const [x1, y1, x2, y2] = gradientEnds(n.gradient.angle, n.width, n.height)
    const stops = [...n.gradient.stops].sort((a, b) => a.pos - b.pos)
    defs.push(
      `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${num(x1)}" y1="${num(y1)}" x2="${num(x2)}" y2="${num(y2)}">${stops
        .map((st) => `<stop offset="${num(st.pos)}" stop-color="${st.color}"/>`)
        .join('')}</linearGradient>`,
    )
    return `url(#${id})`
  }
  const walk = (list: Node[], ox: number, oy: number) => {
    for (const n of list) {
      if (!n.visible) continue
      const x = ox + n.x
      const y = oy + n.y
      const attrs: string[] = []
      if (n.opacity < 1) attrs.push(`opacity="${num(n.opacity)}"`)
      if (n.rotation) attrs.push(`transform="rotate(${num(n.rotation)} ${num(x + n.width / 2)} ${num(y + n.height / 2)})"`)
      parts.push(`<g${attrs.length ? ' ' + attrs.join(' ') : ''}>`)
      const r = radii(n)
      const fill = gradRef(n) ?? n.fill ?? 'none'
      const stroke = n.stroke && n.stroke.width > 0 ? ` stroke="${n.stroke.color}" stroke-width="${num(n.stroke.width)}"` : ''
      switch (n.type) {
        case 'frame':
          break
        case 'rect':
          parts.push(`<rect x="${num(x)}" y="${num(y)}" width="${num(n.width)}" height="${num(n.height)}" rx="${num(Math.min(r.tl, Math.min(n.width, n.height) / 2))}" fill="${fill}"${stroke}/>` )
          break
        case 'ellipse':
          parts.push(`<ellipse cx="${num(x + n.width / 2)}" cy="${num(y + n.height / 2)}" rx="${num(n.width / 2)}" ry="${num(n.height / 2)}" fill="${fill}"${stroke}/>` )
          break
        case 'line': {
          const [lx1, ly1, lx2, ly2] = lineEnds(n)
          const col = n.stroke?.color ?? '#ffffff'
          const wdt = n.stroke?.width ?? 2
          if (n.arrow) {
            const ang = Math.atan2(ly2 - ly1, lx2 - lx1)
            const len = Math.max(10, wdt * 4) * 0.7
            parts.push(`<line x1="${num(x + lx1)}" y1="${num(y + ly1)}" x2="${num(x + lx2 - Math.cos(ang) * len)}" y2="${num(y + ly2 - Math.sin(ang) * len)}" stroke="${col}" stroke-width="${num(wdt)}" stroke-linecap="round"/>`)
            parts.push(`<polygon points="${ptsAttr(arrowHead(n), x, y)}" fill="${col}"/>`)
          } else {
            parts.push(`<line x1="${num(x + lx1)}" y1="${num(y + ly1)}" x2="${num(x + lx2)}" y2="${num(y + ly2)}" stroke="${col}" stroke-width="${num(wdt)}" stroke-linecap="round"/>`)
          }
          break
        }
        case 'poly':
          parts.push(`<polygon points="${ptsAttr(polyPoints(n), x, y)}" fill="${fill}"${stroke}/>` )
          break
        case 'text':
          if (n.text) {
            const anchor = n.text.align === 'center' ? 'middle' : n.text.align === 'right' ? 'end' : 'start'
            const tx = n.text.align === 'center' ? x + n.width / 2 : n.text.align === 'right' ? x + n.width : x
            const lh = n.text.fontSize * 1.3
            const tfill = gradRef(n) ?? n.text.color
            parts.push(`<text x="${num(tx)}" y="${num(y + n.text.fontSize)}" fill="${tfill}" font-size="${num(n.text.fontSize)}" font-weight="${num(n.text.fontWeight)}" text-anchor="${anchor}" font-family="-apple-system, Inter, 'Segoe UI', sans-serif">`)
            textLines(n).forEach((line, i) => {
              parts.push(`<tspan x="${num(tx)}" dy="${i === 0 ? 0 : num(lh)}">${escapeXml(line)}</tspan>`)
            })
            parts.push('</text>')
          }
          break
        case 'icon':
          if (n.icon) {
            const svg = tintIcon(n).replace('<svg', `<svg x="${num(x)}" y="${num(y)}" width="${num(n.width)}" height="${num(n.height)}" preserveAspectRatio="none"`)
            parts.push(svg)
          }
          break
      }
      if (n.children) walk(n.children, x, y)
      parts.push('</g>')
    }
  }
  walk(s.nodes, 0, 0)
  if (defs.length) parts.splice(1, 0, `<defs>${defs.join('')}</defs>`)
  parts.push('</svg>')
  return parts.join('\n')
}

/** Inline SVG for shapes CSS can't express (poly, arrow lines). */
export function shapeSVG(n: Node): string {
  const col = n.stroke?.color ?? '#ffffff'
  const wdt = n.stroke?.width ?? 2
  const inner: string[] = []
  if (n.type === 'poly') {
    inner.push(`<polygon points="${ptsAttr(polyPoints(n))}" fill="${n.fill ?? 'none'}"${n.stroke && n.stroke.width > 0 ? ` stroke="${n.stroke.color}" stroke-width="${num(n.stroke.width)}" stroke-linejoin="round"` : ''}/>` )
  } else if (n.type === 'line' && n.arrow) {
    const [x1, y1, x2, y2] = lineEnds(n)
    const ang = Math.atan2(y2 - y1, x2 - x1)
    const len = Math.max(10, wdt * 4) * 0.7
    inner.push(`<line x1="${num(x1)}" y1="${num(y1)}" x2="${num(x2 - Math.cos(ang) * len)}" y2="${num(y2 - Math.sin(ang) * len)}" stroke="${col}" stroke-width="${num(wdt)}" stroke-linecap="round"/>`)
    inner.push(`<polygon points="${ptsAttr(arrowHead(n))}" fill="${col}"/>`)
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${num(n.width)} ${num(n.height)}" style="width:100%;height:100%;display:block;overflow:visible" preserveAspectRatio="none">${inner.join('')}</svg>`
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ---------------------------------------------------------------- HTML

/** Scene → self-contained HTML page (transparent workspace). */
export function sceneToHTML(s: Scene): string {
  const body: string[] = []
  const walk = (list: Node[], indent: string) => {
    for (const n of list) {
      if (!n.visible) continue
      const shape = n.type === 'poly' || (n.type === 'line' && n.arrow) ? shapeSVG(n) : ''
      body.push(`${indent}<div style="${nodeCSS(n)}">${n.type === 'text' ? escapeXml(n.text?.content ?? '') : n.type === 'icon' && n.icon ? iconHTML(n) : shape}`)
      if (n.children?.length) walk(n.children, indent + '  ')
      body.push(`${indent}</div>`)
    }
  }
  walk(s.nodes, '    ')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeXml(s.name)}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; display: grid; place-items: center; min-height: 100vh; background: #141414;
         font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, "Segoe UI", sans-serif; }
  .scene { position: relative; width: ${num(s.width)}px; height: ${num(s.height)}px; }
  .scene > div, .scene div { position: absolute; }
</style>
</head>
<body>
  <div class="scene">
${body.join('\n')}
  </div>
</body>
</html>
`
}

function iconHTML(n: Node): string {
  return tintIcon(n).replace('<svg', '<svg style="width:100%;height:100%;display:block" preserveAspectRatio="none"')
}

/** Node → CSS declarations, shared by the HTML and React exporters. */
export function nodeCSS(n: Node): string {
  const r = radii(n)
  if (n.type === 'poly' || (n.type === 'line' && n.arrow)) {
    const pos = [
      `left:${num(n.x)}px`,
      `top:${num(n.y)}px`,
      `width:${num(n.width)}px`,
      `height:${num(n.height)}px`,
    ]
    if (n.opacity < 1) pos.push(`opacity:${num(n.opacity)}`)
    if (n.rotation) pos.push(`transform:rotate(${num(n.rotation)}deg)`)
    return pos.join(';')
  }
  const style: string[] = [
    `left:${num(n.x)}px`,
    `top:${num(n.y)}px`,
    `width:${num(n.width)}px`,
    `height:${num(n.height)}px`,
  ]
  if (n.opacity < 1) style.push(`opacity:${num(n.opacity)}`)
  if (n.rotation) style.push(`transform:rotate(${num(n.rotation)}deg)`)
  const grad = gradientCSS(n)
  if (grad) style.push(`background:${grad}`)
  else if (n.fill) style.push(`background:${n.fill}`)
  if (n.stroke && n.stroke.width > 0) style.push(`border:${num(n.stroke.width)}px solid ${n.stroke.color}`)
  if (r.tl + r.tr + r.br + r.bl > 0) style.push(`border-radius:${num(r.tl)}px ${num(r.tr)}px ${num(r.br)}px ${num(r.bl)}px`)
  if (shadowCSS(n)) style.push(`box-shadow:${shadowCSS(n)}`)
  if (layerBlur(n)) style.push(`filter:blur(${num(layerBlur(n))}px)`)
  if (backdropBlur(n)) style.push(`backdrop-filter:blur(${num(backdropBlur(n))}px);-webkit-backdrop-filter:blur(${num(backdropBlur(n))}px)`)
  if (n.type === 'ellipse') style.push('border-radius:50%')
  if (n.type === 'line') {
    const bgIdx = style.findIndex((x) => x.startsWith('background'))
    if (bgIdx >= 0) style.splice(bgIdx, 1)
    const idx = style.findIndex((x) => x.startsWith('border:'))
    if (idx >= 0) style.splice(idx, 1)
    style.push('border:none', `border-top:${num(n.stroke?.width ?? 2)}px solid ${n.stroke?.color ?? '#ffffff'}`)
  }
  if (n.type === 'text' && n.text) {
    style.push(
      `color:${n.gradient ? 'transparent' : n.text.color}`,
      `font-size:${num(n.text.fontSize)}px`,
      `font-weight:${n.text.fontWeight}`,
      `text-align:${n.text.align}`,
      'line-height:1.3',
      'white-space:pre-wrap',
      'overflow-wrap:break-word',
    )
    if (n.gradient) {
      style.push(`background:${grad}`, '-webkit-background-clip:text', 'background-clip:text')
    }
  }
  return style.join(';')
}

// ---------------------------------------------------------------- React

/** Sampled framer-motion keyframe arrays for a node's timeline. */
function motionAttrs(n: Node): { props: string; transition: string } | null {
  const tl = n.timeline
  if (!tl || tl.tracks.length === 0 || !hasTimeline(n)) return null
  const times = new Set<number>([0])
  for (const tr of tl.tracks) for (const k of tr.keys) times.add(Math.min(k.time, tl.duration))
  const ts = [...times].sort((a, b) => a - b)
  const dur = Math.max(tl.duration, ts[ts.length - 1] ?? 0, 0.1)
  const norm = ts.map((t) => Math.round((t / dur) * 1000) / 1000)

  const get = (prop: string) => {
    const tr = tl.tracks.find((t) => t.property === prop)
    if (!tr) return null
    // sample through the easing so the exported arrays match playback
    return ts.map((t) => sampleFor(tr, t))
  }

  const pos = get('position')
  const scale = get('scale')
  const rot = get('rotation')
  const opa = get('opacity')
  const out: string[] = []
  if (pos) {
    out.push(`x: [${pos.map((v) => num((Array.isArray(v) ? v[0] : 0) - n.x)).join(', ')}]`)
    out.push(`y: [${pos.map((v) => num((Array.isArray(v) ? v[1] : 0) - n.y)).join(', ')}]`)
  }
  if (scale) out.push(`scale: [${scale.map((v) => num(Number(v))).join(', ')}]`)
  if (rot) out.push(`rotate: [${rot.map((v) => num(Number(v))).join(', ')}]`)
  if (opa) out.push(`opacity: [${opa.map((v) => num(Number(v))).join(', ')}]`)
  if (out.length === 0) return null
  return {
    props: out.join(', '),
    transition: `{ duration: ${num(dur)}, times: [${norm.join(', ')}], ease: 'easeInOut'${tl.loop ? ', repeat: Infinity' : ''} }`,
  }
}

import { sampleTrack } from './anim'
import type { Track } from './types'
function sampleFor(tr: Track, t: number) {
  return sampleTrack(tr, t)
}

/** Scene → React component (.tsx). Uses framer-motion when animated. */
export function sceneToReact(s: Scene): string {
  const componentName =
    slug(s.name)
      .split('-')
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join('') || 'Scene'

  const animated = s.nodes.some((n) => hasTimeline(n))
  const div = animated ? 'motion.div' : 'div'

  const body: string[] = []
  const walk = (list: Node[], indent: string) => {
    for (const n of list) {
      if (!n.visible) continue
      const style = reactStyle(n)
      const anim = motionAttrs(n)
      const animProps = anim ? `\n${indent}  animate={{ ${anim.props} }}\n${indent}  transition={${anim.transition}}` : ''
      if (n.type === 'icon' && n.icon) {
        body.push(`${indent}<${div} style={${style}}${animProps} dangerouslySetInnerHTML={{ __html: ${JSON.stringify(iconHTML(n))} }} />`)
        continue
      }
      if (n.type === 'poly' || (n.type === 'line' && n.arrow)) {
        body.push(`${indent}<${div} style={${style}}${animProps} dangerouslySetInnerHTML={{ __html: ${JSON.stringify(shapeSVG(n))} }} />`)
        continue
      }
      const content = n.type === 'text' ? (n.text?.content ?? '') : ''
      if (n.children?.length) {
        body.push(`${indent}<${div} style={${style}}${animProps}>`)
        walk(n.children, indent + '  ')
        body.push(`${indent}</${div}>`)
      } else {
        body.push(`${indent}<${div} style={${style}}${animProps}>${content}</${div}>`)
      }
    }
  }
  walk(s.nodes, '      ')

  const header = animated
    ? `// Generated by Shear — scene "${s.name}" (${Math.round(s.width)}×${Math.round(s.height)})\n// Animated with framer-motion.\n\nimport { motion } from 'framer-motion'\n`
    : `// Generated by Shear — scene "${s.name}" (${Math.round(s.width)}×${Math.round(s.height)})\n// Dependency-free: paste into any React project.\n`

  return `${header}
export default function ${componentName}() {
  return (
    <div
      style={{
        position: 'relative',
        width: ${num(s.width)},
        height: ${num(s.height)},
        overflow: 'hidden',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, 'Segoe UI', sans-serif",
      }}
    >
${body.join('\n')}
    </div>
  )
}
`
}

/** nodeCSS → a React inline style-object literal. */
function reactStyle(n: Node): string {
  const css = nodeCSS(n)
  const props: string[] = []
  for (const decl of css.split(';')) {
    if (!decl) continue
    const i = decl.indexOf(':')
    if (i === -1) continue
    const key = decl.slice(0, i)
    let value: string = decl.slice(i + 1)
    const camel = key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
    if (/^-?[\d.]+px$/.test(value) && !value.startsWith('0.')) {
      props.push(`${camel}: ${value.slice(0, -2)}`)
    } else if (/^-?[\d.]+$/.test(value)) {
      props.push(`${camel}: ${value}`)
    } else {
      value = value.replace(/'/g, "\\'")
      props.push(`${camel}: '${value}'`)
    }
  }
  return `{ ${props.join(', ')} }`
}

// ---------------------------------------------------------------- PNG

/** Scene → PNG via the editor's own canvas renderer (fallback path). */
export function sceneToPNG(s: Scene, scale = 2): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(s.width * scale))
    canvas.height = Math.max(1, Math.round(s.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return reject(new Error('canvas unavailable'))
    ctx.scale(scale, scale)
    drawScene(ctx, s)
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png')
  })
}
