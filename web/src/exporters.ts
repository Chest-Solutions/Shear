/**
 * Client-side exporters.
 *
 * The React export only ever runs here (it produces a .tsx file, nothing
 * the Go renderer is involved in). SVG / HTML / PNG are primarily served
 * by the Go backend — the builders in this file are the fallback used
 * when the backend can't be reached, so exports never fail outright.
 */
import type { Node, Scene } from './types'
import { arrowHead, defaultCornerRadii, lineEnds, polyPoints, ptsAttr, slug } from './utils'
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

// ---------------------------------------------------------------- SVG

/** Scene → standalone SVG document (static layout, vectors intact). */
export function sceneToSVG(s: Scene): string {
  const parts: string[] = []
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(s.width)}" height="${num(s.height)}" viewBox="0 0 ${num(s.width)} ${num(s.height)}">`,
    `<rect width="${num(s.width)}" height="${num(s.height)}" fill="${s.background}"/>`,
  )
  const walk = (list: Node[], ox: number, oy: number) => {
    for (const n of list) {
      if (!n.visible) continue
      const x = ox + n.x
      const y = oy + n.y
      const attrs: string[] = []
      if (n.opacity < 1) attrs.push(`opacity="${num(n.opacity)}"`)
      if (n.rotation) attrs.push(`transform="rotate(${num(n.rotation)} ${num(x + n.width / 2)} ${num(y + n.height / 2)})"`)
      const open = `<g${attrs.length ? ' ' + attrs.join(' ') : ''}>`
      parts.push(open)
      const r = radii(n)
      const fill = n.fill ?? 'none'
      const stroke = n.stroke && n.stroke.width > 0 ? ` stroke="${n.stroke.color}" stroke-width="${num(n.stroke.width)}"` : ''
      switch (n.type) {
        case 'frame':
          // legacy frames export as invisible groups
          break
        case 'rect':
          parts.push(`<rect x="${num(x)}" y="${num(y)}" width="${num(n.width)}" height="${num(n.height)}" rx="${num(Math.min(r.tl, Math.min(n.width, n.height) / 2))}" fill="${fill}"${stroke}/>`)
          break
        case 'ellipse':
          parts.push(`<ellipse cx="${num(x + n.width / 2)}" cy="${num(y + n.height / 2)}" rx="${num(n.width / 2)}" ry="${num(n.height / 2)}" fill="${fill}"${stroke}/>`)
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
            parts.push(`<text x="${num(tx)}" y="${num(y + n.text.fontSize)}" fill="${n.text.color}" font-size="${num(n.text.fontSize)}" font-weight="${n.text.fontWeight}" text-anchor="${anchor}" font-family="-apple-system, Inter, 'Segoe UI', sans-serif">`)
            n.text.content.split('\n').forEach((line, i) => {
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

/** Scene → self-contained HTML page (static layout). */
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
  .scene { position: relative; overflow: hidden; width: ${num(s.width)}px; height: ${num(s.height)}px; background: ${s.background}; }
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
  if (n.fill) style.push(`background:${n.fill}`)
  if (n.stroke && n.stroke.width > 0) style.push(`border:${num(n.stroke.width)}px solid ${n.stroke.color}`)
  if (r.tl + r.tr + r.br + r.bl > 0) style.push(`border-radius:${num(r.tl)}px ${num(r.tr)}px ${num(r.br)}px ${num(r.bl)}px`)
  if (shadowCSS(n)) style.push(`box-shadow:${shadowCSS(n)}`)
  if (layerBlur(n)) style.push(`filter:blur(${num(layerBlur(n))}px)`)
  if (backdropBlur(n)) style.push(`backdrop-filter:blur(${num(backdropBlur(n))}px);-webkit-backdrop-filter:blur(${num(backdropBlur(n))}px)`)
  if (n.type === 'ellipse') style.push('border-radius:50%')
  if (n.type === 'line') {
    style.splice(style.findIndex((x) => x.startsWith('background')), 1)
    const idx = style.findIndex((x) => x.startsWith('border:'))
    if (idx >= 0) style.splice(idx, 1)
    style.push('border:none', `border-top:${num(n.stroke?.width ?? 2)}px solid ${n.stroke?.color ?? '#ffffff'}`)
  }
  if (n.type === 'text' && n.text) {
    style.push(
      `color:${n.text.color}`,
      `font-size:${num(n.text.fontSize)}px`,
      `font-weight:${n.text.fontWeight}`,
      `text-align:${n.text.align}`,
      'line-height:1.3',
      'white-space:pre-wrap',
    )
  }
  return style.join(';')
}

// ---------------------------------------------------------------- React

/** Scene → a dependency-free React component (.tsx). */
export function sceneToReact(s: Scene): string {
  const componentName =
    slug(s.name)
      .split('-')
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join('') || 'Scene'

  const body: string[] = []
  const walk = (list: Node[], indent: string) => {
    for (const n of list) {
      if (!n.visible) continue
      const style = reactStyle(n)
      if (n.type === 'icon' && n.icon) {
        body.push(`${indent}<div style={${style}} dangerouslySetInnerHTML={{ __html: ${JSON.stringify(iconHTML(n))} }} />`)
        continue
      }
      if (n.type === 'poly' || (n.type === 'line' && n.arrow)) {
        body.push(`${indent}<div style={${style}} dangerouslySetInnerHTML={{ __html: ${JSON.stringify(shapeSVG(n))} }} />`)
        continue
      }
      const content = n.type === 'text' ? escapeXml(n.text?.content ?? '') : ''
      if (n.children?.length) {
        body.push(`${indent}<div style={${style}}>`)
        walk(n.children, indent + '  ')
        body.push(`${indent}</div>`)
      } else {
        body.push(`${indent}<div style={${style}}>${content}</div>`)
      }
    }
  }
  walk(s.nodes, '      ')

  return `// Generated by Shear — scene "${s.name}" (${Math.round(s.width)}×${Math.round(s.height)})
// Dependency-free: paste into any React project.

export default function ${componentName}() {
  return (
    <div
      style={{
        position: 'relative',
        width: ${num(s.width)},
        height: ${num(s.height)},
        background: '${s.background}',
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
    // dimensional values stay numbers where React prefers it
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
