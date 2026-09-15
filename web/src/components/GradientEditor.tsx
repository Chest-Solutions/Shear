import { Plus, Trash2 } from 'lucide-react'
import type { GradientFill } from '../types'
import { gradientEnds } from '../render'
import { ColorField } from './ColorField'
import type { ColorVariable } from '../types'

interface Props {
  value: GradientFill | null | undefined
  onChange: (g: GradientFill | null) => void
  variables: ColorVariable[]
}

/** Linear gradient editor: angle + draggable stops on a preview bar. */
export function GradientEditor({ value, onChange, variables }: Props) {
  const g = value ?? { angle: 90, stops: [{ pos: 0, color: '#ffffff' }, { pos: 1, color: '#000000' }] }
  const set = (next: GradientFill) => onChange(next)

  return (
    <div className="space-y-2">
      {/* preview bar with stops */}
      <div
        className="relative h-5 w-full rounded-md ring-1 ring-white/15"
        style={{ background: `linear-gradient(90deg, ${[...g.stops].sort((a, b) => a.pos - b.pos).map((s) => `${s.color} ${s.pos * 100}%`).join(', ')})` }}
      >
        {g.stops.map((s, i) => (
          <input
            key={i}
            type="range"
            min={0}
            max={100}
            value={Math.round(s.pos * 100)}
            title={`Stop ${i + 1} position`}
            onChange={(e) => {
              const stops = g.stops.map((x, j) => (j === i ? { ...x, pos: Number(e.target.value) / 100 } : x))
              set({ ...g, stops })
            }}
            className="absolute inset-0 w-full opacity-0"
          />
        ))}
        {g.stops.map((s, i) => (
          <span
            key={`m${i}`}
            className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
            style={{ left: `${s.pos * 100}%`, background: s.color }}
          />
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-neutral-500">Angle</span>
        <input
          type="number"
          value={Math.round(g.angle)}
          onChange={(e) => set({ ...g, angle: Number(e.target.value) })}
          className="h-6 w-14 rounded-md border border-white/10 bg-white/5 px-1.5 text-[11px] tabular-nums text-neutral-200 outline-none focus:border-white/30"
        />
        <span className="text-[10px] text-neutral-600">°</span>
        <div className="flex-1" />
        <button
          title="Add stop"
          onClick={() => set({ ...g, stops: [...g.stops, { pos: 0.5, color: '#888888' }] })}
          className="flex h-6 w-6 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-white/10 hover:text-neutral-100"
        >
          <Plus size={12} strokeWidth={2} />
        </button>
      </div>

      <div className="space-y-1">
        {g.stops.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <ColorField
              compact
              value={s.color}
              variables={variables}
              onChange={(c) => set({ ...g, stops: g.stops.map((x, j) => (j === i ? { ...x, color: c } : x)) })}
            />
            <span className="text-[10px] tabular-nums text-neutral-500">{Math.round(s.pos * 100)}%</span>
            <div className="flex-1" />
            {g.stops.length > 2 && (
              <button
                title="Remove stop"
                onClick={() => set({ ...g, stops: g.stops.filter((_, j) => j !== i) })}
                className="flex h-5 w-5 items-center justify-center rounded text-neutral-600 transition-colors hover:bg-white/10 hover:text-neutral-200"
              >
                <Trash2 size={11} strokeWidth={2} />
              </button>
            )}
          </div>
        ))}
      </div>
      <p className="text-[10px] leading-relaxed text-neutral-600">
        {Math.round(g.angle)}° — top→bottom; 0° paints left→right.
      </p>
    </div>
  )
}

export function gradientPreview(g: GradientFill, w: number, h: number): string {
  void gradientEnds
  void w
  void h
  return `linear-gradient(${g.angle + 90}deg, ${[...g.stops].sort((a, b) => a.pos - b.pos).map((s) => `${s.color} ${s.pos * 100}%`).join(', ')})`
}
