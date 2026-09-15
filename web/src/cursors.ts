/**
 * Custom tool cursors, drawn the same way Figma and Lunacy do theirs:
 * crisp little glyphs riding the pointer instead of the OS shapes.
 * Each is an inline SVG data-URL; resize arrows are generated once per
 * direction and then picked by the selection's rotation, snapped to
 * 22.5° steps exactly like Figma.
 */

function url(svg: string, hx: number, hy: number): string {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${hx} ${hy}, auto`
}

const INK = '#111111'
const PAPER = '#fafafa'

/** Figma-style pointer arrow with a white halo. */
export const CURSOR_MOVE = url(
  `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">` +
    `<path d="M3 1.5 L3 15.2 L6.6 12.1 L8.9 17.4 L11.2 16.4 L8.9 11.2 L13.6 10.6 Z" ` +
    `fill="${INK}" stroke="${PAPER}" stroke-width="1.4" stroke-linejoin="round"/>` +
    `</svg>`,
  3,
  2,
)

/** Open hand for panning. */
export const CURSOR_HAND = url(
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">` +
    `<path d="M9.2 3.6c.6 0 1 .4 1 1v6.1h.9V2.9c0-.6.4-1 1-1s1 .4 1 1v7.8h.9V3.9c0-.6.4-1 1-1s1 .4 1 1v8.3h.8V6.1c0-.6.4-1 1-1s1 .4 1 1v9.4c0 3.6-2.4 6-6 6-2.9 0-4.5-1.5-6.2-4.6l-1.9-3.5c-.3-.5-.1-1.1.4-1.4.4-.2 1-.1 1.3.3l1.5 2.1V4.6c0-.6.4-1 1-1z" ` +
    `fill="${PAPER}" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>` +
    `</svg>`,
  12,
  2,
)

/** Closed hand while dragging the canvas. */
export const CURSOR_GRABBING = url(
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">` +
    `<path d="M7.5 11.2V5.9c0-.6.4-1 1-1s1 .4 1 1v4.3h.8V4.6c0-.6.4-1 1-1s1 .4 1 1v5.6h.8V5.2c0-.6.4-1 1-1s1 .4 1 1v5.6h.8V6.9c0-.6.4-1 1-1s1 .4 1 1v7.6c0 3.4-2.3 5.8-5.7 5.8-2.7 0-4.3-1.4-5.8-4.3l-1.5-2.9c-.3-.5-.1-1.1.4-1.3.4-.2 1-.1 1.3.3l1.7 2.3z" ` +
    `fill="${PAPER}" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>` +
    `</svg>`,
  12,
  4,
)

/** Crosshair with a centre dot — Lunacy's shape cursor. */
export const CURSOR_CROSSHAIR = url(
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">` +
    `<g stroke="${PAPER}" stroke-width="2.6"><line x1="12" y1="3.5" x2="12" y2="20.5"/><line x1="3.5" y1="12" x2="20.5" y2="12"/></g>` +
    `<g stroke="${INK}" stroke-width="1.2"><line x1="12" y1="3.5" x2="12" y2="20.5"/><line x1="3.5" y1="12" x2="20.5" y2="12"/></g>` +
    `<circle cx="12" cy="12" r="1.4" fill="${INK}"/>` +
    `</svg>`,
  12,
  12,
)

/** I-beam for text. */
export const CURSOR_TEXT = url(
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">` +
    `<path d="M8.5 4.5c2 0 2.6.9 3.5.9s1.5-.9 3.5-.9M8.5 19.5c2 0 2.6-.9 3.5-.9s1.5.9 3.5.9M12 5.4v13.2" ` +
    `fill="none" stroke="${PAPER}" stroke-width="3" stroke-linecap="round"/>` +
    `<path d="M8.5 4.5c2 0 2.6.9 3.5.9s1.5-.9 3.5-.9M8.5 19.5c2 0 2.6-.9 3.5-.9s1.5.9 3.5.9M12 5.4v13.2" ` +
    `fill="none" stroke="${INK}" stroke-width="1.3" stroke-linecap="round"/>` +
    `</svg>`,
  12,
  12,
)

/** Rotate glyph shown near the selection's corners. */
export const CURSOR_ROTATE = url(
  `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">` +
    `<path d="M15.5 10a5.5 5.5 0 1 1-1.6-3.9" fill="none" stroke="${PAPER}" stroke-width="3.4" stroke-linecap="round"/>` +
    `<path d="M15.5 10a5.5 5.5 0 1 1-1.6-3.9" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>` +
    `<path d="M13.2 2.6l3.4.5-1.2 3.2z" fill="${INK}" stroke="${PAPER}" stroke-width="1"/>` +
    `</svg>`,
  10,
  10,
)

/** One straight double-arrow, drawn pointing east and rotated per use. */
function arrowCursor(angleDeg: number): string {
  return url(
    `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">` +
      `<g transform="rotate(${angleDeg} 10 10)">` +
      `<path d="M2.5 10 L6.5 6.8 L6.5 8.8 L13.5 8.8 L13.5 6.8 L17.5 10 L13.5 13.2 L13.5 11.2 L6.5 11.2 L6.5 13.2 Z" ` +
      `fill="${INK}" stroke="${PAPER}" stroke-width="1.3" stroke-linejoin="round"/>` +
      `</g></svg>`,
    10,
    10,
  )
}

/** Base angle of each handle's arrow before the node's rotation is added. */
const HANDLE_BASE_ANGLE: Record<string, number> = {
  e: 0,
  w: 0,
  n: 90,
  s: 90,
  ne: -45,
  sw: -45,
  nw: 45,
  se: 45,
}

const cache = new Map<string, string>()

/**
 * Resize cursor for a handle, rotated with the selected node. Figma and
 * Lunacy both snap the arrow to 22.5° so it doesn't flicker mid-degree.
 */
export function resizeCursor(handle: string, rotation = 0): string {
  const base = HANDLE_BASE_ANGLE[handle] ?? 0
  const angle = Math.round(((base + rotation) % 360) / 22.5) * 22.5
  const key = `r${angle}`
  let c = cache.get(key)
  if (!c) {
    c = arrowCursor(angle)
    cache.set(key, c)
  }
  return c
}
