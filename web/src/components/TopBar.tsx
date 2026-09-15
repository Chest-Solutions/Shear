import { useRef } from 'react'
import {
  ArrowUpRight,
  Circle,
  Hand,
  Hexagon,
  Maximize2,
  Minus,
  MousePointer2,
  Play,
  Plus,
  Redo2,
  Share2,
  Square,
  Star,
  Triangle,
  Type,
  Undo2,
  Upload,
  Sparkles,
} from 'lucide-react'
import type { LineVariant, OvalVariant, Peer, RectVariant, Tool } from '../types'
import { Logo } from './Logo'

interface Props {
  docName: string
  onRename: (name: string) => void
  savedAt: string | null
  tool: Tool
  rectVar: RectVariant
  lineVar: LineVariant
  ovalVar: OvalVariant
  onTool: (t: Tool) => void
  onCycleRect: () => void
  onCycleLine: () => void
  onCycleOval: () => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  onImport: (f: File) => void
  onPlay: () => void
  onShare: () => void
  onHome: () => void
  peers: Peer[]
  self: Peer | null
  live: boolean
  zoom: number
  onZoomIn: () => void
  onZoomOut: () => void
  onZoomReset: () => void
  onFit: () => void
}

/**
 * Lunacy layout: a menu bar (home button, document tab, presence, play,
 * zoom control) above a centred toolbar with the design tools.
 */
export function TopBar(p: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  return (
    <header className="shrink-0 border-b border-white/5 bg-ink-850">
      {/* menu bar */}
      <div className="flex h-11 items-center gap-2 px-3">
        <button
          onClick={p.onHome}
          title="Home — recent designs"
          className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-300 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Logo size={16} />
        </button>
        <div className="flex h-7 min-w-0 items-center gap-2 rounded-md bg-white/5 px-2.5">
          <input
            value={p.docName}
            onChange={(e) => p.onRename(e.target.value)}
            spellCheck={false}
            className="w-32 truncate bg-transparent text-[12px] font-medium text-neutral-100 outline-none"
          />
          {p.savedAt && <span className="hidden text-[10px] text-neutral-600 sm:block">Saved {p.savedAt}</span>}
        </div>

        <div className="flex-1" />

        {/* presence */}
        {p.live && (
          <div className="flex items-center -space-x-1">
            {[p.self, ...p.peers].filter(Boolean).map((peer, i) => (
              <span
                key={i}
                title={peer!.name}
                className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-ink-850 text-[10px] font-semibold text-neutral-900"
                style={{ background: peer!.color }}
              >
                {peer!.name.charAt(0).toUpperCase()}
              </span>
            ))}
          </div>
        )}

        <button
          onClick={p.onShare}
          title="Work together — share a live session"
          className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] transition-colors ${
            p.live ? 'bg-white text-neutral-900' : 'bg-white/10 text-neutral-200 hover:bg-white/15'
          }`}
        >
          <Share2 size={12} strokeWidth={2} />
          {p.live ? 'Live' : 'Share'}
        </button>
        <button
          onClick={p.onPlay}
          title="Preview (⇧⌘P)"
          className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-300 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Play size={13} strokeWidth={2} />
        </button>

        {/* zoom control */}
        <div className="flex items-center gap-0.5 rounded-md border border-white/5 bg-white/5 p-0.5">
          <BarBtn title="Zoom out" onClick={p.onZoomOut}>
            <Minus size={12} strokeWidth={2} />
          </BarBtn>
          <button
            onClick={p.onZoomReset}
            title="Reset to 100% (⌘0)"
            className="w-11 rounded py-0.5 text-center text-[11px] tabular-nums text-neutral-300 transition-colors hover:bg-white/10 hover:text-neutral-100"
          >
            {Math.round(p.zoom * 100)}%
          </button>
          <BarBtn title="Zoom in" onClick={p.onZoomIn}>
            <Plus size={12} strokeWidth={2} />
          </BarBtn>
          <BarBtn title="Fit page (⌘1)" onClick={p.onFit}>
            <Maximize2 size={12} strokeWidth={2} />
          </BarBtn>
        </div>
      </div>

      {/* toolbar */}
      <div className="relative flex h-10 items-center justify-center gap-0.5 border-t border-white/5">
        <div className="absolute left-3 flex items-center gap-0.5">
          <BarBtn title="Undo (⌘Z)" onClick={p.onUndo} disabled={!p.canUndo}>
            <Undo2 size={13} strokeWidth={2} />
          </BarBtn>
          <BarBtn title="Redo (⇧⌘Z)" onClick={p.onRedo} disabled={!p.canRedo}>
            <Redo2 size={13} strokeWidth={2} />
          </BarBtn>
          <BarBtn title="Import .shear / .json" onClick={() => fileRef.current?.click()}>
            <Upload size={13} strokeWidth={2} />
          </BarBtn>
          <input
            ref={fileRef}
            type="file"
            accept=".json,.shear,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) p.onImport(f)
              e.target.value = ''
            }}
          />
        </div>

        <ToolBtn active={p.tool === 'select'} title="Select — V" onClick={() => p.onTool('select')}>
          <MousePointer2 size={14} strokeWidth={1.8} />
        </ToolBtn>
        <ToolBtn
          active={p.tool === 'rect'}
          title={p.rectVar === 'rounded' ? 'Rounded rectangle — R (press again to switch)' : 'Rectangle — R (press again for rounded)'}
          onClick={p.onCycleRect}
        >
          {p.rectVar === 'rounded' ? <RoundedRectIcon /> : <Square size={14} strokeWidth={1.8} />}
        </ToolBtn>
        <ToolBtn
          active={p.tool === 'line'}
          title={p.lineVar === 'arrow' ? 'Arrow — L (press again to switch)' : 'Line — L (press again for arrow)'}
          onClick={p.onCycleLine}
        >
          {p.lineVar === 'arrow' ? <ArrowUpRight size={14} strokeWidth={1.8} /> : <Minus size={14} strokeWidth={1.8} />}
        </ToolBtn>
        <ToolBtn
          active={p.tool === 'ellipse'}
          title={`${ovalLabel(p.ovalVar)} — O (press again to cycle)`}
          onClick={p.onCycleOval}
        >
          {p.ovalVar === 'ellipse' ? (
            <Circle size={14} strokeWidth={1.8} />
          ) : p.ovalVar === 'triangle' ? (
            <Triangle size={14} strokeWidth={1.8} />
          ) : p.ovalVar === 'polygon' ? (
            <Hexagon size={14} strokeWidth={1.8} />
          ) : (
            <Star size={14} strokeWidth={1.8} />
          )}
        </ToolBtn>
        <ToolBtn active={p.tool === 'text'} title="Text — T" onClick={() => p.onTool('text')}>
          <Type size={14} strokeWidth={1.8} />
        </ToolBtn>
        <ToolBtn active={p.tool === 'icon'} title="Icon — X (opens the library, click an icon to arm it)" onClick={() => p.onTool('icon')}>
          <Sparkles size={14} strokeWidth={1.8} />
        </ToolBtn>
        <ToolBtn active={p.tool === 'hand'} title="Hand — H or Space" onClick={() => p.onTool('hand')}>
          <Hand size={14} strokeWidth={1.8} />
        </ToolBtn>
      </div>
    </header>
  )
}

function ovalLabel(v: OvalVariant): string {
  return v === 'ellipse' ? 'Oval' : v === 'triangle' ? 'Triangle' : v === 'polygon' ? 'Polygon' : 'Star'
}

function RoundedRectIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="5" width="18" height="14" rx="5" />
    </svg>
  )
}

function BarBtn({ children, onClick, title, disabled }: { children: React.ReactNode; onClick: () => void; title: string; disabled?: boolean }) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="flex h-6 w-6 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-100 disabled:opacity-30 disabled:hover:bg-transparent"
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
