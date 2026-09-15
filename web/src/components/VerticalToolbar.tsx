import {
  ArrowUpRight,
  Circle,
  Hand,
  Hexagon,
  Minus,
  MousePointer2,
  Sparkles,
  Square,
  Star,
  Triangle,
  Type,
} from 'lucide-react'
import type { LineVariant, OvalVariant, RectVariant, Tool } from '../types'

interface Props {
  tool: Tool
  rectVar: RectVariant
  lineVar: LineVariant
  ovalVar: OvalVariant
  onCycleRect: () => void
  onCycleLine: () => void
  onCycleOval: () => void
  onTool: (t: Tool) => void
  /** horizontal offset in px (clears the left rail / panel) */
  left: number
}

/** New-Lunacy floating vertical toolbar on the canvas. */
export function VerticalToolbar(p: Props) {
  return (
    <div
      className="absolute top-1/2 z-20 flex -translate-y-1/2 flex-col gap-0.5 rounded-xl border border-white/10 bg-ink-900/90 p-1 shadow-panel backdrop-blur-xl transition-[left] duration-150"
      style={{ left: p.left }}
    >
      <ToolBtn active={p.tool === 'select'} title="Select — V" onClick={() => p.onTool('select')}>
        <MousePointer2 size={15} strokeWidth={1.8} />
      </ToolBtn>
      <ToolBtn
        active={p.tool === 'rect'}
        title={p.rectVar === 'rounded' ? 'Rounded rectangle — R (again to switch)' : 'Rectangle — R (again for rounded)'}
        onClick={p.onCycleRect}
      >
        {p.rectVar === 'rounded' ? <RoundedRectIcon /> : <Square size={15} strokeWidth={1.8} />}
      </ToolBtn>
      <ToolBtn
        active={p.tool === 'line'}
        title={p.lineVar === 'arrow' ? 'Arrow — L (again to switch)' : 'Line — L (again for arrow)'}
        onClick={p.onCycleLine}
      >
        {p.lineVar === 'arrow' ? <ArrowUpRight size={15} strokeWidth={1.8} /> : <Minus size={15} strokeWidth={1.8} />}
      </ToolBtn>
      <ToolBtn active={p.tool === 'ellipse'} title={`${ovalLabel(p.ovalVar)} — O (again to cycle)`} onClick={p.onCycleOval}>
        {p.ovalVar === 'ellipse' ? (
          <Circle size={15} strokeWidth={1.8} />
        ) : p.ovalVar === 'triangle' ? (
          <Triangle size={15} strokeWidth={1.8} />
        ) : p.ovalVar === 'polygon' ? (
          <Hexagon size={15} strokeWidth={1.8} />
        ) : (
          <Star size={15} strokeWidth={1.8} />
        )}
      </ToolBtn>
      <ToolBtn active={p.tool === 'text'} title="Text — T" onClick={() => p.onTool('text')}>
        <Type size={15} strokeWidth={1.8} />
      </ToolBtn>
      <ToolBtn active={p.tool === 'icon'} title="Icon — X (click one in the library, then click the canvas to place it)" onClick={() => p.onTool('icon')}>
        <Sparkles size={15} strokeWidth={1.8} />
      </ToolBtn>
      <ToolBtn active={p.tool === 'hand'} title="Hand — H or Space" onClick={() => p.onTool('hand')}>
        <Hand size={15} strokeWidth={1.8} />
      </ToolBtn>
    </div>
  )
}

function ovalLabel(v: OvalVariant): string {
  return v === 'ellipse' ? 'Oval' : v === 'triangle' ? 'Triangle' : v === 'polygon' ? 'Polygon' : 'Star'
}

function RoundedRectIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="5" width="18" height="14" rx="5" />
    </svg>
  )
}

function ToolBtn({ children, onClick, title, active }: { children: React.ReactNode; onClick: () => void; title: string; active?: boolean }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
        active ? 'bg-white/15 text-white' : 'text-neutral-400 hover:bg-white/10 hover:text-neutral-100'
      }`}
    >
      {children}
    </button>
  )
}
