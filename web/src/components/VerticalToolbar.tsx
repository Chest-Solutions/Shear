import { useState } from 'react'
import {
  ArrowUpRight,
  ChevronRight,
  Circle,
  Hand,
  Hexagon,
  Minus,
  MousePointer2,
  Sparkles,
  Square,
  Triangle,
  Type,
} from 'lucide-react'
import type { Tool } from '../types'

interface Props {
  tool: Tool
  rectVar: 'rect' | 'rounded'
  lineVar: 'line' | 'arrow'
  ovalVar: 'ellipse' | 'triangle' | 'polygon'
  onRect: (v: 'rect' | 'rounded') => void
  onLine: (v: 'line' | 'arrow') => void
  onOval: (v: 'ellipse' | 'triangle' | 'polygon') => void
  onTool: (t: Tool) => void
  /** horizontal offset in px (clears the left rail / panel) */
  left: number
}

type ShapeId = 'rect' | 'rounded' | 'ellipse' | 'triangle' | 'polygon' | 'line' | 'arrow'

/**
 * New-Lunacy floating vertical toolbar. Shape and line tools collapse
 * into groups whose flyouts open on hover.
 */
export function VerticalToolbar(p: Props) {
  const currentShape: ShapeId =
    p.tool === 'rect' ? p.rectVar : p.tool === 'line' ? p.lineVar : p.tool === 'ellipse' ? p.ovalVar : 'rect'

  return (
    <div
      className="absolute top-1/2 z-20 flex -translate-y-1/2 flex-col gap-0.5 rounded-xl border border-white/10 bg-ink-900/90 p-1 shadow-panel backdrop-blur-xl transition-[left] duration-150"
      style={{ left: p.left }}
    >
      <ToolBtn active={p.tool === 'select'} title="Select — V" onClick={() => p.onTool('select')}>
        <MousePointer2 size={15} strokeWidth={1.8} />
      </ToolBtn>

      <Flyout label="Shapes" active={p.tool === 'rect' || p.tool === 'ellipse'}>
        <FlyItem current={currentShape === 'rect'} title="Rectangle — R" onClick={() => p.onRect('rect')}>
          <Square size={14} strokeWidth={1.8} />
        </FlyItem>
        <FlyItem current={currentShape === 'rounded'} title="Rounded rectangle" onClick={() => p.onRect('rounded')}>
          <RoundedRectIcon />
        </FlyItem>
        <FlyItem current={currentShape === 'ellipse'} title="Oval — O" onClick={() => p.onOval('ellipse')}>
          <Circle size={14} strokeWidth={1.8} />
        </FlyItem>
        <FlyItem current={currentShape === 'triangle'} title="Triangle" onClick={() => p.onOval('triangle')}>
          <Triangle size={14} strokeWidth={1.8} />
        </FlyItem>
        <FlyItem current={currentShape === 'polygon'} title="Polygon" onClick={() => p.onOval('polygon')}>
          <Hexagon size={14} strokeWidth={1.8} />
        </FlyItem>
      </Flyout>

      <Flyout label="Lines" active={p.tool === 'line'}>
        <FlyItem current={currentShape === 'line'} title="Line — L" onClick={() => p.onLine('line')}>
          <Minus size={14} strokeWidth={1.8} />
        </FlyItem>
        <FlyItem current={currentShape === 'arrow'} title="Arrow" onClick={() => p.onLine('arrow')}>
          <ArrowUpRight size={14} strokeWidth={1.8} />
        </FlyItem>
      </Flyout>

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

function Flyout({ label, active, children }: { label: string; active?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        title={label}
        onClick={() => setOpen((v) => !v)}
        className={`relative flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
          active ? 'bg-white/15 text-white' : 'text-neutral-400 hover:bg-white/10 hover:text-neutral-100'
        }`}
      >
        {children && <FirstChild>{children}</FirstChild>}
        <ChevronRight size={8} strokeWidth={2} className="absolute bottom-1 right-1 text-neutral-600" />
      </button>
      {open && (
        <div className="absolute left-9 top-0 z-40 flex flex-col gap-0.5 rounded-xl border border-white/10 bg-ink-900/95 p-1 shadow-panel backdrop-blur-xl">
          {children}
        </div>
      )}
    </div>
  )
}

/** the group button shows the first tool of the flyout */
function FirstChild({ children }: { children: React.ReactNode }) {
  const arr = Array.isArray(children) ? children : [children]
  return <>{arr[0] ? (arr[0] as React.ReactElement).props.children ?? null : null}</>
}

function FlyItem({ current, title, onClick, children }: { current: boolean; title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
        current ? 'bg-white/15 text-white' : 'text-neutral-400 hover:bg-white/10 hover:text-neutral-100'
      }`}
    >
      {children}
    </button>
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

function RoundedRectIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="5" width="18" height="14" rx="5" />
    </svg>
  )
}
