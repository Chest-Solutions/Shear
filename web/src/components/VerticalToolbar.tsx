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
  Star,
  Triangle,
  Type,
} from 'lucide-react'
import type { Tool } from '../types'

interface Props {
  tool: Tool
  rectVar: 'rect' | 'rounded'
  lineVar: 'line' | 'arrow'
  ovalVar: 'ellipse' | 'triangle' | 'polygon' | 'star'
  onRect: (v: 'rect' | 'rounded') => void
  onLine: (v: 'line' | 'arrow') => void
  onOval: (v: 'ellipse' | 'triangle' | 'polygon' | 'star') => void
  onTool: (t: Tool) => void
  /** horizontal offset in px (clears the left rail / panel) */
  left: number
}

const shapeIcon = (id: string, size = 14) => {
  switch (id) {
    case 'rect': return <Square size={size} strokeWidth={1.8} />
    case 'rounded': return <RoundedRectIcon />
    case 'ellipse': return <Circle size={size} strokeWidth={1.8} />
    case 'triangle': return <Triangle size={size} strokeWidth={1.8} />
    case 'polygon': return <Hexagon size={size} strokeWidth={1.8} />
    case 'star': return <Star size={size} strokeWidth={1.8} />
    case 'line': return <Minus size={size} strokeWidth={1.8} />
    case 'arrow': return <ArrowUpRight size={size} strokeWidth={1.8} />
    default: return <Square size={size} strokeWidth={1.8} />
  }
}

/**
 * Lunacy's floating vertical toolbar. Grouped tools open a horizontal
 * flyout on hover; the group button shows the currently selected member.
 */
export function VerticalToolbar(p: Props) {
  const shape: string =
    p.tool === 'rect' ? p.rectVar : p.tool === 'line' ? p.lineVar : p.tool === 'ellipse' ? p.ovalVar : 'rect'

  return (
    <div
      className="absolute top-1/2 z-20 flex -translate-y-1/2 flex-col gap-0.5 rounded-xl border border-white/10 bg-ink-900/90 p-1 shadow-panel backdrop-blur-xl transition-[left] duration-150"
      style={{ left: p.left }}
    >
      <ToolBtn active={p.tool === 'select'} title="Select — V" onClick={() => p.onTool('select')}>
        <MousePointer2 size={15} strokeWidth={1.8} />
      </ToolBtn>

      <Flyout
        active={p.tool === 'rect' || p.tool === 'ellipse'}
        main={shapeIcon(shape)}
        items={[
          { id: 'ellipse', title: 'Oval — O', on: () => p.onOval('ellipse') },
          { id: 'rect', title: 'Rectangle — R', on: () => p.onRect('rect') },
          { id: 'rounded', title: 'Rounded Rectangle — R,R', on: () => p.onRect('rounded') },
          { id: 'triangle', title: 'Triangle', on: () => p.onOval('triangle') },
          { id: 'polygon', title: 'Polygon', on: () => p.onOval('polygon') },
          { id: 'star', title: 'Star', on: () => p.onOval('star') },
        ]}
        current={shape}
      />

      <Flyout
        active={p.tool === 'line'}
        main={shapeIcon(shape)}
        items={[
          { id: 'line', title: 'Line — L', on: () => p.onLine('line') },
          { id: 'arrow', title: 'Arrow — L,L', on: () => p.onLine('arrow') },
        ]}
        current={shape}
      />

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

function Flyout({
  active,
  main,
  items,
  current,
}: {
  active?: boolean
  main: React.ReactNode
  items: { id: string; title: string; on: () => void }[]
  current: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        onClick={() => items.find((i) => i.id === current)?.on()}
        className={`relative flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
          active ? 'bg-white/15 text-white' : 'text-neutral-400 hover:bg-white/10 hover:text-neutral-100'
        }`}
      >
        {main}
        <ChevronRight size={8} strokeWidth={2} className="absolute bottom-1 right-1 text-neutral-600" />
      </button>
      {open && (
        <div className="absolute left-9 top-0 z-40 flex flex-row gap-0.5 rounded-xl border border-white/10 bg-ink-900/95 p-1 shadow-panel backdrop-blur-xl">
          {items.map((it) => (
            <button
              key={it.id}
              title={it.title}
              onClick={it.on}
              className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                current === it.id ? 'bg-sky-500 text-white' : 'text-neutral-400 hover:bg-white/10 hover:text-neutral-100'
              }`}
            >
              {shapeIcon(it.id)}
            </button>
          ))}
        </div>
      )}
    </div>
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
