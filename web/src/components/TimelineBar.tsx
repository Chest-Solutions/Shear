import { useEffect, useMemo, useRef, useState } from 'react'
import { Diamond, Gem, Pause, Play, Repeat, Trash2, X } from 'lucide-react'
import type { Node, Timeline, Track } from '../types'
import { ANIM_PROPS, ANIM_PROP_LABEL } from '../types'
import { currentValue, makeKey, sortKeys, timelineLength } from '../anim'

interface Props {
  /** screen-space bounds: the timeline lives between the side panels */
  left: number
  right: number
  node: Node | null
  time: number
  playing: boolean
  onTime: (t: number) => void
  onPlaying: (v: boolean) => void
  onTimeline: (id: string, tl: Timeline) => void
  onClose: () => void
}

const ROW = 26
const RULER = 22

function niceGrid(pps: number): number {
  for (const g of [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2]) if (g * pps >= 16) return g
  return 4
}

/**
 * Full-width bottom timeline (sits behind the side panels). Every
 * animatable property has a row; its stopwatch arms recording. Ctrl+scrub
 * snaps the playhead to keyframes, key drags snap to grid + neighbours,
 * middle-drag pans, Ctrl+scroll zooms.
 */
export function TimelineBar(p: Props) {
  const [pps, setPps] = useState(140)
  const ppsRef = useRef(pps)
  ppsRef.current = pps
  const scrollRef = useRef<HTMLDivElement>(null)
  const node = p.node
  const tl = node?.timeline

  const length = useMemo(() => (tl ? Math.max(tl.duration, timelineLength(tl) + 0.5) : 2), [tl])
  const contentW = Math.max(1200, (length + 6) * pps)
  const grid = niceGrid(pps)

  const patch = (next: Timeline) => {
    if (node) p.onTimeline(node.id, next)
  }
  const ensureTl = (): Timeline => tl ?? { duration: 2, trigger: 'view', loop: false, tracks: [] }
  const trackFor = (prop: string): Track | undefined => ensureTl().tracks.find((t) => t.property === prop)

  const keyTimes = useMemo(() => {
    const ts: number[] = []
    for (const tr of tl?.tracks ?? []) for (const k of tr.keys) ts.push(k.time)
    return ts
  }, [tl])

  // native wheel (ctrl+scroll = zoom) + middle-drag pan, non-passive
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const cur = ppsRef.current
      const anchor = (e.clientX - rect.left + el.scrollLeft) / cur
      const next = Math.min(800, Math.max(20, cur * (e.deltaY < 0 ? 1.2 : 1 / 1.2)))
      setPps(next)
      requestAnimationFrame(() => {
        el.scrollLeft = anchor * next - (e.clientX - rect.left)
      })
    }
    const onDown = (e: MouseEvent) => {
      if (e.button !== 1) return
      e.preventDefault()
      const startX = e.clientX
      const start = el.scrollLeft
      const move = (ev: MouseEvent) => {
        el.scrollLeft = start - (ev.clientX - startX)
      }
      const up = () => window.removeEventListener('mousemove', move)
      window.addEventListener('mousemove', move)
      window.addEventListener('mouseup', up, { once: true })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('mousedown', onDown)
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('mousedown', onDown)
    }
  }, [])

  const scrub = (e: React.PointerEvent, el: HTMLElement) => {
    const move = (ev: PointerEvent) => {
      const rect = el.getBoundingClientRect()
      const scroll = scrollRef.current?.scrollLeft ?? 0
      let t = (ev.clientX - rect.left + scroll) / pps
      if (ev.ctrlKey || ev.metaKey) {
        const snap = keyTimes.find((k) => Math.abs(k - t) * pps < 12)
        if (snap !== undefined) t = snap
      }
      p.onTime(Math.max(0, Math.min(length + 2, Math.round(t * 100) / 100)))
    }
    move(e.nativeEvent)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', () => window.removeEventListener('pointermove', move), { once: true })
  }

  const dragKey = (e: React.PointerEvent, track: Track, keyId: string) => {
    e.stopPropagation()
    e.preventDefault()
    const startX = e.clientX
    const key = track.keys.find((k) => k.id === keyId)
    if (!key) return
    const orig = key.time
    const move = (ev: PointerEvent) => {
      let t = orig + (ev.clientX - startX) / pps
      const snapped = Math.round(t / grid) * grid
      let best = snapped
      let bestDist = Math.abs(snapped - t)
      for (const kt of [...keyTimes, p.time]) {
        if (kt === orig) continue
        const d = Math.abs(kt - t)
        if (d < bestDist) {
          bestDist = d
          best = kt
        }
      }
      if (bestDist * pps < 9) t = best
      t = Math.max(0, Math.round(t * 100) / 100)
      patch({
        ...ensureTl(),
        tracks: ensureTl().tracks.map((tr) =>
          tr.id === track.id ? { ...tr, keys: sortKeys(tr.keys.map((k) => (k.id === keyId ? { ...k, time: t } : k))) } : tr,
        ),
      })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', () => window.removeEventListener('pointermove', move), { once: true })
  }

  const toggleStopwatch = (prop: (typeof ANIM_PROPS)[number]) => {
    if (!node) return
    const tr = trackFor(prop)
    if (!tr) {
      const track: Track = { id: Math.random().toString(36).slice(2), property: prop, armed: true, keys: [makeKey(p.time, currentValue(node, prop))] }
      patch({ ...ensureTl(), tracks: [...ensureTl().tracks, track] })
    } else {
      patch({ ...ensureTl(), tracks: ensureTl().tracks.map((t) => (t.property === prop ? { ...t, armed: !t.armed } : t)) })
    }
  }

  const ticks: number[] = []
  for (let t = 0; t <= length + 6; t += grid) ticks.push(Math.round(t * 100) / 100)

  return (
    <div className="absolute bottom-0 z-[5] border-t border-white/10 bg-[#1f1f1f]" style={{ left: p.left, right: p.right }}>
      {/* header strip */}
      <div className="flex h-8 items-center gap-2 border-b border-white/5 px-3">
        <Gem size={12} strokeWidth={1.8} className="text-sky-400" />
        <span className="max-w-44 truncate text-[11px] font-medium text-neutral-200">{node ? node.name : 'Nothing selected'}</span>
        <span className="text-[10px] text-neutral-600">arm a stopwatch, then drag the object</span>
        <div className="flex-1" />
        <button
          title={p.playing ? 'Pause' : 'Play'}
          onClick={() => p.onPlaying(!p.playing)}
          className="flex h-6 w-6 items-center justify-center rounded-md text-neutral-300 transition-colors hover:bg-white/10"
        >
          {p.playing ? <Pause size={12} strokeWidth={2} /> : <Play size={12} strokeWidth={2} />}
        </button>
        <span className="w-14 text-right font-mono text-[11px] tabular-nums text-neutral-300">{p.time.toFixed(2)}s</span>
        <label className="flex items-center gap-1 text-[10px] text-neutral-500">
          dur
          <input
            type="number"
            min={0.1}
            step={0.5}
            value={tl?.duration ?? 2}
            onChange={(e) => patch({ ...ensureTl(), duration: Math.max(0.1, Number(e.target.value)) })}
            className="h-6 w-14 rounded-md border border-white/10 bg-white/5 px-1.5 text-[11px] tabular-nums text-neutral-200 outline-none"
          />
        </label>
        <button
          title="Loop"
          onClick={() => patch({ ...ensureTl(), loop: !ensureTl().loop })}
          className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${tl?.loop ? 'bg-white/15 text-white' : 'text-neutral-500 hover:bg-white/10'}`}
        >
          <Repeat size={11} strokeWidth={2} />
        </button>
        <button title="Close animate mode" onClick={p.onClose} className="flex h-6 w-6 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-white/10 hover:text-neutral-200">
          <X size={12} strokeWidth={2} />
        </button>
      </div>

      <div className="flex">
        {/* every property, stopwatch-armed */}
        <div className="w-48 shrink-0 border-r border-white/5">
          <div style={{ height: RULER }} className="flex items-center px-3 text-[9px] uppercase tracking-[0.12em] text-neutral-600">
            property
          </div>
          {ANIM_PROPS.map((prop) => {
            const tr = trackFor(prop)
            return (
              <div key={prop} style={{ height: ROW }} className="flex items-center gap-1.5 px-3">
                <button
                  title={tr?.armed ? `Recording ${ANIM_PROP_LABEL[prop]} — edits write keyframes` : `Arm ${ANIM_PROP_LABEL[prop]} stopwatch`}
                  onClick={() => toggleStopwatch(prop)}
                  className={`flex h-5 w-5 items-center justify-center rounded transition-colors ${tr?.armed ? 'text-sky-400' : 'text-neutral-600 hover:text-neutral-300'}`}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill={tr?.armed ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="13" r="7" />
                    <path d="M12 6V3M9 3h6" />
                  </svg>
                </button>
                <span className={`flex-1 truncate text-[11px] ${tr ? 'text-neutral-200' : 'text-neutral-500'}`}>{ANIM_PROP_LABEL[prop]}</span>
                {tr && (
                  <>
                    <button
                      title="Key at playhead"
                      onClick={() => {
                        if (!node) return
                        patch({
                          ...ensureTl(),
                          tracks: ensureTl().tracks.map((t) =>
                            t.id === tr.id
                              ? {
                                  ...t,
                                  keys: sortKeys([
                                    ...t.keys.filter((k) => Math.abs(k.time - p.time) > 0.02),
                                    makeKey(p.time, currentValue(node, t.property)),
                                  ]),
                                }
                              : t,
                          ),
                        })
                      }}
                      className="flex h-5 w-5 items-center justify-center rounded text-neutral-500 transition-colors hover:text-amber-300"
                    >
                      <Diamond size={10} strokeWidth={2} />
                    </button>
                    <button
                      title="Remove track"
                      onClick={() => patch({ ...ensureTl(), tracks: ensureTl().tracks.filter((t) => t.id !== tr.id) })}
                      className="flex h-5 w-5 items-center justify-center rounded text-neutral-600 transition-colors hover:text-red-400"
                    >
                      <Trash2 size={10} strokeWidth={2} />
                    </button>
                  </>
                )}
              </div>
            )
          })}
        </div>

        {/* lanes */}
        <div ref={scrollRef} className="relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden" style={{ scrollbarWidth: 'thin' }}>
          <div className="relative" style={{ width: contentW }}>
            <div
              style={{ height: RULER }}
              className="relative cursor-ew-resize border-b border-white/5"
              onPointerDown={(e) => {
                if (e.button === 0) scrub(e, e.currentTarget)
              }}
            >
              {ticks.map((t) => (
                <span key={t} className="absolute top-0 h-full border-l border-white/10 pl-1 font-mono text-[8px] leading-[20px] text-neutral-600" style={{ left: t * pps }}>
                  {t}s
                </span>
              ))}
            </div>
            <div
              className="relative"
              style={{ backgroundImage: `repeating-linear-gradient(to right, rgba(255,255,255,0.05) 0 1px, transparent 1px ${grid * pps}px)` }}
              onPointerDown={(e) => {
                if (e.button === 0 && e.target === e.currentTarget) scrub(e, e.currentTarget)
              }}
            >
              {ANIM_PROPS.map((prop) => {
                const tr = trackFor(prop)
                return (
                  <div key={prop} style={{ height: ROW }} className="relative">
                    {tr?.keys.map((k) => (
                      <button
                        key={k.id}
                        title={`${k.time.toFixed(2)}s`}
                        onPointerDown={(e) => {
                          if (e.button === 0) dragKey(e, tr, k.id)
                        }}
                        className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 cursor-grab rounded-[2px] bg-amber-300 ring-1 ring-black/50 transition-colors hover:bg-amber-200"
                        style={{ left: k.time * pps }}
                      />
                    ))}
                  </div>
                )
              })}
            </div>
            <div className="pointer-events-none absolute bottom-0 top-0 w-px bg-sky-400" style={{ left: p.time * pps }}>
              <span className="absolute -left-[5px] top-0 h-2 w-[11px] bg-sky-400" style={{ clipPath: 'polygon(0 0, 100% 0, 50% 100%)' }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
