import { useMemo, useState } from 'react'
import { AlignCenter, AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignHorizontalSpaceBetween, AlignLeft, AlignRight, AlignStartHorizontal, AlignStartVertical, AlignVerticalSpaceBetween, ChevronDown, Copy, Eye, EyeOff, FlipHorizontal2, FlipVertical2, LockKeyhole, Plus, Unlock, X } from 'lucide-react'
import type { ColorVariable, Effect, Node, Scene, SceneFormat, TextAlign } from '../types'
import { NODE_TYPE_LABEL } from '../types'
import { defaultCornerRadii } from '../utils'
import { Slider } from './Timeline'
import { GradientEditor } from './GradientEditor'
import { highlightTSX } from './CodeHighlight'
import { ColorField } from './ColorField'
import { ColorsPanel } from './ColorsPanel'
import { sceneToReact } from '../exporters'

interface Props {
  tab: 'design' | 'export' | 'code'
  onTab: (t: 'design' | 'export' | 'code') => void
  node: Node | null
  multiCount: number
  scene: Scene
  variables: ColorVariable[]
  onCreateVariable: (v: ColorVariable) => void
  onVariables: (next: ColorVariable[]) => void
  variableUsage: (id: string) => number
  onUpdateNode: (id: string, patch: Partial<Node>) => void
  onUpdateText: (id: string, patch: Partial<NonNullable<Node['text']>>) => void
  onUpdateScene: (patch: Partial<Scene>) => void
  onFlipH: () => void
  onFlipV: () => void
  onAlign: (m: 'left' | 'centerH' | 'right' | 'top' | 'midV' | 'bottom') => void
  onDistribute: (m: 'h' | 'v') => void
  lockAspect: boolean
  onLockAspect: (v: boolean) => void
  onExportScene: (fmt: SceneFormat) => void
  onExportShear: () => void
  onExportProject: () => void
}

/**
 * Lunacy right panel: Design / Export tabs. The Design tab mirrors
 * Lunacy's section order — position & size (with flip + aspect lock),
 * rotation & corners, opacity, fills, borders, effects — and with
 * nothing selected it shows workspace color, nudge amounts and the
 * document color palette.
 */
export function RightPanel(props: Props) {
  return (
    <aside className="absolute inset-y-3 right-3 z-10 flex w-[272px] flex-col overflow-hidden rounded-xl border border-white/10 bg-ink-900/95 shadow-panel backdrop-blur-xl">
      <div className="flex shrink-0 border-b border-white/5">
        {(['design', 'export', 'code'] as const).map((t) => (
          <button
            key={t}
            onClick={() => props.onTab(t)}
            className={`relative flex-1 py-2 text-[11px] font-medium uppercase tracking-[0.12em] transition-colors ${
              props.tab === t ? 'text-neutral-100' : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            {t}
            {props.tab === t && <span className="absolute inset-x-6 bottom-0 h-0.5 rounded-full bg-white" />}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {props.tab === 'export' ? (
          <ExportTab {...props} />
        ) : props.tab === 'code' ? (
          <CodeTab scene={props.scene} />
        ) : props.multiCount > 1 ? (
          <MultiProps {...props} />
        ) : props.node ? (
          <NodeProps {...props} node={props.node} />
        ) : (
          <SceneProps {...props} scene={props.scene} />
        )}
      </div>
    </aside>
  )
}

function CodeTab({ scene }: { scene: Scene }) {
  const code = useMemo(() => sceneToReact(scene), [scene])
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-neutral-500">React</span>
        <button
          onClick={() => void navigator.clipboard?.writeText(code)}
          title="Copy code"
          className="flex h-6 items-center gap-1 rounded-md bg-white/10 px-2 text-[10px] text-neutral-300 transition-colors hover:bg-white/15 hover:text-neutral-100"
        >
          <Copy size={10} strokeWidth={2} /> Copy
        </button>
      </div>
      <pre className="min-h-0 flex-1 overflow-auto whitespace-pre px-3 pb-3 font-mono text-[10px] leading-relaxed">{highlightTSX(code)}</pre>
    </div>
  )
}

function Section({ title, children, right, defaultOpen = true }: { title: string; children: React.ReactNode; right?: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="mx-2 mt-2 rounded-lg border border-white/5 bg-ink-850">
      <div className="flex h-8 items-center justify-between pl-3 pr-2">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400 transition-colors hover:text-neutral-200"
        >
          {title}
          <ChevronDown size={10} strokeWidth={2} className={`transition-transform ${open ? '' : '-rotate-90'}`} />
        </button>
        <span className="flex items-center gap-0.5">{right}</span>
      </div>
      {open && <div className="space-y-2 px-3 pb-3">{children}</div>}
    </div>
  )
}

function MultiProps(props: Props) {
  return (
    <>
      <div className="border-b border-white/5 px-3 py-3">
        <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">Selection</div>
        <div className="mt-0.5 text-[13px] font-medium text-neutral-100">{props.multiCount} layers</div>
      </div>
      <div className="px-3 py-3">
        <p className="text-[11px] leading-relaxed text-neutral-600">
          Align, distribute and flip from the floating toolbar above the selection. Drag to move everything
          together; arrow keys nudge the whole group.
        </p>
      </div>
    </>
  )
}

function NodeProps(props: Props & { node: Node }) {
  const n = props.node
  const hasFill = n.type === 'rect' || n.type === 'ellipse' || n.type === 'poly'
  return (
    <>
      <div className="border-b border-white/5 px-3 py-3">
        <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">{NODE_TYPE_LABEL[n.type]}</div>
        <input
          value={n.name}
          onChange={(e) => props.onUpdateNode(n.id, { name: e.target.value })}
          spellCheck={false}
          className="mt-0.5 w-full truncate bg-transparent text-[13px] font-medium text-neutral-100 outline-none"
        />
        <div className="mt-2 flex items-center gap-0.5 text-neutral-500">
          <AlBtn title="Align left" onClick={() => props.onAlign('left')}><AlignStartVertical size={12} strokeWidth={1.8} /></AlBtn>
          <AlBtn title="Align horizontal centers" onClick={() => props.onAlign('centerH')}><AlignCenterVertical size={12} strokeWidth={1.8} /></AlBtn>
          <AlBtn title="Align right" onClick={() => props.onAlign('right')}><AlignEndVertical size={12} strokeWidth={1.8} /></AlBtn>
          <AlBtn title="Align top" onClick={() => props.onAlign('top')}><AlignStartHorizontal size={12} strokeWidth={1.8} /></AlBtn>
          <AlBtn title="Align vertical centers" onClick={() => props.onAlign('midV')}><AlignCenterHorizontal size={12} strokeWidth={1.8} /></AlBtn>
          <AlBtn title="Align bottom" onClick={() => props.onAlign('bottom')}><AlignEndHorizontal size={12} strokeWidth={1.8} /></AlBtn>
          <span className="mx-1 h-4 w-px bg-white/10" />
          <AlBtn title="Distribute horizontally" onClick={() => props.onDistribute('h')}><AlignHorizontalSpaceBetween size={12} strokeWidth={1.8} /></AlBtn>
          <AlBtn title="Distribute vertically" onClick={() => props.onDistribute('v')}><AlignVerticalSpaceBetween size={12} strokeWidth={1.8} /></AlBtn>
        </div>
      </div>

      {/* size & position, flip, aspect lock — like Lunacy */}
      <Section title="Position & size">
        <div className="grid grid-cols-2 gap-1.5">
          <NumField label="X" value={n.x} onChange={(v) => props.onUpdateNode(n.id, { x: v })} />
          <NumField label="Y" value={n.y} onChange={(v) => props.onUpdateNode(n.id, { y: v })} />
          <NumField label="W" value={n.width} min={1} onChange={(v) => props.onUpdateNode(n.id, { width: v })} />
          <NumField label="H" value={n.height} min={1} onChange={(v) => props.onUpdateNode(n.id, { height: v })} />
        </div>
        <div className="flex items-center gap-1">
          <FlipBtn title="Flip horizontal" onClick={props.onFlipH}>
            <FlipHorizontal2 size={13} strokeWidth={1.8} />
          </FlipBtn>
          <FlipBtn title="Flip vertical" onClick={props.onFlipV}>
            <FlipVertical2 size={13} strokeWidth={1.8} />
          </FlipBtn>
          <FlipBtn title={props.lockAspect ? 'Unlock aspect ratio' : 'Lock aspect ratio'} onClick={() => props.onLockAspect(!props.lockAspect)} active={props.lockAspect}>
            {props.lockAspect ? <LockKeyhole size={13} strokeWidth={1.8} /> : <Unlock size={13} strokeWidth={1.8} />}
          </FlipBtn>
        </div>
      </Section>

      <Section title="Rotation & corners">
        <div className="grid grid-cols-2 gap-1.5">
          <NumField label="Rot" value={n.rotation} suffix="°" onChange={(v) => props.onUpdateNode(n.id, { rotation: v })} />
        </div>
        {n.type === 'rect' && <CornerControls node={n} onUpdate={(patch) => props.onUpdateNode(n.id, patch)} />}
      </Section>

      <Section title="Layer">
        <div className="flex items-center gap-2">
          <Slider
            label="Opacity"
            value={Math.round(n.opacity * 100)}
            min={0}
            max={100}
            suffix="%"
            onChange={(v) => props.onUpdateNode(n.id, { opacity: v / 100 })}
          />
          <select className="h-7 rounded-md border border-white/10 bg-white/5 px-1.5 text-[11px] text-neutral-300 outline-none [&>option]:bg-ink-900" defaultValue="normal">
            <option value="normal">Normal</option>
          </select>
        </div>
      </Section>

      <Section title="Constraints" defaultOpen={false}>
        <div className="grid grid-cols-2 gap-1.5">
          <label className="flex h-7 items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2">
            <span className="text-[10px] text-neutral-500">H</span>
            <select className="w-full bg-transparent text-[11px] text-neutral-300 outline-none [&>option]:bg-ink-900" defaultValue="scale">
              <option value="scale">Scale</option>
            </select>
          </label>
          <label className="flex h-7 items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2">
            <span className="text-[10px] text-neutral-500">V</span>
            <select className="w-full bg-transparent text-[11px] text-neutral-300 outline-none [&>option]:bg-ink-900" defaultValue="scale">
              <option value="scale">Scale</option>
            </select>
          </label>
        </div>
      </Section>

      {n.type === 'icon' && n.icon && (
        <Section title="Fill">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-neutral-500">Tint</span>
            <ColorField
              value={n.icon.color}
              variables={props.variables}
              onCreateVariable={props.onCreateVariable}
              onChange={(c, varId) => props.onUpdateNode(n.id, { icon: { ...n.icon!, color: c }, fillVar: varId })}
            />
          </div>
        </Section>
      )}

      {(hasFill || n.type === 'text') && (
        <Section
          title="Fills"
          right={
            hasFill ? (
              <HdrBtn title={n.gradient ? 'Back to solid' : 'Gradient fill'} onClick={() => props.onUpdateNode(n.id, { gradient: n.gradient ? null : { angle: 90, stops: [{ pos: 0, color: n.fill ?? '#ffffff' }, { pos: 1, color: '#000000' }] } })}>
                <svg width="11" height="11" viewBox="0 0 10 10"><defs><linearGradient id="gp" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff"/><stop offset="1" stopColor="#444"/></linearGradient></defs><rect width="10" height="10" rx="2" fill="url(#gp)"/></svg>
              </HdrBtn>
            ) : undefined
          }
        >
          {hasFill && (
            <div className="flex items-center gap-2">
              <ColorField
                value={n.gradient ? (n.gradient.stops[0]?.color ?? '#ffffff') : n.fill ?? '#ffffff'}
                variableId={n.fillVar}
                disabled={n.fill === null && !n.gradient}
                variables={props.variables}
                onCreateVariable={props.onCreateVariable}
                onChange={(c, varId) => props.onUpdateNode(n.id, { fill: c, gradient: null, fillVar: varId })}
              />
              <span className="flex-1 truncate font-mono text-[11px] uppercase text-neutral-300">{(n.fill ?? 'D3D3D3').replace('#', '')}</span>
              <span className="text-[10px] tabular-nums text-neutral-500">100%</span>
              <HdrBtn title={n.fill === null && !n.gradient ? 'Show fill' : 'Hide fill'} onClick={() => props.onUpdateNode(n.id, { fill: n.fill === null && !n.gradient ? '#ffffff' : null, gradient: null })}>
                {n.fill === null && !n.gradient ? <EyeOff size={11} strokeWidth={1.8} /> : <Eye size={11} strokeWidth={1.8} />}
              </HdrBtn>
              <HdrBtn title="Remove fill" onClick={() => props.onUpdateNode(n.id, { fill: null, gradient: null, fillVar: undefined })}>
                <X size={11} strokeWidth={1.8} />
              </HdrBtn>
            </div>
          )}
          {n.gradient && (
            <GradientEditor
              value={n.gradient}
              variables={props.variables}
              onChange={(g) => props.onUpdateNode(n.id, { gradient: g })}
            />
          )}
        </Section>
      )}

      <Section title="Border">
        <div className="flex items-center gap-2">
          <Toggle on={n.stroke !== null} onToggle={() => props.onUpdateNode(n.id, { stroke: n.stroke ? null : { color: '#ffffff', width: 1 }, strokeVar: undefined })} />
          <ColorField
            value={n.stroke?.color ?? '#ffffff'}
            variableId={n.strokeVar}
            disabled={n.stroke === null}
            variables={props.variables}
            onCreateVariable={props.onCreateVariable}
            onChange={(c, varId) => props.onUpdateNode(n.id, { stroke: { color: c, width: n.stroke?.width ?? 1 }, strokeVar: varId })}
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

      <Section
        title="Effects"
        right={
          <HdrBtn title="Add effect" onClick={() => props.onUpdateNode(n.id, { effects: [...(n.effects ?? []), { id: Math.random().toString(36).slice(2), type: 'drop-shadow', visible: true, color: '#000000', x: 0, y: 4, blur: 4, spread: 0 }] })}>
            <Plus size={11} strokeWidth={2} />
          </HdrBtn>
        }
      >
        <EffectsControls node={n} onUpdate={(patch) => props.onUpdateNode(n.id, patch)} variables={props.variables} />
      </Section>

      <Section title="Prototyping" defaultOpen={false}>
        <label className="flex h-7 items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2">
          <span className="text-[10px] text-neutral-500">Start</span>
          <select
            value={n.timeline?.trigger ?? 'view'}
            onChange={(e) => props.onUpdateNode(n.id, { timeline: { duration: n.timeline?.duration ?? 2, loop: n.timeline?.loop ?? false, tracks: n.timeline?.tracks ?? [], trigger: e.target.value as never } })}
            className="w-full bg-transparent text-[11px] text-neutral-300 outline-none [&>option]:bg-ink-900"
          >
            <option value="view">On view</option>
            <option value="hover">On hover</option>
            <option value="click">On click</option>
            <option value="loop">Loop</option>
          </select>
        </label>
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
            <PresetNumField label="Size" value={n.text.fontSize} options={[8, 10, 12, 14, 16, 18, 24, 32, 48, 64, 96]} min={4} onChange={(v) => {
              const ratio = v / Math.max(1, n.text!.fontSize)
              props.onUpdateNode(n.id, { width: Math.max(8, Math.round(n.width * ratio)), height: Math.max(8, Math.round(n.height * ratio)) })
              props.onUpdateText(n.id, { fontSize: v })
            }} />
            <label className="flex h-7 items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2">
              <span className="text-[10px] text-neutral-500">Weight</span>
              <select
                value={n.text.fontWeight}
                onChange={(e) => props.onUpdateText(n.id, { fontWeight: Number(e.target.value) })}
                className="w-full bg-transparent text-[11px] text-neutral-300 outline-none [&>option]:bg-ink-900"
              >
                <option value={400}>Regular</option>
                <option value={500}>Medium</option>
                <option value={600}>SemiBold</option>
                <option value={700}>Bold</option>
              </select>
            </label>
          </div>
          <div className="flex items-center justify-between">
            <ColorField
              value={n.text.color}
              variableId={n.textVar}
              variables={props.variables}
              onCreateVariable={props.onCreateVariable}
              onChange={(c, varId) => {
                props.onUpdateText(n.id, { color: c })
                props.onUpdateNode(n.id, { textVar: varId })
              }}
            />
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
  const [nudgeSmall, setNudgeSmall] = useState(1)
  const [nudgeBig, setNudgeBig] = useState(10)
  return (
    <>
      <div className="border-b border-white/5 px-3 py-3">
        <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">Page</div>
        <input
          value={s.name}
          onChange={(e) => props.onUpdateScene({ name: e.target.value })}
          spellCheck={false}
          className="mt-0.5 w-full bg-transparent text-[13px] font-medium text-neutral-100 outline-none"
        />
      </div>

      <Section title="Workspace">
        <div className="grid grid-cols-2 gap-1.5">
          <NumField label="W" value={s.width} min={50} step={10} onChange={(v) => props.onUpdateScene({ width: v })} />
          <NumField label="H" value={s.height} min={50} step={10} onChange={(v) => props.onUpdateScene({ height: v })} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-neutral-500">Color</span>
          <ColorField
            value={s.background}
            variableId={s.backgroundVar}
            variables={props.variables}
            onCreateVariable={props.onCreateVariable}
            onChange={(c, varId) => props.onUpdateScene({ background: c, backgroundVar: varId })}
          />
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <NumField label="Nudge" value={nudgeSmall} min={1} onChange={setNudgeSmall} />
          <NumField label="Big ⇧" value={nudgeBig} min={1} onChange={setNudgeBig} />
        </div>
      </Section>

      <ColorsPanel variables={props.variables} onChange={props.onVariables} usage={props.variableUsage} />
    </>
  )
}

const FORMATS: { id: SceneFormat; label: string; hint: string }[] = [
  { id: 'png', label: 'PNG', hint: '2× raster, rendered by the server' },
  { id: 'svg', label: 'SVG', hint: 'vectors, shadows, filters, icons' },
  { id: 'html', label: 'HTML', hint: 'self-contained page, animations run' },
  { id: 'react', label: 'React', hint: 'dependency-free .tsx component' },
]

function ExportTab(props: Props) {
  const [fmt, setFmt] = useState<SceneFormat>('png')
  return (
    <>
      <Section title="Export scene">
        <div className="space-y-1">
          {FORMATS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFmt(f.id)}
              className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors ${
                fmt === f.id ? 'border-white/30 bg-white/10' : 'border-white/5 bg-white/[0.03] hover:bg-white/5'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${fmt === f.id ? 'bg-white' : 'bg-neutral-600'}`} />
              <span className="text-[12px] font-medium text-neutral-200">{f.label}</span>
              <span className="ml-auto text-[10px] text-neutral-600">{f.hint}</span>
            </button>
          ))}
        </div>
        <button
          onClick={() => props.onExportScene(fmt)}
          className="w-full rounded-md bg-white py-1.5 text-[12px] font-semibold text-neutral-900 transition-colors hover:bg-neutral-200"
        >
          Export {FORMATS.find((f) => f.id === fmt)?.label} (⌘E)
        </button>
      </Section>
      <Section title="React project">
        <button
          onClick={props.onExportProject}
          className="w-full rounded-md bg-white/10 py-1.5 text-[12px] font-medium text-neutral-200 transition-colors hover:bg-white/15"
        >
          Export as React + Vite project
        </button>
        <p className="text-[10px] leading-relaxed text-neutral-600">
          A ready-to-run Vite app with Tailwind, framer-motion and lucide-react — animations included.
        </p>
      </Section>
      <Section title="Document">
        <button
          onClick={props.onExportShear}
          className="w-full rounded-md bg-white/10 py-1.5 text-[12px] font-medium text-neutral-200 transition-colors hover:bg-white/15"
        >
          Save .shear file
        </button>
        <p className="text-[10px] leading-relaxed text-neutral-600">
          The whole document — pages, styles, variables and animations. Hand it to another designer or re-import
          it from the toolbar.
        </p>
      </Section>
    </>
  )
}

function AlBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button title={title} onClick={onClick} className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-white/10 hover:text-neutral-200">
      {children}
    </button>
  )
}

function HdrBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button title={title} onClick={onClick} className="flex h-6 w-6 items-center justify-center rounded text-neutral-500 transition-colors hover:bg-white/10 hover:text-neutral-200">
      {children}
    </button>
  )
}

function FlipBtn({ children, onClick, title, active }: { children: React.ReactNode; onClick: () => void; title: string; active?: boolean }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
        active ? 'bg-white text-neutral-900' : 'text-neutral-400 hover:bg-white/10 hover:text-neutral-100'
      }`}
    >
      {children}
    </button>
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
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-neutral-500">Linked corners</span>
        <Toggle on={r.linked} onToggle={() => onUpdate({ cornerRadii: { ...r, linked: !r.linked } })} />
      </div>
      <Slider label="All" value={r.linked ? r.tl : Math.max(r.tl, r.tr, r.br, r.bl)} min={0} max={max} onChange={setAll} />
      <div className="grid grid-cols-2 gap-1.5">
        <NumField label="TL" value={r.tl} min={0} onChange={(v) => setOne('tl', v)} />
        <NumField label="TR" value={r.tr} min={0} onChange={(v) => setOne('tr', v)} />
        <NumField label="BR" value={r.br} min={0} onChange={(v) => setOne('br', v)} />
        <NumField label="BL" value={r.bl} min={0} onChange={(v) => setOne('bl', v)} />
      </div>
      <p className="text-[10px] leading-relaxed text-neutral-600">Drag the corner dots on-canvas. Hold Shift to change only that corner.</p>
    </div>
  )
}

function EffectsControls({ node, onUpdate, variables }: { node: Node; onUpdate: (patch: Partial<Node>) => void; variables: ColorVariable[] }) {
  const effects = node.effects ?? []
  const update = (id: string, patch: Partial<Effect>) => onUpdate({ effects: effects.map((e) => (e.id === id ? ({ ...e, ...patch } as Effect) : e)) })
  const remove = (id: string) => onUpdate({ effects: effects.filter((e) => e.id !== id) })
  const EFFECT_TYPES: { id: Effect['type']; label: string }[] = [
    { id: 'drop-shadow', label: 'Shadow' },
    { id: 'inner-shadow', label: 'Inner Shadow' },
    { id: 'layer-blur', label: 'Gaussian Blur' },
    { id: 'motion-blur', label: 'Motion Blur' },
    { id: 'zoom-blur', label: 'Zoom Blur' },
    { id: 'background-blur', label: 'Background Blur' },
  ]
  const setType = (e: Effect, t: Effect['type']) => {
    const isBlur = t === 'layer-blur' || t === 'motion-blur' || t === 'zoom-blur' || t === 'background-blur'
    if (isBlur) update(e.id, { type: t, blur: 'blur' in e ? e.blur : 4 } as Partial<Effect>)
    else update(e.id, { type: t, color: 'color' in e ? e.color : '#000000', x: 'x' in e ? e.x : 0, y: 'y' in e ? e.y : 4, blur: 'blur' in e ? e.blur : 4, spread: 'spread' in e ? e.spread : 0 } as Partial<Effect>)
  }
  return (
    <div className="space-y-2">
      {effects.map((e) => (
        <div key={e.id} className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <select
              value={e.type}
              onChange={(ev) => setType(e, ev.target.value as Effect['type'])}
              className="h-7 min-w-0 flex-1 rounded-md border border-white/10 bg-white/5 px-1.5 text-[11px] text-neutral-200 outline-none [&>option]:bg-ink-900"
            >
              {EFFECT_TYPES.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
            <HdrBtn title={e.visible ? 'Hide' : 'Show'} onClick={() => update(e.id, { visible: !e.visible })}>
              {e.visible ? <Eye size={11} strokeWidth={1.8} /> : <EyeOff size={11} strokeWidth={1.8} />}
            </HdrBtn>
            <HdrBtn title="Remove" onClick={() => remove(e.id)}>
              <X size={11} strokeWidth={1.8} />
            </HdrBtn>
          </div>
          {'color' in e ? (
            <>
              <div className="grid grid-cols-3 gap-1.5">
                <NumField label="X" value={e.x} onChange={(v) => update(e.id, { x: v })} />
                <NumField label="Y" value={e.y} onChange={(v) => update(e.id, { y: v })} />
                <NumField label="Blur" value={e.blur} min={0} onChange={(v) => update(e.id, { blur: v })} />
              </div>
              <div className="flex items-center gap-2">
                <ColorField value={e.color} variables={variables} onChange={(c) => update(e.id, { color: c })} />
                <span className="flex-1 truncate font-mono text-[11px] uppercase text-neutral-400">{e.color.replace('#', '')}</span>
                {'spread' in e && <NumField label="Spread" value={e.spread} onChange={(v) => update(e.id, { spread: v })} />}
              </div>
            </>
          ) : (
            <Slider label="Blur" value={e.blur} min={0} max={80} onChange={(v) => update(e.id, { blur: v })} />
          )}
        </div>
      ))}
      {effects.length === 0 && <p className="text-[10px] text-neutral-600">No effects yet — add one with +.</p>}
    </div>
  )
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
