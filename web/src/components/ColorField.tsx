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
  compact?: boolean
}

// ---------------------------------------------------------------- color math

function hexToRgb(hex: string): [number, number, number, number] {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const r = parseInt(full.slice(0, 2) || 'ff', 16)
  const g = parseInt(full.slice(2, 4) || 'ff', 16)
  const b = parseInt(full.slice(4, 6) || 'ff', 16)
  const a = full.length >= 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1
  return [r, g, b, a]
}

function rgbToHex(r: number, g: number, b: number, a = 1): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return a >= 1 ? `#${c(r)}${c(g)}${c(b)}` : `#${c(r)}${c(g)}${c(b)}${c(a * 255)}`
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return [h, max === 0 ? 0 : d / max, max]
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let rgb: [number, number, number] = [0, 0, 0]
  if (h < 60) rgb = [c, x, 0]
  else if (h < 120) rgb = [x, c, 0]
  else if (h < 180) rgb = [0, c, x]
  else if (h < 240) rgb = [0, x, c]
  else if (h < 300) rgb = [x, 0, c]
  else rgb = [c, 0, x]
  return [Math.round((rgb[0] + m) * 255), Math.round((rgb[1] + m) * 255), Math.round((rgb[2] + m) * 255)]
}

export function normalizeHex(c: string): string {
  if (/^#([0-9a-fA-F]{6})$/.test(c)) return c
  if (/^#([0-9a-fA-F]{3})$/.test(c)) return '#' + c.slice(1).split('').map((x) => x + x).join('')
  if (/^#([0-9a-fA-F]{8})$/.test(c)) return c.slice(0, 7)
  return '#ffffff'
}

/**
 * Swatch + custom picker popover: saturation/value field, hue and alpha
 * sliders, hex input, and document color variables.
 */
export function ColorField({ value, variableId, variables, onChange, onCreateVariable, disabled, title, compact }: Props) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const swatchRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const bound = variables.find((v) => v.id === variableId)

  const [r, g, b, a] = hexToRgb(value)
  const [h, s, v] = rgbToHsv(r, g, b)

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
    const rct = swatchRef.current?.getBoundingClientRect()
    if (rct) {
      const below = rct.bottom + 8
      const height = 300
      const flip = below + height > window.innerHeight
      setPos({ x: Math.max(8, Math.min(rct.left, window.innerWidth - 240)), y: flip ? Math.max(8, rct.top - 8 - height) : below })
    }
    setOpen((v2) => !v2)
  }

  const emit = (nh: number, ns: number, nv: number, na: number) => {
    const [nr, ng, nb] = hsvToRgb(nh, ns, nv)
    onChange(rgbToHex(nr, ng, nb, na), undefined)
  }

  const svRef = useRef<HTMLDivElement>(null)
  const dragSV = (e: React.PointerEvent) => {
    e.preventDefault()
    const el = svRef.current
    if (!el) return
    const move = (ev: PointerEvent) => {
      const rect = el.getBoundingClientRect()
      const ns = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width))
      const nv = 1 - Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height))
      emit(h, ns, nv, a)
    }
    move(e.nativeEvent)
    const up = () => window.removeEventListener('pointermove', move)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up, { once: true })
  }

  return (
    <>
      <button
        ref={swatchRef}
        type="button"
        title={bound ? `${bound.name} · ${value}` : title ?? value}
        onClick={toggle}
        className={`relative shrink-0 overflow-hidden rounded-md ring-1 ring-white/20 transition-opacity ${compact ? 'h-5 w-5' : 'h-6 w-6'} ${disabled ? 'opacity-30' : 'cursor-pointer hover:ring-white/40'}`}
        style={{ background: value }}
      >
        {bound && <span className="absolute bottom-0 right-0 h-2 w-2 rounded-tl bg-white ring-1 ring-black/40" title={`Variable: ${bound.name}`} />}
      </button>

      {open && (
        <div
          ref={popRef}
          className="fixed z-50 w-60 rounded-xl border border-white/10 bg-ink-925/95 p-3 shadow-panel backdrop-blur-2xl"
          style={{ left: pos.x, top: pos.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* saturation / value field */}
          <div
            ref={svRef}
            onPointerDown={dragSV}
            className="relative h-40 w-full cursor-crosshair rounded-md ring-1 ring-white/10"
            style={{
              background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${h},100%,50%))`,
            }}
          >
            <span
              className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
              style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%` }}
            />
          </div>

          {/* hue */}
          <HueSlider hue={h} onChange={(nh) => emit(nh, s, v, a)} />
          {/* alpha */}
          <div className="mt-2 flex items-center gap-2">
            <div className="relative h-2.5 flex-1 rounded-full ring-1 ring-white/10" style={{ background: 'repeating-conic-gradient(#333 0% 25%, #555 0% 50%) 0 0 / 8px 8px' }}>
              <div className="absolute inset-0 rounded-full" style={{ background: `linear-gradient(to right, transparent, ${rgbToHex(r, g, b)})` }} />
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(a * 100)}
                onChange={(e) => emit(h, s, v, Number(e.target.value) / 100)}
                className="absolute inset-0 w-full opacity-0"
              />
            </div>
            <span className="w-8 text-right text-[10px] tabular-nums text-neutral-500">{Math.round(a * 100)}%</span>
          </div>

          <div className="mt-2.5 flex items-center gap-2">
            <span className="text-[10px] text-neutral-500">Hex</span>
            <input
              value={value}
              spellCheck={false}
              onChange={(e) => {
                const v2 = e.target.value
                if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v2)) onChange(v2, undefined)
              }}
              onBlur={(e) => {
                if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(e.target.value)) e.target.value = value
              }}
              onFocus={(e) => e.target.select()}
              className="h-7 w-full rounded-md border border-white/10 bg-white/5 px-2 font-mono text-[11px] uppercase text-neutral-200 outline-none focus:border-white/30"
            />
          </div>

          {onCreateVariable && (
            <button
              onClick={() => {
                const v2: ColorVariable = { id: uid(), name: `Color ${variables.length + 1}`, color: value }
                onCreateVariable(v2)
                onChange(value, v2.id)
              }}
              className="mt-3 w-full rounded-md border border-white/15 py-1.5 text-[11px] text-neutral-200 transition-colors hover:bg-white/10"
            >
              Create Color Variable
            </button>
          )}

          <div className="mt-3 flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-neutral-500">Variables</span>
            {onCreateVariable && (
              <button
                title="Create variable from this color"
                onClick={() => {
                  const v2: ColorVariable = { id: uid(), name: `Color ${variables.length + 1}`, color: value }
                  onCreateVariable(v2)
                  onChange(value, v2.id)
                }}
                className="flex h-5 w-5 items-center justify-center rounded text-neutral-500 transition-colors hover:bg-white/10 hover:text-neutral-100"
              >
                <Plus size={11} strokeWidth={2} />
              </button>
            )}
          </div>

          {variables.length === 0 ? (
            <p className="mt-1.5 text-[10px] leading-relaxed text-neutral-600">No color variables yet — add one with +.</p>
          ) : (
            <div className="mt-1.5 grid grid-cols-6 gap-1.5">
              {variables.map((v2) => (
                <button
                  key={v2.id}
                  title={`${v2.name} · ${v2.color}`}
                  onClick={() => onChange(v2.color, v2.id)}
                  className={`h-6 w-6 rounded-md ring-1 transition-all ${v2.id === variableId ? 'ring-2 ring-white' : 'ring-white/15 hover:ring-white/40'}`}
                  style={{ backgroundColor: v2.color }}
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

function HueSlider({ hue, onChange }: { hue: number; onChange: (h: number) => void }) {
  return (
    <div className="relative mt-2 h-2.5 rounded-full ring-1 ring-white/10" style={{ background: 'linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)' }}>
      <input
        type="range"
        min={0}
        max={360}
        value={Math.round(hue)}
        onChange={(e) => onChange(Number(e.target.value))}
        className="absolute inset-0 w-full opacity-0"
      />
      <span
        className="pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
        style={{ left: `${(hue / 360) * 100}%`, background: `hsl(${hue},100%,50%)` }}
      />
    </div>
  )
}
