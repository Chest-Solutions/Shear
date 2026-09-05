import { AnimatePresence, motion } from 'framer-motion'
import { MousePointer2 } from 'lucide-react'
import type { Peer, Scene } from '../types'
import { worldToScreen, type Viewport } from '../render'
import { findAny } from './CanvasView'

/**
 * Other designers' cursors, drawn in screen space above the canvas.
 * Each carries their name in their own colour, and their current
 * selection is outlined in the same colour.
 */
export function PresenceLayer({ peers, viewport, scene }: { peers: Peer[]; viewport: Viewport; scene: Scene }) {
  const here = peers.filter((p) => !p.sceneId || p.sceneId === scene.id)

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {here.map((p) => {
        const sel = p.selection ? findAny(scene.nodes, p.selection) : null
        if (!sel) return null
        const tl = worldToScreen(viewport, sel.x, sel.y)
        return (
          <motion.div
            key={`sel-${p.id}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute rounded-[3px]"
            style={{
              left: tl.x,
              top: tl.y,
              width: sel.width * viewport.zoom,
              height: sel.height * viewport.zoom,
              boxShadow: `0 0 0 1.5px ${p.color}`,
              transform: sel.rotation ? `rotate(${sel.rotation}deg)` : undefined,
            }}
          />
        )
      })}

      <AnimatePresence>
        {here.map((p) => {
          const s = worldToScreen(viewport, p.x, p.y)
          return (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, scale: 0.8, filter: 'blur(6px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)', x: s.x, y: s.y }}
              exit={{ opacity: 0, scale: 0.8, filter: 'blur(6px)' }}
              transition={{ x: { duration: 0.06, ease: 'linear' }, y: { duration: 0.06, ease: 'linear' }, default: { duration: 0.2 } }}
              className="absolute left-0 top-0"
            >
              <MousePointer2 size={16} strokeWidth={1.5} style={{ color: p.color, fill: p.color }} />
              <span
                className="absolute left-3.5 top-3.5 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-medium text-neutral-900"
                style={{ background: p.color }}
              >
                {p.name}
              </span>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}

/** Compact facepile shown in the top bar during a session. */
export function PeerAvatars({ peers, self }: { peers: Peer[]; self: Peer | null }) {
  const all = self ? [self, ...peers] : peers
  if (all.length === 0) return null
  return (
    <div className="flex items-center -space-x-1.5">
      {all.slice(0, 5).map((p) => (
        <span
          key={p.id}
          title={p.name}
          className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold text-neutral-900 ring-2 ring-neutral-800"
          style={{ background: p.color }}
        >
          {p.name.slice(0, 1).toUpperCase()}
        </span>
      ))}
      {all.length > 5 && <span className="pl-3 text-[10px] text-neutral-500">+{all.length - 5}</span>}
    </div>
  )
}
