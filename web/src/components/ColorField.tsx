import { useEffect, useRef, useState } from 'react'
import { Plus, Unlink } from 'lucide-react'
import type { ColorVariable } from '../types'
import { uid } from '../utils'

interface Props {
  value: string
  /** id of the color variable this color currently tracks, if any */
  variableId?: string
  variables: ColorVariable[]
  onChange: (color: string, variableId?: string) => void
  /** creates a new document variable from the given color */
  onCreateVariable?: (v: ColorVariable) => void
  disabled?: boolean
  title?: string
}

/**
 * Swatch + popover picker. Besides a plain colour it can bind the value
 * to one of the document's color variables — picking a variable sets the
 * concrete colour and remembers the link, the way Figma and Lunacy do it.
 */
export function ColorField({ value, variableId, variables, onChange, onCreateVariable, disabled, title }: Props) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const swatchRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const bound = variables.find((v) => v.id === variableId)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (popRef.current?.contains(e.target as Node)) return
      if (swatchRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = () => {
    if (disabled) return
    const r = swatchRef.current?.getBoundingClientRect()
    if (r) {
      const below = r.bottom + 8
      const flip = below + 260 > window.innerHeight
      setPos({ x: Math.max(8, Math.min(r.left, window.innerWidth - 228)), y: flip ? r.top - 8 - 252 : below })
    }
    setOpen((v) => !v)
  }

  return (
    <>
      <button
        ref={swatchRef}
        type="button"
        title={bound ? `${bound.name} · ${value}` : title ?? value}
        onClick={toggle}
        className={`relative h-6 w-6 shrink-0 overflow-hidden rounded-md ring-1 ring-white/20 transition-opacity ${disabled ? 'opacity-30' : 'cursor-pointer hover:ring-white/40'}`}
        style={{ backgroundColor: value }}
      >
        {bound && (
          <span className="absolute bottom-0 right-0 h-2 w-2 rounded-tl bg-white ring-1 ring-black/40" title={`Variable: ${bound.name}`} />
        )}
      </button>

      {open && (
        <div
          ref={popRef}
          className="fixed z-50 w-56 rounded-xl border border-white/10 bg-ink-925/95 p-3 shadow-panel backdrop-blur-2xl"
          style={{ left: pos.x, top: pos.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2">
            <label
              className="relative h-8 w-8 shrink-0 cursor-pointer overflow-hidden rounded-lg ring-1 ring-white/20"
              style={{ backgroundColor: value }}
            >
              <input
                type="color"
                value={normalizeHex(value)}
                onChange={(e) => onChange(e.target.value, undefined)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </label>
            <input
              value={value}
              spellCheck={false}
              onChange={(e) => {
                const v = e.target.value
                if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v)) onChange(v, undefined)
              }}
              onBlur={(e) => {
                if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(e.target.value)) e.target.value = value
              }}
              onFocus={(e) => e.target.select()}
              className="h-7 w-full rounded-md border border-white/10 bg-white/5 px-2 font-mono text-[11px] uppercase text-neutral-200 outline-none focus:border-white/30"
            />
          </div>

          <div className="mt-3 flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-neutral-500">Variables</span>
            {onCreateVariable && (
              <button
                title="Create variable from this color"
                onClick={() => {
                  const v: ColorVariable = { id: uid(), name: `Color ${variables.length + 1}`, color: value }
                  onCreateVariable(v)
                  onChange(value, v.id)
                }}
                className="flex h-5 w-5 items-center justify-center rounded text-neutral-500 transition-colors hover:bg-white/10 hover:text-neutral-100"
              >
                <Plus size={11} strokeWidth={2} />
              </button>
            )}
          </div>

          {variables.length === 0 ? (
            <p className="mt-1.5 text-[10px] leading-relaxed text-neutral-600">
              No color variables yet — add one with +, or from the Colors tab.
            </p>
          ) : (
            <div className="mt-1.5 grid grid-cols-6 gap-1.5">
              {variables.map((v) => (
                <button
                  key={v.id}
                  title={`${v.name} · ${v.color}`}
                  onClick={() => onChange(v.color, v.id)}
                  className={`h-6 w-6 rounded-md ring-1 transition-all ${
                    v.id === variableId ? 'ring-2 ring-white' : 'ring-white/15 hover:ring-white/40'
                  }`}
                  style={{ backgroundColor: v.color }}
                />
              ))}
            </div>
          )}

          {bound && (
            <button
              onClick={() => onChange(value, undefined)}
              className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-md border border-white/10 py-1.5 text-[10px] text-neutral-400 transition-colors hover:bg-white/5 hover:text-neutral-200"
            >
              <Unlink size={10} strokeWidth={2} />
              Detach from “{bound.name}”
            </button>
          )}
        </div>
      )}
    </>
  )
}

function normalizeHex(c: string): string {
  if (c.startsWith('#') && (c.length === 7 || c.length === 9)) return c.length === 9 ? c.slice(0, 7) : c
  return '#ffffff'
}
