import { Plus, Trash2 } from 'lucide-react'
import type { ColorVariable } from '../types'
import { uid } from '../utils'

interface Props {
  variables: ColorVariable[]
  onChange: (next: ColorVariable[]) => void
  /** how many nodes/scenes reference each variable — shown as a hint */
  usage: (id: string) => number
}

/**
 * The document's color variables — named, reusable colours that stay in
 * sync everywhere they're used (Figma's Local variables, Lunacy's
 * palette, same idea).
 */
export function ColorsPanel({ variables, onChange, usage }: Props) {
  const update = (id: string, patch: Partial<ColorVariable>) =>
    onChange(variables.map((v) => (v.id === id ? { ...v, ...patch } : v)))

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 pb-1 pt-3">
        <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-neutral-500">Color variables</span>
        <button
          title="Add variable"
          onClick={() => onChange([...variables, { id: uid(), name: `Color ${variables.length + 1}`, color: '#ffffff' }])}
          className="flex h-5 w-5 items-center justify-center rounded text-neutral-500 transition-colors hover:bg-white/10 hover:text-neutral-100"
        >
          <Plus size={12} strokeWidth={2} />
        </button>
      </div>

      <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
        {variables.length === 0 && (
          <p className="px-1.5 py-3 text-[11px] leading-relaxed text-neutral-600">
            Create a variable once, reuse it everywhere. Change it here and every fill, stroke and text using it
            updates.
          </p>
        )}
        {variables.map((v) => {
          const used = usage(v.id)
          return (
            <div
              key={v.id}
              className="group flex h-7 items-center gap-2 rounded-md px-1.5 transition-colors hover:bg-white/5"
            >
              <label
                title={v.color}
                className="relative h-5 w-5 shrink-0 cursor-pointer overflow-hidden rounded ring-1 ring-white/20"
                style={{ backgroundColor: v.color }}
              >
                <input
                  type="color"
                  value={v.color.length === 9 ? v.color.slice(0, 7) : v.color}
                  onChange={(e) => update(v.id, { color: e.target.value })}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
              </label>
              <input
                value={v.name}
                spellCheck={false}
                onChange={(e) => update(v.id, { name: e.target.value })}
                onFocus={(e) => e.target.select()}
                className="w-full min-w-0 bg-transparent text-[12px] text-neutral-300 outline-none focus:text-neutral-100"
              />
              <span className="shrink-0 font-mono text-[9px] uppercase text-neutral-600">{v.color}</span>
              <button
                title={used > 0 ? `Used by ${used} object${used === 1 ? '' : 's'} — deleting keeps their colours` : 'Delete variable'}
                onClick={() => onChange(variables.filter((x) => x.id !== v.id))}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-neutral-600 opacity-0 transition-all hover:bg-white/10 hover:text-neutral-200 group-hover:opacity-100"
              >
                <Trash2 size={11} strokeWidth={1.8} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
