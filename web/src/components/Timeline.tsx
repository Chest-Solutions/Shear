import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Diamond, Pause, Play, Plus, Trash2 } from 'lucide-react'
import type { AnimProp, Keyframe, Node, Timeline, Track, Trigger } from '../types'
import { ANIM_PROPS, ANIM_PROP_LABEL, TRIGGER_LABEL } from '../types'
import {
  DEFAULT_EASING,
  EASING_PRESETS,
  PROP_RANGE,
  currentValue,
  emptyTimeline,
  isColorProp,
  makeKey,
  makeTrack,
  sortKeys,
} from '../anim'

const TRIGGERS: Trigger[] = ['view', 'hover', 'click', 'loop']
const EASE = [0.25, 0.1, 0.25, 1] as const

interface Props {
  node: Node
  time: number
  playing: boolean
  onTime: (t: number) => void
  onPlay: (v: boolean) => void
  onUpdate: (patch: Partial<Node>) => void
}

/**
 * The timeline. Move the playhead, change the object, and a keyframe is
 * recorded on whichever properties you touched — then ease each segment
 * with its own curve.
 */
export function TimelinePanel({ node, time, playing, onTime, onPlay, onUpdate }: Props) {
  const tl = node.timeline ?? emptyTimeline()
  const [selected, setSelected] = useState<{ track: string; key: string } | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const setTL = (patch: Partial<Timeline>) => onUpdate({ timeline: { ...tl, ...patch } })

  const setTrack = (trackId: string, keys: Keyframe[]) =>
    setTL({ tracks: tl.tracks.map((t) => (t.id === trackId ? { ...t, keys: sortKeys(keys) } : t)) })

  const addTrack = (p: AnimProp) => {
    if (tl.tracks.some((t) => t.property === p)) return
    setTL({ tracks: [...tl.tracks, makeTrack(p, node)] })
    setAddOpen(false)
  }

  const removeTrack = (id: string) => setTL({ tracks: tl.tracks.filter((t) => t.id !== id) })

  /**
   * Record the object's current value as a keyframe at the playhead.
   * `node` is the authored node, so this captures what you just edited
   * rather than what the track already samples to.
   */
  const keyAt = (track: Track) => {
    const value = currentValue(node, track.property)
    const existing = track.keys.find((k) => Math.abs(k.time - time) < 0.02)
    if (existing) {
      setTrack(track.id, track.keys.map((k) => (k.id === existing.id ? { ...k, value } : k)))
    } else {
      setTrack(track.id, [...track.keys, makeKey(time, value)])
    }
  }

  const selectedKey = (() => {
    if (!selected) return null
    const t = tl.tracks.find((x) => x.id === selected.track)
    const k = t?.keys.find((x) => x.id === selected.key)
    return t && k ? { track: t, key: k } : null
  })()

  const length = Math.max(tl.duration, 0.1)

  /** Dragging anywhere on a lane moves the playhead. */
  const scrubFrom = (e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement
    const move = (clientX: number) => {
      const r = el.getBoundingClientRect()
      const p = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
      onTime(Math.round(p * length * 100) / 100)
    }
    move(e.clientX)
    const onMove = (ev: PointerEvent) => move(ev.clientX)
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div className="space-y-2">
      {/* transport */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onPlay(!playing)}
          className="flex h-6 w-6 items-center justify-center rounded-md bg-white/10 text-neutral-200 transition-colors hover:bg-white/20"
          title={playing ? 'Pause' : 'Play'}
        >
          {playing ? <Pause size={11} strokeWidth={2} /> : <Play size={11} strokeWidth={2} />}
        </button>
        <span className="w-11 text-[10px] tabular-nums text-neutral-400">{time.toFixed(2)}s</span>

        <label className="flex h-6 flex-1 items-center gap-1 rounded-md border border-white/10 bg-white/5 px-1.5">
          <span className="text-[9px] text-neutral-500">End</span>
          <input
            type="number"
            min={0.1}
            step={0.1}
            value={tl.duration}
            onChange={(e) => setTL({ duration: Math.max(0.1, Number(e.target.value) || 0.1) })}
            className="w-full min-w-0 bg-transparent text-[10px] tabular-nums text-neutral-200 outline-none"
          />
          <span className="text-[9px] text-neutral-600">s</span>
        </label>

        <button
          onClick={() => setTL({ loop: !tl.loop })}
          title="Loop"
          className={`rounded-md px-1.5 py-0.5 text-[10px] transition-colors ${
            tl.loop ? 'bg-white text-neutral-900' : 'text-neutral-500 hover:bg-white/10 hover:text-neutral-200'
          }`}
        >
          Loop
        </button>
      </div>

      <label className="flex h-7 items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2">
        <span className="text-[10px] text-neutral-500">Starts</span>
        <select
          value={tl.trigger}
          onChange={(e) => setTL({ trigger: e.target.value as Trigger })}
          className="w-full bg-transparent text-[11px] text-neutral-300 outline-none [&>option]:bg-neutral-900"
        >
          {TRIGGERS.map((t) => (
            <option key={t} value={t}>
              {TRIGGER_LABEL[t]}
            </option>
          ))}
        </select>
      </label>

      {/* ruler + playhead, overlaying the whole track stack */}
      <div className="relative">
        <Ruler length={length} time={time} onTime={onTime} />

      {/* tracks */}
      <div className="space-y-0.5">
        <AnimatePresence initial={false}>
          {tl.tracks.map((track) => (
            <motion.div
              key={track.id}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22, ease: EASE }}
              className="overflow-hidden"
            >
              <TrackRow
                track={track}
                length={length}
                time={time}
                selectedKeyId={selected?.track === track.id ? selected.key : null}
                onSelectKey={(id) => setSelected(id ? { track: track.id, key: id } : null)}
                onKeys={(keys) => setTrack(track.id, keys)}
                onKeyAt={() => keyAt(track)}
                onRemove={() => removeTrack(track.id)}
                onScrub={scrubFrom}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      </div>

      {/* add a property */}
      <div className="relative">
        <button
          onClick={() => setAddOpen((v) => !v)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] py-1.5 text-[11px] text-neutral-300 transition-colors hover:bg-white/10"
        >
          <Plus size={12} strokeWidth={2} />
          Animate a property
        </button>
        <AnimatePresence>
          {addOpen && (
            <motion.div
              initial={{ opacity: 0, y: -4, filter: 'blur(8px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -4, filter: 'blur(8px)' }}
              transition={{ duration: 0.2, ease: EASE }}
              className="absolute bottom-8 left-0 z-20 max-h-56 w-full overflow-y-auto rounded-lg border border-white/10 bg-neutral-900/95 p-1 shadow-panel backdrop-blur-xl"
            >
              {ANIM_PROPS.filter((p) => !tl.tracks.some((t) => t.property === p)).map((p) => (
                <button
                  key={p}
                  onClick={() => addTrack(p)}
                  className="block w-full rounded-md px-2 py-1.5 text-left text-[11px] text-neutral-300 transition-colors hover:bg-white/10"
                >
                  {ANIM_PROP_LABEL[p]}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* the selected keyframe's value + outgoing curve */}
      {selectedKey && (
        <KeyInspector
          track={selectedKey.track}
          keyframe={selectedKey.key}
          onChange={(patch) =>
            setTrack(
              selectedKey.track.id,
              selectedKey.track.keys.map((k) => (k.id === selectedKey.key.id ? { ...k, ...patch } : k)),
            )
          }
          onDelete={() => {
            setTrack(selectedKey.track.id, selectedKey.track.keys.filter((k) => k.id !== selectedKey.key.id))
            setSelected(null)
          }}
        />
      )}
    </div>
  )
}

function Ruler({ length, time, onTime }: { length: number; time: number; onTime: (t: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)

  const scrub = (e: React.PointerEvent) => {
    const el = ref.current
    if (!el) return
    const move = (clientX: number) => {
      const r = el.getBoundingClientRect()
      const p = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
      onTime(Math.round(p * length * 100) / 100)
    }
    move(e.clientX)
    const onMove = (ev: PointerEvent) => move(ev.clientX)
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const ticks = Math.min(8, Math.max(2, Math.round(length * 2)))
  const pct = (time / length) * 100

  return (
    <div className="flex items-center gap-1.5">
      {/* spacers keep the ruler aligned with the track lanes */}
      <span className="w-16 shrink-0" />
      <span className="w-5 shrink-0" />
      <div
        ref={ref}
        onPointerDown={scrub}
        className="relative h-5 flex-1 cursor-ew-resize touch-none rounded-md border border-white/10 bg-white/[0.03]"
      >
        {Array.from({ length: ticks + 1 }, (_, i) => (
          <span key={i} className="absolute top-1 h-1.5 w-px bg-white/15" style={{ left: `${(i / ticks) * 100}%` }} />
        ))}

        {/* the grabbable head of the playhead */}
        <span
          className="absolute -top-0.5 h-2.5 w-2.5 -translate-x-1/2 rotate-45 rounded-[2px] bg-white shadow"
          style={{ left: `${pct}%` }}
        />
        <span className="absolute top-1.5 h-full w-px -translate-x-1/2 bg-white/70" style={{ left: `${pct}%` }} />
      </div>
      <span className="w-[11px] shrink-0" />
    </div>
  )
}

function TrackRow({
  track,
  length,
  time,
  selectedKeyId,
  onSelectKey,
  onKeys,
  onKeyAt,
  onRemove,
  onScrub,
}: {
  track: Track
  length: number
  time: number
  selectedKeyId: string | null
  onSelectKey: (id: string | null) => void
  onKeys: (keys: Keyframe[]) => void
  onKeyAt: () => void
  onRemove: () => void
  onScrub: (e: React.PointerEvent) => void
}) {
  const laneRef = useRef<HTMLDivElement>(null)
  const atPlayhead = track.keys.some((k) => Math.abs(k.time - time) < 0.02)

  const dragKey = (k: Keyframe) => (e: React.PointerEvent) => {
    e.stopPropagation()
    onSelectKey(k.id)
    const el = laneRef.current
    if (!el) return
    const move = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect()
      const p = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width))
      const t = Math.round(p * length * 100) / 100
      onKeys(track.keys.map((x) => (x.id === k.id ? { ...x, time: t } : x)))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="w-16 shrink-0 truncate text-[10px] text-neutral-400" title={ANIM_PROP_LABEL[track.property]}>
        {ANIM_PROP_LABEL[track.property]}
      </span>

      <button
        onClick={onKeyAt}
        title={atPlayhead ? 'Update keyframe here' : 'Add keyframe here'}
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors ${
          atPlayhead ? 'text-neutral-100' : 'text-neutral-600 hover:text-neutral-300'
        }`}
      >
        <Diamond size={10} strokeWidth={2} fill={atPlayhead ? 'currentColor' : 'none'} />
      </button>

      <div
        ref={laneRef}
        className="relative h-5 flex-1 cursor-ew-resize touch-none rounded border border-white/5 bg-white/[0.02]"
        onPointerDown={(e) => {
          onSelectKey(null)
          onScrub(e)
        }}
      >
        {/* segments between keys */}
        {sortKeys(track.keys).slice(0, -1).map((k, i, arr) => {
          const next = sortKeys(track.keys)[i + 1]
          if (!next) return null
          void arr
          return (
            <span
              key={`seg-${k.id}`}
              className="absolute top-1/2 h-px -translate-y-1/2 bg-white/20"
              style={{ left: `${(k.time / length) * 100}%`, width: `${((next.time - k.time) / length) * 100}%` }}
            />
          )
        })}

        {track.keys.map((k) => (
          <span
            key={k.id}
            onPointerDown={dragKey(k)}
            title={`${k.time.toFixed(2)}s`}
            className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 cursor-grab rounded-[2px] transition-colors"
            style={{
              left: `${(k.time / length) * 100}%`,
              background: selectedKeyId === k.id ? '#ffffff' : 'rgba(255,255,255,0.55)',
            }}
          />
        ))}

        {/* the playhead, continued through this lane */}
        <span
          className="pointer-events-none absolute -top-0.5 h-[calc(100%+4px)] w-px bg-white/70"
          style={{ left: `${(time / length) * 100}%` }}
        />
      </div>

      <button onClick={onRemove} title="Remove track" className="shrink-0 text-neutral-700 transition-colors hover:text-neutral-300">
        <Trash2 size={11} strokeWidth={1.8} />
      </button>
    </div>
  )
}

function KeyInspector({
  track,
  keyframe,
  onChange,
  onDelete,
}: {
  track: Track
  keyframe: Keyframe
  onChange: (patch: Partial<Keyframe>) => void
  onDelete: () => void
}) {
  const range = PROP_RANGE[track.property]
  const color = isColorProp(track.property)

  return (
    <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.03] p-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">
          {ANIM_PROP_LABEL[track.property]} · {keyframe.time.toFixed(2)}s
        </span>
        <button onClick={onDelete} className="text-neutral-600 transition-colors hover:text-neutral-200">
          <Trash2 size={11} strokeWidth={1.8} />
        </button>
      </div>

      {color ? (
        <label className="flex items-center gap-2">
          <span className="text-[10px] text-neutral-500">Value</span>
          <span
            className="relative h-6 w-6 overflow-hidden rounded-md ring-1 ring-white/20"
            style={{ background: String(keyframe.value) }}
          >
            <input
              type="color"
              value={String(keyframe.value)}
              onChange={(e) => onChange({ value: e.target.value })}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </span>
        </label>
      ) : (
        <Slider
          label="Value"
          value={Number(keyframe.value)}
          min={range.min}
          max={range.max}
          step={range.step}
          suffix={range.suffix}
          onChange={(v) => onChange({ value: v })}
        />
      )}

      <label className="flex h-7 items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2">
        <span className="text-[10px] text-neutral-500">Ease out</span>
        <select
          value={EASING_PRESETS.find((p) => p.value.join() === keyframe.easing.join())?.id ?? 'custom'}
          onChange={(e) => {
            const p = EASING_PRESETS.find((x) => x.id === e.target.value)
            onChange({ easing: p ? ([...p.value] as [number, number, number, number]) : [...DEFAULT_EASING] })
          }}
          className="w-full bg-transparent text-[11px] text-neutral-300 outline-none [&>option]:bg-neutral-900"
        >
          {EASING_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
          <option value="custom">Custom</option>
        </select>
      </label>

      <BezierEditor value={keyframe.easing} onChange={(easing) => onChange({ easing })} />
    </div>
  )
}

/** Drag the two control points to shape the curve out of this keyframe. */
function BezierEditor({
  value,
  onChange,
}: {
  value: [number, number, number, number]
  onChange: (v: [number, number, number, number]) => void
}) {
  const S = 72
  const pt = (x: number, y: number) => ({ cx: x * S, cy: S - y * S })
  const p1 = pt(value[0], value[1])
  const p2 = pt(value[2], value[3])

  const drag = (index: 0 | 1) => (e: React.PointerEvent<SVGCircleElement>) => {
    const svg = e.currentTarget.ownerSVGElement
    if (!svg) return
    const move = (ev: PointerEvent) => {
      const r = svg.getBoundingClientRect()
      const x = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width))
      const y = Math.min(1.6, Math.max(-0.6, 1 - (ev.clientY - r.top) / r.height))
      const next = [...value] as [number, number, number, number]
      next[index * 2] = Math.round(x * 100) / 100
      next[index * 2 + 1] = Math.round(y * 100) / 100
      onChange(next)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <svg viewBox={`-6 -18 ${S + 12} ${S + 36}`} className="h-20 w-full touch-none rounded-md border border-white/10 bg-white/[0.03]">
      <line x1={0} y1={S} x2={S} y2={0} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
      <path d={`M0 ${S} C ${p1.cx} ${p1.cy}, ${p2.cx} ${p2.cy}, ${S} 0`} fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth={1.5} />
      <line x1={0} y1={S} x2={p1.cx} y2={p1.cy} stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
      <line x1={S} y1={0} x2={p2.cx} y2={p2.cy} stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
      <circle cx={p1.cx} cy={p1.cy} r={4} fill="#fff" className="cursor-grab" onPointerDown={drag(0)} />
      <circle cx={p2.cx} cy={p2.cy} r={4} fill="#fff" className="cursor-grab" onPointerDown={drag(1)} />
    </svg>
  )
}

/**
 * A slider that always shows its value and never fights the number field
 * next to it — the old one clipped and dropped precision while dragging.
 */
export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  suffix?: string
  onChange: (v: number) => void
}) {
  const [text, setText] = useState<string | null>(null)
  const clamped = Math.min(max, Math.max(min, value))
  const pct = ((clamped - min) / (max - min)) * 100

  useEffect(() => {
    setText(null)
  }, [value])

  return (
    <div className="grid grid-cols-[56px_1fr_54px] items-center gap-2">
      <span className="truncate text-[10px] text-neutral-500">{label}</span>

      <div className="relative flex h-5 items-center">
        <span className="pointer-events-none absolute left-0 h-1 w-full rounded-full bg-neutral-700" />
        <span className="pointer-events-none absolute left-0 h-1 rounded-full bg-neutral-400" style={{ width: `${pct}%` }} />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={clamped}
          onChange={(e) => onChange(Number(e.target.value))}
          className="slider relative h-5 w-full cursor-pointer appearance-none bg-transparent"
        />
      </div>

      <span className="flex items-center rounded border border-white/10 bg-neutral-950/40 px-1">
        <input
          value={text ?? String(Math.round(clamped * 100) / 100)}
          onChange={(e) => {
            setText(e.target.value)
            const v = Number(e.target.value)
            if (!Number.isNaN(v)) onChange(Math.min(max, Math.max(min, v)))
          }}
          onBlur={() => setText(null)}
          onFocus={(e) => e.target.select()}
          inputMode="decimal"
          className="w-full min-w-0 bg-transparent text-right text-[10px] tabular-nums text-neutral-300 outline-none"
        />
        {suffix && <span className="ml-0.5 text-[9px] text-neutral-600">{suffix}</span>}
      </span>
    </div>
  )
}
