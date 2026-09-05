import { AlignCenter, AlignLeft, AlignRight, Copy, Trash2, X } from 'lucide-react'
import type { Adjust, Effect, Node, Scene, TextAlign } from '../types'
import { NODE_TYPE_LABEL } from '../types'
import { defaultCornerRadii, uid } from '../utils'
import { defaultAdjust } from '../anim'
import { TimelinePanel, Slider } from './Timeline'

interface Props {
  node: Node | null
  scene: Scene
  onUpdateNode: (id: string, patch: Partial<Node>) => void
  onUpdateText: (id: string, patch: Partial<NonNullable<Node['text']>>) => void
  onUpdateScene: (patch: Partial<Scene>) => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
  onSelect: () => void
  time: number
  playing: boolean
  onTime: (t: number) => void
  onPlaying: (v: boolean) => void
}

export function RightPanel(props: Props) {
  return (
    <aside className="flex w-72 min-w-64 max-w-[520px] shrink-0 resize-x flex-col overflow-auto border-l border-white/5 bg-neutral-900/60 backdrop-blur-xl">
      {props.node ? <NodeProps {...props} node={props.node} /> : <SceneProps {...props} scene={props.scene} />}
    </aside>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-white/5 px-3 py-3">
      <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.12em] text-neutral-500">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function NodeProps(props: Props & { node: Node }) {
  const n = props.node
  return (
    <>
      <div className="flex items-center gap-2 border-b border-white/5 px-3 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">{NODE_TYPE_LABEL[n.type]}</div>
          <input
            value={n.name}
            onChange={(e) => props.onUpdateNode(n.id, { name: e.target.value })}
            spellCheck={false}
            className="mt-0.5 w-full truncate bg-transparent text-[13px] font-medium text-neutral-100 outline-none"
          />
        </div>
        <button
          title="Duplicate (⌘D)"
          onClick={() => props.onDuplicate(n.id)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-white/10 hover:text-neutral-100"
        >
          <Copy size={13} strokeWidth={1.8} />
        </button>
        <button
          title="Delete (⌫)"
          onClick={() => props.onDelete(n.id)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-white/10 hover:text-neutral-100"
        >
          <Trash2 size={13} strokeWidth={1.8} />
        </button>
      </div>

      <Section title="Transform">
        <div className="grid grid-cols-2 gap-1.5">
          <NumField label="X" value={n.x} onChange={(v) => props.onUpdateNode(n.id, { x: v })} />
          <NumField label="Y" value={n.y} onChange={(v) => props.onUpdateNode(n.id, { y: v })} />
          <NumField label="W" value={n.width} min={1} onChange={(v) => props.onUpdateNode(n.id, { width: v })} />
          <NumField label="H" value={n.height} min={1} onChange={(v) => props.onUpdateNode(n.id, { height: v })} />
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <NumField label="Rot" value={n.rotation} suffix="°" onChange={(v) => props.onUpdateNode(n.id, { rotation: v })} />
        </div>
        <Slider label="Opacity" value={Math.round(n.opacity * 100)} min={0} max={100} suffix="%" onChange={(v) => props.onUpdateNode(n.id, { opacity: v / 100 })} />
      </Section>

      {(n.type === 'rect' || n.type === 'frame' || n.type === 'ellipse' || n.type === 'line') && (
        <Section title="Fill">
          <div className="flex items-center gap-2">
            <Toggle on={n.fill !== null} onToggle={() => props.onUpdateNode(n.id, { fill: n.fill === null ? '#ffffff' : null })} />
            <ColorField
              value={n.fill ?? '#ffffff'}
              disabled={n.fill === null}
              onChange={(c) => props.onUpdateNode(n.id, { fill: n.fill === null ? null : c })}
            />
            {n.fill !== null && (
              <button
                title="Clear fill"
                onClick={() => props.onUpdateNode(n.id, { fill: null })}
                className="flex h-6 w-6 items-center justify-center rounded-md text-neutral-600 transition-colors hover:bg-white/10 hover:text-neutral-300"
              >
                <X size={12} strokeWidth={2} />
              </button>
            )}
          </div>
        </Section>
      )}

      <Section title="Stroke">
        <div className="flex items-center gap-2">
          <Toggle on={n.stroke !== null} onToggle={() => props.onUpdateNode(n.id, { stroke: n.stroke ? null : { color: '#ffffff', width: 1 } })} />
          <ColorField
            value={n.stroke?.color ?? '#ffffff'}
            disabled={n.stroke === null}
            onChange={(c) => props.onUpdateNode(n.id, { stroke: { color: c, width: n.stroke?.width ?? 1 } })}
          />
          {n.stroke !== null && (
            <div className="flex h-6 w-12 items-center rounded-md border border-white/10 bg-white/5 px-2">
              <input
                type="number"
                min={0}
                max={100}
                value={n.stroke.width}
                onChange={(e) => props.onUpdateNode(n.id, { stroke: { color: n.stroke!.color, width: clampNum(e.target.value, 0, 100) } })}
                className="w-full bg-transparent text-[11px] tabular-nums text-neutral-300 outline-none"
              />
            </div>
          )}
        </div>
      </Section>

      {(n.type === 'rect' || n.type === 'frame') && (
        <Section title="Corners">
          <CornerControls node={n} onUpdate={(patch) => props.onUpdateNode(n.id, patch)} />
        </Section>
      )}

      <Section title="Timeline">
        <TimelinePanel
          node={n}
          time={props.time}
          playing={props.playing}
          onTime={props.onTime}
          onPlay={props.onPlaying}
          onUpdate={(patch) => props.onUpdateNode(n.id, patch)}
        />
      </Section>

      <Section title="Effects">
        <EffectsControls node={n} onUpdate={(patch) => props.onUpdateNode(n.id, patch)} />
      </Section>

      <Section title="Adjustments">
        <AdjustControls node={n} onUpdate={(patch) => props.onUpdateNode(n.id, patch)} />
      </Section>

      {n.type === 'text' && n.text && (
        <Section title="Text">
          <textarea
            value={n.text.content}
            onChange={(e) => props.onUpdateText(n.id, { content: e.target.value })}
            rows={3}
            spellCheck={false}
            className="w-full resize-none rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-[12px] leading-relaxed text-neutral-200 outline-none transition-colors focus:border-white/30"
          />
          <div className="grid grid-cols-2 gap-1.5">
            <PresetNumField label="Size" value={n.text.fontSize} options={[8, 10, 12, 14, 16, 18, 24, 32, 48, 64, 96]} min={4} onChange={(v) => props.onUpdateText(n.id, { fontSize: v })} />
            <label className="flex h-7 items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2">
              <span className="text-[10px] text-neutral-500">Weight</span>
              <select
                value={n.text.fontWeight}
                onChange={(e) => props.onUpdateText(n.id, { fontWeight: Number(e.target.value) })}
                className="w-full bg-transparent text-[11px] text-neutral-300 outline-none [&>option]:bg-neutral-900"
              >
                <option value={400}>Regular</option>
                <option value={500}>Medium</option>
                <option value={600}>SemiBold</option>
                <option value={700}>Bold</option>
              </select>
            </label>
          </div>
          <div className="flex items-center justify-between">
            <ColorField value={n.text.color} onChange={(c) => props.onUpdateText(n.id, { color: c })} />
            <div className="flex gap-0.5 rounded-md border border-white/10 bg-white/5 p-0.5">
              {(['left', 'center', 'right'] as TextAlign[]).map((a) => (
                <button
                  key={a}
                  title={`Align ${a}`}
                  onClick={() => props.onUpdateText(n.id, { align: a })}
                  className={`flex h-6 w-6 items-center justify-center rounded p-1 transition-colors ${
                    n.text!.align === a ? 'bg-white text-neutral-900' : 'text-neutral-400 hover:text-neutral-100'
                  }`}
                >
                  {a === 'left' ? <AlignLeft size={12} strokeWidth={2} /> : a === 'center' ? <AlignCenter size={12} strokeWidth={2} /> : <AlignRight size={12} strokeWidth={2} />}
                </button>
              ))}
            </div>
          </div>
        </Section>
      )}
    </>
  )
}

function SceneProps(props: Props & { scene: Scene }) {
  const s = props.scene
  return (
    <>
      <div className="border-b border-white/5 px-3 py-3">
        <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">Scene</div>
        <input
          value={s.name}
          onChange={(e) => props.onUpdateScene({ name: e.target.value })}
          spellCheck={false}
          className="mt-0.5 w-full bg-transparent text-[13px] font-medium text-neutral-100 outline-none"
        />
        <button
          onClick={props.onSelect}
          className="mt-1 text-[11px] text-neutral-600 transition-colors hover:text-neutral-400"
        >
          Select a layer to edit it
        </button>
      </div>
      <Section title="Canvas">
        <div className="grid grid-cols-2 gap-1.5">
          <NumField label="W" value={s.width} min={50} step={10} onChange={(v) => props.onUpdateScene({ width: v })} />
          <NumField label="H" value={s.height} min={50} step={10} onChange={(v) => props.onUpdateScene({ height: v })} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-neutral-500">Background</span>
          <ColorField value={s.background} onChange={(c) => props.onUpdateScene({ background: c })} />
        </div>
      </Section>
    </>
  )
}

function clampNum(v: string, min: number, max: number): number {
  const n = Number(v)
  if (Number.isNaN(n)) return min
  return Math.min(max, Math.max(min, n))
}

function NumField(props: { label: string; value: number; onChange: (v: number) => void; min?: number; step?: number; suffix?: string }) {
  return (
    <label className="flex h-7 items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 transition-colors focus-within:border-white/30">
      <span className="text-[10px] text-neutral-500">{props.label}</span>
      <input
        type="number"
        value={Math.round(props.value * 10) / 10}
        min={props.min}
        step={props.step ?? 1}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (!Number.isNaN(v)) props.onChange(v)
        }}
        onFocus={(e) => e.target.select()}
        className="w-full bg-transparent text-[12px] tabular-nums text-neutral-200 outline-none"
      />
      {props.suffix && <span className="text-[10px] text-neutral-600">{props.suffix}</span>}
    </label>
  )
}

function ColorField({ value, onChange, disabled }: { value: string; onChange: (c: string) => void; disabled?: boolean }) {
  return (
    <label
      title={value}
      className={`relative h-6 w-6 shrink-0 overflow-hidden rounded-md ring-1 ring-white/20 transition-opacity ${disabled ? 'opacity-30' : 'cursor-pointer'}`}
      style={{ backgroundColor: value }}
    >
      <input
        type="color"
        value={disabled ? '#000000' : normalizeHex(value)}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </label>
  )
}


function PresetNumField(props: { label: string; value: number; options: number[]; onChange: (v: number) => void; min?: number }) {
  const id = `preset-${props.label}`
  return (
    <label className="flex h-7 items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 transition-colors focus-within:border-white/30">
      <span className="text-[10px] text-neutral-500">{props.label}</span>
      <input type="number" list={id} value={Math.round(props.value * 10) / 10} min={props.min} onChange={(e) => { const v = Number(e.target.value); if (!Number.isNaN(v)) props.onChange(v) }} onFocus={(e) => e.target.select()} className="w-full bg-transparent text-[12px] tabular-nums text-neutral-200 outline-none" />
      <datalist id={id}>{props.options.map((o) => <option key={o} value={o} />)}</datalist>
    </label>
  )
}

function CornerControls({ node, onUpdate }: { node: Node; onUpdate: (patch: Partial<Node>) => void }) {
  const r = { ...defaultCornerRadii(node.cornerRadius ?? 0), ...(node.cornerRadii ?? {}) }
  const max = Math.max(0, Math.floor(Math.min(node.width, node.height) / 2))
  const setAll = (v: number) => onUpdate({ cornerRadius: v, cornerRadii: { tl: v, tr: v, br: v, bl: v, linked: true } })
  const setOne = (k: 'tl' | 'tr' | 'br' | 'bl', v: number) => {
    const next = { ...r, [k]: v, linked: false }
    onUpdate({ cornerRadius: Math.max(next.tl, next.tr, next.br, next.bl), cornerRadii: next })
  }
  return <div className="space-y-2"><div className="flex items-center justify-between"><span className="text-[11px] text-neutral-500">Linked corners</span><Toggle on={r.linked} onToggle={() => onUpdate({ cornerRadii: { ...r, linked: !r.linked } })} /></div><Slider label="All" value={r.linked ? r.tl : Math.max(r.tl, r.tr, r.br, r.bl)} min={0} max={max} onChange={setAll} /><div className="grid grid-cols-2 gap-1.5"><NumField label="TL" value={r.tl} min={0} onChange={(v) => setOne('tl', v)} /><NumField label="TR" value={r.tr} min={0} onChange={(v) => setOne('tr', v)} /><NumField label="BR" value={r.br} min={0} onChange={(v) => setOne('br', v)} /><NumField label="BL" value={r.bl} min={0} onChange={(v) => setOne('bl', v)} /></div><p className="text-[10px] leading-relaxed text-neutral-600">Drag the blue corner dots on-canvas. Hold Shift to change only that corner.</p></div>
}

function EffectsControls({ node, onUpdate }: { node: Node; onUpdate: (patch: Partial<Node>) => void }) {
  const effects = node.effects ?? []
  const update = (id: string, patch: Partial<Effect>) => onUpdate({ effects: effects.map((e) => e.id === id ? { ...e, ...patch } as Effect : e) })
  const remove = (id: string) => onUpdate({ effects: effects.filter((e) => e.id !== id) })
  const addShadow = () => onUpdate({ effects: [...effects, { id: uid(), type: 'drop-shadow', visible: true, color: '#000000', x: 0, y: 8, blur: 24, spread: 0 }] })
  const addBlur = () => onUpdate({ effects: [...effects, { id: uid(), type: 'layer-blur', visible: true, blur: 4 }] })
  return <div className="space-y-2">{effects.map((e) => <div key={e.id} className="space-y-1.5 rounded-lg border border-white/10 bg-white/[0.03] p-2"><div className="flex items-center gap-2"><Toggle on={e.visible} onToggle={() => update(e.id, { visible: !e.visible })} /><select value={e.type} onChange={(ev) => update(e.id, ev.target.value === 'layer-blur' || ev.target.value === 'background-blur' ? { type: ev.target.value as 'layer-blur' | 'background-blur', blur: 'blur' in e ? e.blur : 4 } as Partial<Effect> : { type: ev.target.value as 'drop-shadow' | 'inner-shadow', color: 'color' in e ? e.color : '#000000', x: 0, y: 8, blur: 'blur' in e ? e.blur : 24, spread: 0 } as Partial<Effect>)} className="min-w-0 flex-1 bg-transparent text-[11px] text-neutral-300 outline-none [&>option]:bg-neutral-900"><option value="drop-shadow">Drop shadow</option><option value="inner-shadow">Inner shadow</option><option value="layer-blur">Layer blur</option><option value="background-blur">Background blur</option></select><button onClick={() => remove(e.id)} className="text-neutral-600 hover:text-neutral-200"><X size={12} /></button></div>{'color' in e ? <div className="flex items-center gap-2"><ColorField value={e.color} onChange={(c) => update(e.id, { color: c })} /><NumField label="X" value={e.x} onChange={(v) => update(e.id, { x: v })} /><NumField label="Y" value={e.y} onChange={(v) => update(e.id, { y: v })} /></div> : null}{'spread' in e ? <div className="grid grid-cols-2 gap-1.5"><NumField label="Blur" value={e.blur} min={0} onChange={(v) => update(e.id, { blur: v })} /><NumField label="Spread" value={e.spread} onChange={(v) => update(e.id, { spread: v })} /></div> : <Slider label="Blur" value={e.blur} min={0} max={80} onChange={(v) => update(e.id, { blur: v })} />}</div>)}<div className="flex gap-1.5"><button onClick={addShadow} className="rounded-md bg-white/10 px-2 py-1 text-[11px] hover:bg-white/15">+ Shadow</button><button onClick={addBlur} className="rounded-md bg-white/10 px-2 py-1 text-[11px] hover:bg-white/15">+ Blur</button></div></div>
}

/**
 * Image adjustments. Every slider is an offset from normal, so the centre
 * (or zero) is always "untouched" and Reset puts everything back.
 */
function AdjustControls({ node, onUpdate }: { node: Node; onUpdate: (patch: Partial<Node>) => void }) {
  const a: Adjust = { ...defaultAdjust(), ...(node.adjust ?? {}) }
  const set = (patch: Partial<Adjust>) => onUpdate({ adjust: { ...a, ...patch } })
  const touched = Object.values(a).some((v) => v !== 0)

  return (
    <div className="space-y-1.5">
      <Slider label="Exposure" value={a.brightness} min={-100} max={100} onChange={(v) => set({ brightness: v })} />
      <Slider label="Contrast" value={a.contrast} min={-100} max={100} onChange={(v) => set({ contrast: v })} />
      <Slider label="Saturation" value={a.saturation} min={-100} max={100} onChange={(v) => set({ saturation: v })} />
      <Slider label="Warmth" value={a.temperature} min={-100} max={100} onChange={(v) => set({ temperature: v })} />
      <Slider label="Hue" value={a.hue} min={-180} max={180} suffix="\u00b0" onChange={(v) => set({ hue: v })} />
      <Slider label="Blur" value={a.blur} min={0} max={50} step={0.5} onChange={(v) => set({ blur: v })} />
      <Slider label="B&W" value={a.grayscale} min={0} max={100} suffix="%" onChange={(v) => set({ grayscale: v })} />
      <Slider label="Invert" value={a.invert} min={0} max={100} suffix="%" onChange={(v) => set({ invert: v })} />
      {touched && (
        <button
          onClick={() => onUpdate({ adjust: defaultAdjust() })}
          className="w-full rounded-md py-1 text-[10px] text-neutral-500 transition-colors hover:bg-white/5 hover:text-neutral-300"
        >
          Reset
        </button>
      )}
    </div>
  )
}

function normalizeHex(c: string): string {
  if (c.startsWith('#') && (c.length === 7 || c.length === 9)) return c.length === 9 ? c.slice(0, 7) : c
  return '#ffffff'
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`relative h-4 w-7 shrink-0 rounded-full transition-colors duration-200 ${on ? 'bg-white' : 'bg-neutral-700'}`}
    >
      <span
        className={`absolute top-0.5 h-3 w-3 rounded-full transition-all duration-200 ${
          on ? 'left-3.5 bg-neutral-900' : 'left-0.5 bg-neutral-400'
        }`}
      />
    </button>
  )
}
