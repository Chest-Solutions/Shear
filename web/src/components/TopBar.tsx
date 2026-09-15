import { useRef, useState } from 'react'
import { Check, Gem, Play, Redo2, Share2, Undo2, Upload } from 'lucide-react'
import type { Peer } from '../types'
import { Logo } from './Logo'

interface Props {
  docName: string
  onRename: (name: string) => void
  savedAt: string | null
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  onImport: (f: File) => void
  onPlay: () => void
  animMode: boolean
  onAnimMode: () => void
  onHome: () => void
  zoom: number
  onZoomIn: () => void
  onZoomOut: () => void
  onZoomReset: () => void
  onFit: () => void
}

/**
 * New-Lunacy menu bar: home button + document tab on the left, a few
 * quiet actions on the right. Everything else lives on the canvas.
 */
export function TopBar(p: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [zoomOpen, setZoomOpen] = useState(false)
  return (
    <header className="relative z-30 flex h-9 shrink-0 items-center gap-1.5 border-b border-white/5 bg-ink-850 px-2">
      <button
        onClick={p.onHome}
        title="Home — recent designs"
        className="flex h-6 w-6 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
      >
        <Logo size={14} />
      </button>

      <div className="flex h-6 min-w-0 items-center gap-1.5 rounded-md bg-white/5 px-2">
        <input
          value={p.docName}
          onChange={(e) => p.onRename(e.target.value)}
          spellCheck={false}
          className="w-28 truncate bg-transparent text-[12px] text-neutral-200 outline-none"
        />
        {p.savedAt && <span className="text-[10px] text-neutral-600">Saved {p.savedAt}</span>}
      </div>

      <div className="flex-1" />

      <BarBtn title="Undo (⌘Z)" onClick={p.onUndo} disabled={!p.canUndo}>
        <Undo2 size={13} strokeWidth={1.8} />
      </BarBtn>
      <BarBtn title="Redo (⇧Z)" onClick={p.onRedo} disabled={!p.canRedo}>
        <Redo2 size={13} strokeWidth={1.8} />
      </BarBtn>
      <BarBtn title="Import .shear / .json" onClick={() => fileRef.current?.click()}>
        <Upload size={13} strokeWidth={1.8} />
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

      <BarBtn title="Preview (⇧⌘P)" onClick={p.onPlay}>
        <Play size={13} strokeWidth={1.8} />
      </BarBtn>
      <button
        title={p.animMode ? 'Exit animate mode' : 'Animate mode — keyframe timeline'}
        onClick={p.onAnimMode}
        className={`flex h-6 items-center gap-1 rounded-md px-2 text-[11px] transition-colors ${
          p.animMode ? 'bg-sky-500/20 text-sky-300' : 'text-neutral-400 hover:bg-white/10 hover:text-neutral-100'
        }`}
      >
        <Gem size={12} strokeWidth={1.8} />
        Animate
      </button>

      {/* zoom control */}
      <div className="relative">
        <button
          onClick={() => setZoomOpen((v) => !v)}
          title="Zoom"
          className="h-6 min-w-11 rounded-md px-1.5 text-center text-[11px] tabular-nums text-neutral-300 transition-colors hover:bg-white/10 hover:text-neutral-100"
        >
          {Math.round(p.zoom * 100)}%
        </button>
        {zoomOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setZoomOpen(false)} />
            <div className="absolute right-0 top-7 z-50 w-36 rounded-lg border border-white/10 bg-ink-900/95 p-1 shadow-panel backdrop-blur-xl">
              <MenuRow label="Zoom in" hint="⌘+" onClick={() => { p.onZoomIn(); setZoomOpen(false) }} />
              <MenuRow label="Zoom out" hint="⌘-" onClick={() => { p.onZoomOut(); setZoomOpen(false) }} />
              <MenuRow label="Zoom to 100%" hint="⌘0" onClick={() => { p.onZoomReset(); setZoomOpen(false) }} />
              <MenuRow label="Fit page" hint="⌘1" onClick={() => { p.onFit(); setZoomOpen(false) }} />
            </div>
          </>
        )}
      </div>
    </header>
  )
}

function MenuRow({ label, hint, onClick }: { label: string; hint: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-md px-2 py-1 text-[11px] text-neutral-300 transition-colors hover:bg-white/10 hover:text-neutral-100"
    >
      {label}
      <span className="text-[10px] text-neutral-600">{hint}</span>
    </button>
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

/** Floating presence + share pill, top-right of the canvas (new Lunacy). */
export function PresencePill(p: { peers: Peer[]; self: Peer | null; live: boolean; onShare: () => void }) {
  return (
    <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-ink-900/90 py-1 pl-1.5 pr-1 shadow-panel backdrop-blur-xl">
      {p.live && (
        <span className="flex items-center -space-x-1">
          {[p.self, ...p.peers].filter(Boolean).map((peer, i) => (
            <span
              key={i}
              title={peer!.name}
              className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-ink-900 text-[10px] font-semibold text-neutral-900"
              style={{ background: peer!.color }}
            >
              {peer!.name.charAt(0).toUpperCase()}
            </span>
          ))}
        </span>
      )}
      <button
        onClick={p.onShare}
        title="Work together — share a live session"
        className={`flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium transition-colors ${
          p.live ? 'bg-white text-neutral-900' : 'bg-white/10 text-neutral-200 hover:bg-white/20'
        }`}
      >
        {p.live ? <Check size={11} strokeWidth={2.5} /> : <Share2 size={11} strokeWidth={2} />}
        {p.live ? 'Live' : 'Share'}
      </button>
    </div>
  )
}
