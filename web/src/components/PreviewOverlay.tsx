import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Pause, Play, RotateCcw, X } from 'lucide-react'
import type { Node, Scene } from '../types'
import { adjustCSS, resolveNodes, sceneDuration, sceneLoops } from '../anim'
import { defaultCornerRadii } from '../utils'

/**
 * Play mode. It runs the same clock the timeline editor uses and samples
 * every keyframe track each frame, so what plays here is exactly what the
 * timeline describes. The overlay itself doesn't animate in — only the
 * objects move.
 */
export function PreviewOverlay({ scene, open, onClose }: { scene: Scene; open: boolean; onClose: () => void }) {
  const duration = Math.max(sceneDuration(scene.nodes), 0.1)
  const loops = sceneLoops(scene.nodes)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(true)
  const raf = useRef<number | null>(null)
  const startedAt = useRef(0)

  // Restart from zero each time preview opens.
  useEffect(() => {
    if (open) {
      setTime(0)
      setPlaying(true)
    }
  }, [open])

  useEffect(() => {
    if (!open || !playing) return
    startedAt.current = performance.now() - time * 1000
    const tick = () => {
      const t = (performance.now() - startedAt.current) / 1000
      if (t >= duration && !loops) {
        setTime(duration)
        setPlaying(false)
        return
      }
      setTime(loops ? t % duration : t)
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current)
    }
    // `time` is intentionally read only when playback (re)starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, playing, duration, loops])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.code === 'Space') {
        e.preventDefault()
        setPlaying((p) => !p)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const nodes = resolveNodes(scene.nodes, time)

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-neutral-900/80 backdrop-blur-xl"
        >
          <div
            className="relative overflow-hidden rounded-xl shadow-panel"
            style={{
              width: scene.width,
              height: scene.height,
              background: scene.background,
              maxWidth: '86vw',
              maxHeight: '78vh',
            }}
          >
            {nodes.map((n) => (
              <PreviewNode key={n.id} node={n} />
            ))}
          </div>

          <div className="flex items-center gap-1 rounded-full border border-white/10 bg-neutral-800/70 p-1 backdrop-blur-xl">
            <button
              onClick={() => setPlaying((p) => !p)}
              className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-300 transition-colors hover:bg-white/10 hover:text-neutral-100"
              title={playing ? 'Pause' : 'Play'}
            >
              {playing ? <Pause size={13} strokeWidth={1.8} /> : <Play size={13} strokeWidth={1.8} />}
            </button>

            <button
              onClick={() => {
                setTime(0)
                setPlaying(true)
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-300 transition-colors hover:bg-white/10 hover:text-neutral-100"
              title="Replay"
            >
              <RotateCcw size={13} strokeWidth={1.8} />
            </button>

            <input
              type="range"
              min={0}
              max={duration}
              step={0.01}
              value={time}
              onChange={(e) => {
                setPlaying(false)
                setTime(Number(e.target.value))
              }}
              className="slider mx-1 h-5 w-48 cursor-pointer appearance-none rounded-full bg-neutral-700"
            />

            <span className="w-16 text-center text-[11px] tabular-nums text-neutral-400">
              {time.toFixed(2)}s
            </span>

            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-300 transition-colors hover:bg-white/10 hover:text-neutral-100"
              title="Close"
            >
              <X size={13} strokeWidth={1.8} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function PreviewNode({ node }: { node: Node }) {
  if (!node.visible) return null
  return (
    <div style={nodeStyle(node)}>
      {node.type === 'text' ? node.text?.content : null}
      {node.children?.map((c) => (
        <PreviewNode key={c.id} node={c} />
      ))}
    </div>
  )
}

/** Node → CSS. Shared shape with the Go HTML exporter. */
export function nodeStyle(n: Node): React.CSSProperties {
  const r = { ...defaultCornerRadii(n.cornerRadius ?? 0), ...(n.cornerRadii ?? {}) }
  const layerBlur = (n.effects ?? []).find((e) => e.visible && e.type === 'layer-blur')
  const filter = [adjustCSS(n.adjust), layerBlur && 'blur' in layerBlur ? `blur(${layerBlur.blur}px)` : '']
    .filter(Boolean)
    .join(' ')

  const style: React.CSSProperties = {
    position: 'absolute',
    left: n.x,
    top: n.y,
    width: n.width,
    height: n.height,
    opacity: n.opacity,
    transform: n.rotation ? `rotate(${n.rotation}deg)` : undefined,
    background: n.fill ?? undefined,
    border: n.stroke && n.stroke.width > 0 ? `${n.stroke.width}px solid ${n.stroke.color}` : undefined,
    borderRadius: `${r.tl}px ${r.tr}px ${r.br}px ${r.bl}px`,
    boxShadow: shadowCSS(n) || undefined,
    filter: filter || undefined,
    backdropFilter: backdropBlur(n) ? `blur(${backdropBlur(n)}px)` : undefined,
  }
  if (n.type === 'ellipse') style.borderRadius = '50%'
  if (n.type === 'line') {
    style.background = undefined
    style.border = undefined
    style.borderTop = `${n.stroke?.width ?? 1}px solid ${n.stroke?.color ?? '#ffffff'}`
  }
  if (n.type === 'text' && n.text) {
    style.color = n.text.color
    style.fontSize = n.text.fontSize
    style.fontWeight = n.text.fontWeight
    style.textAlign = n.text.align
    style.lineHeight = 1.3
    style.whiteSpace = 'pre-wrap'
  }
  return style
}

function shadowCSS(n: Node): string {
  return (n.effects ?? [])
    .filter((e) => e.visible && (e.type === 'drop-shadow' || e.type === 'inner-shadow'))
    .map((e) =>
      'color' in e ? `${e.type === 'inner-shadow' ? 'inset ' : ''}${e.x}px ${e.y}px ${e.blur}px ${e.spread}px ${e.color}` : '',
    )
    .filter(Boolean)
    .join(', ')
}

function backdropBlur(n: Node): number {
  const e = (n.effects ?? []).find((x) => x.visible && x.type === 'background-blur')
  return e && 'blur' in e ? e.blur : 0
}
