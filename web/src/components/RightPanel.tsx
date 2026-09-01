import { AlignCenter, AlignLeft, AlignRight, Copy, Trash2, X } from 'lucide-react'
import type { Node, Scene, TextAlign } from '../types'
import { NODE_TYPE_LABEL } from '../types'

interface Props {
  node: Node | null
  scene: Scene
  onUpdateNode: (id: string, patch: Partial<Node>) => void
  onUpdateText: (id: string, patch: Partial<NonNullable<Node['text']>>) => void
  onUpdateScene: (patch: Partial<Scene>) => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
  onSelect: () => void
}

export function RightPanel(props: Props) {
  return (
    <aside className="flex w-64 shrink-0 flex-col overflow-y-auto border-l border-white/5 bg-neutral-900/60 backdrop-blur-xl">
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
          <div className="flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-2">
            <span className="text-[10px] text-neutral-500">Opacity</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(n.opacity * 100)}
              onChange={(e) => props.onUpdateNode(n.id, { opacity: Number(e.target.value) / 100 })}
              className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-neutral-700 accent-white"
            />
            <span className="w-7 text-right text-[11px] tabular-nums text-neutral-400">{Math.round(n.opacity * 100)}</span>
          </div>
        </div>
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
        <Section title="Radius">
          <NumField label="R" value={n.cornerRadius ?? 0} min={0} onChange={(v) => props.onUpdateNode(n.id, { cornerRadius: v })} />
        </Section>
      )}

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
            <NumField label="Size" value={n.text.fontSize} min={4} onChange={(v) => props.onUpdateText(n.id, { fontSize: v })} />
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
