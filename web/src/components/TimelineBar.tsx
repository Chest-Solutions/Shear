import { useMemo, useRef, useState } from 'react'
import { Diamond, Gem, Pause, Play, Plus, Repeat, Trash2, X } from 'lucide-react'
import type { Node, Timeline, Track } from '../types'
import { ANIM_PROPS, ANIM_PROP_LABEL } from '../types'
import { currentValue, makeKey, makeTrack, sortKeys, timelineLength } from '../anim'

interface Props {
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
 * After-Effects-style timeline: floats bottom-centre while animate mode is
 * on. Properties only record keys while their stopwatch is armed; the
 * playhead snaps to keyframes with Ctrl; keys snap to the grid and to each
 * other; middle-drag pans; Ctrl+scroll zooms.
 */
export function TimelineBar(p: Props) {
  const [pps, setPps] = useState(140)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const node = p.node
  const tl = node?.timeline

  const length = useMemo(() => (tl ? Math.max(tl.duration, timelineLength(tl) + 0.5) : 2), [tl])
  const contentW = Math.max(600, (length + 2) * pps)
  const grid = niceGrid(pps)

  const patch = (next: Timeline) => {
    if (node) p.onTimeline(node.id, next)
  }

  const ensureTl = (): Timeline => tl ?? { duration: 2, trigger: 'view', loop: false, tracks: [] }

  const keyTimes = useMemo(() => {
    const ts: number[] = []
    for (const tr of tl?.tracks ?? []) for (const k of tr.keys) ts.push(k.time)
    return ts
  }, [tl])

  // ---- scrubbing -----------------------------------------------------
  const scrub = (e: React.PointerEvent, el: HTMLElement) => {
    const move = (ev: PointerEvent) => {
      const rect = el.getBoundingClientRect()
      const scroll = scrollRef.current?.scrollLeft ?? 0
      let t = (ev.clientX - rect.left + scroll) / pps
      if (ev.ctrlKey || ev.metaKey) {
        const snap = keyTimes.find((k) => Math.abs(k - t) * pps < 12)
        if (snap !== undefined) t = snap
      }
      p.onTime(Math.max(0, Math.min(length, Math.round(t * 100) / 100)))
    }
    move(e.nativeEvent)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', () => window.removeEventListener('pointermove', move), { once: true })
  }

  // ---- key dragging ---------------------------------------------------
  const dragKey = (e: React.PointerEvent, track: Track, keyId: string) => {
    e.stopPropagation()
    e.preventDefault()
    const startX = e.clientX
    const key = track.keys.find((k) => k.id === keyId)
    if (!key) return
    const orig = key.time
    const move = (ev: PointerEvent) => {
      let t = orig + (ev.clientX - startX) / pps
      // snap to grid…
      const snapped = Math.round(t / grid) * grid
      let best = snapped
      let bestDist = Math.abs(snapped - t)
      // …and to the other keyframes / playhead
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

  // ---- pan & zoom ------------------------------------------------------
  const middlePan = (e: React.PointerEvent) => {
    if (e.button !== 1) return
    e.preventDefault()
    const el = scrollRef.current
    if (!el) return
    const startX = e.clientX
    const start = el.scrollLeft
    const move = (ev: PointerEvent) => {
      el.scrollLeft = start - (ev.clientX - startX)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', () => window.removeEventListener('pointermove', move), { once: true })
  }

  const wheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return
    const el = scrollRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const anchor = (e.clientX - rect.left + el.scrollLeft) / pps
    const next = Math.min(640, Math.max(24, pps * (e.deltaY < 0 ? 1.2 : 1 / 1.2)))
    setPps(next)
    requestAnimationFrame(() => {
      el.scrollLeft = anchor * next - (e.clientX - rect.left)
    })
  }

  const ticks: number[] = []
  for (let t = 0; t <= length + 2; t += grid) ticks.push(Math.round(t * 100) / 100)

  return (
    <div
      className="absolute bottom-4 left-1/2 z-30 w-[min(940px,94%)] -translate-x-1/2 overflow-hidden rounded-xl border border-white/10 bg-ink-900/95 shadow-panel backdrop-blur-xl"
      onPointerDown={middlePan}
      onWheel={wheel}
    >
      {/* header */}
      <div className="flex h-9 items-center gap-2 border-b border-white/5 px-3">
        <Gem size={12} strokeWidth={1.8} className="text-sky-400" />
        <span className="max-w-40 truncate text-[11px] font-medium text-neutral-200">{node ? node.name : 'Nothing selected'}</span>
        <span className="text-[10px] text-neutral-600">animate</span>
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
        <div className="relative">
          <button
            title="Add animated property"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-6 items-center gap-1 rounded-md bg-white/10 px-2 text-[10px] text-neutral-200 transition-colors hover:bg-white/15"
          >
            <Plus size={11} strokeWidth={2} /> Property
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-7 z-40 w-36 rounded-lg border border-white/10 bg-ink-900/95 p-1 shadow-panel backdrop-blur-xl">
              {ANIM_PROPS.filter((pr) => !tl?.tracks.some((t) => t.property === pr)).map((pr) => (
                <button
                  key={pr}
                  onClick={() => {
                    if (node) {
                      const track: Track = { ...makeTrack(pr, node), armed: true, keys: [makeKey(p.time, currentValue(node, pr))] }
                      patch({ ...ensureTl(), tracks: [...ensureTl().tracks, track] })
                    }
                    setMenuOpen(false)
                  }}
                  className="flex w-full items-center rounded-md px-2 py-1 text-[11px] text-neutral-300 transition-colors hover:bg-white/10"
                >
                  {ANIM_PROP_LABEL[pr]}
                </button>
              ))}
            </div>
          )}
        </div>
        <button title="Close animate mode" onClick={p.onClose} className="flex h-6 w-6 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-white/10 hover:text-neutral-200">
          <X size={12} strokeWidth={2} />
        </button>
      </div>

      {!node ? (
        <p className="px-4 py-4 text-center text-[11px] text-neutral-500">Select a layer to animate it.</p>
      ) : (
        <div className="flex">
          {/* track headers */}
          <div className="w-44 shrink-0 border-r border-white/5">
            <div style={{ height: RULER }} className="flex items-center px-3 text-[9px] uppercase tracking-[0.12em] text-neutral-600">
              property
            </div>
            {(tl?.tracks ?? []).map((tr) => (
              <div key={tr.id} style={{ height: ROW }} className="flex items-center gap-1.5 px-3">
                <button
                  title={tr.armed ? 'Stopwatch on — edits write keyframes' : 'Arm stopwatch to record keyframes'}
                  onClick={() =>
                    patch({ ...ensureTl(), tracks: ensureTl().tracks.map((t) => (t.id === tr.id ? { ...t, armed: !t.armed } : t)) })
                  }
                  className={`flex h-5 w-5 items-center justify-center rounded transition-colors ${tr.armed ? 'text-sky-400' : 'text-neutral-600 hover:text-neutral-300'}`}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill={tr.armed ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="13" r="7" />
                    <path d="M12 6V3M9 3h6" />
                  </svg>
                </button>
                <span className="flex-1 truncate text-[11px] text-neutral-300">{ANIM_PROP_LABEL[tr.property]}</span>
                <button
                  title="Add keyframe at playhead"
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
                                makeKey(p.time, currentValue(node, tr.property)),
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
              </div>
            ))}
            {(tl?.tracks.length ?? 0) === 0 && (
              <p className="px-3 py-2 text-[10px] leading-relaxed text-neutral-600">Add a property, then arm its stopwatch.</p>
            )}
          </div>

          {/* lanes */}
          <div ref={scrollRef} className="relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden" style={{ scrollbarWidth: 'thin' }}>
            <div className="relative" style={{ width: contentW }}>
              {/* ruler */}
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
              {/* rows */}
              <div
                className="relative"
                style={{
                  backgroundImage: `repeating-linear-gradient(to right, rgba(255,255,255,0.05) 0 1px, transparent 1px ${grid * pps}px)`,
                }}
                onPointerDown={(e) => {
                  if (e.button === 0 && e.target === e.currentTarget) scrub(e, e.currentTarget)
                }}
              >
                {(tl?.tracks ?? []).map((tr) => (
                  <div key={tr.id} style={{ height: ROW }} className="relative">
                    {tr.keys.map((k) => (
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
                ))}
                {(tl?.tracks.length ?? 0) === 0 && <div style={{ height: ROW * 2 }} />}
              </div>
              {/* playhead */}
              <div className="pointer-events-none absolute bottom-0 top-0 w-px bg-sky-400" style={{ left: p.time * pps }}>
                <span className="absolute -left-[5px] top-0 h-2 w-[11px] bg-sky-400" style={{ clipPath: 'polygon(0 0, 100% 0, 50% 100%)' }} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
