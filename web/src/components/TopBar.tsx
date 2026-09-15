import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ChevronDown,
  Circle,
  Download,
  Hand,
  Minus,
  MousePointer2,
  Play,
  Redo2,
  Square,
  Type,
  Undo2,
  Upload,
  Users,
  Box,
} from 'lucide-react'
import type { Peer, Tool } from '../types'
import { PeerAvatars } from './Presence'
import { Logo } from './Logo'

interface Props {
  docName: string
  onRename: (name: string) => void
  savedAt: string | null
  tool: Tool
  onTool: (t: Tool) => void
  onInsertFrame: (w: number, h: number, label: string) => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  onImport: (file: File) => void
  onExport: () => void
  onPlay: () => void
  onShare: () => void
  onHome: () => void
  peers: Peer[]
  self: Peer | null
  live: boolean
}

const EASE = [0.25, 0.1, 0.25, 1] as const

const TOOLS: { id: Tool; icon: React.ReactNode; label: string; key: string }[] = [
  { id: 'select', icon: <MousePointer2 size={15} strokeWidth={1.8} />, label: 'Select', key: 'V' },
  { id: 'hand', icon: <Hand size={15} strokeWidth={1.8} />, label: 'Hand', key: 'H' },
  { id: 'frame', icon: <Box size={15} strokeWidth={1.8} />, label: 'Frame', key: 'F' },
  { id: 'rect', icon: <Square size={15} strokeWidth={1.8} />, label: 'Rectangle', key: 'R' },
  { id: 'ellipse', icon: <Circle size={15} strokeWidth={1.8} />, label: 'Ellipse', key: 'O' },
  { id: 'line', icon: <Minus size={15} strokeWidth={1.8} />, label: 'Line', key: 'L' },
  { id: 'text', icon: <Type size={15} strokeWidth={1.8} />, label: 'Text', key: 'T' },
]

/** Frame presets, the same device sizes Lunacy offers out of the box. */
const FRAME_PRESETS: { label: string; w: number; h: number }[] = [
  { label: 'iPhone 15 Pro · 393×852', w: 393, h: 852 },
  { label: 'Android · 360×800', w: 360, h: 800 },
  { label: 'Tablet · 768×1024', w: 768, h: 1024 },
  { label: 'Laptop · 1280×800', w: 1280, h: 800 },
  { label: 'Desktop · 1440×900', w: 1440, h: 900 },
  { label: 'Full HD · 1920×1080', w: 1920, h: 1080 },
]

export function TopBar(props: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [framesOpen, setFramesOpen] = useState(false)
  const framesRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!framesOpen) return
    const onDown = (e: MouseEvent) => {
      if (framesRef.current && !framesRef.current.contains(e.target as Node)) setFramesOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFramesOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [framesOpen])

  return (
    <header className="relative z-30 flex h-11 shrink-0 items-center gap-2 border-b border-white/5 bg-ink-925 px-3">
      {/* left: mark + document */}
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <button
          onClick={props.onHome}
          title="Back to your designs"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-neutral-200 transition-colors hover:bg-white/10"
        >
          <Logo size={15} />
        </button>
        <input
          value={props.docName}
          onChange={(e) => props.onRename(e.target.value)}
          spellCheck={false}
          aria-label="Document name"
          className="w-40 min-w-0 truncate rounded-md bg-transparent px-2 py-1 text-[12px] text-neutral-300 outline-none transition-colors hover:bg-white/5 focus:bg-white/5 focus:text-neutral-100"
        />
        {props.savedAt && (
          <span className="hidden text-[11px] text-neutral-600 lg:inline" title={props.savedAt}>
            saved
          </span>
        )}
        {props.live && <PeerAvatars peers={props.peers} self={props.self} />}
      </div>

      {/* centre: the tool strip */}
      <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-white/5 bg-ink-800 p-0.5">
        {TOOLS.map((t) => {
          const active = props.tool === t.id
          return (
            <div key={t.id} className="relative flex items-center">
              <motion.button
                title={`${t.label}  (${t.key})`}
                whileTap={{ scale: 0.92 }}
                onClick={() => props.onTool(t.id)}
                className={`relative flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                  active ? 'text-neutral-900' : 'text-neutral-400 hover:bg-white/10 hover:text-neutral-100'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="tool-active"
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute inset-0 rounded-md bg-white"
                  />
                )}
                <span className="relative">{t.icon}</span>
              </motion.button>
              {t.id === 'frame' && (
                <div ref={framesRef} className="relative">
                  <button
                    title="Frame presets"
                    onClick={() => setFramesOpen((v) => !v)}
                    className={`flex h-7 w-3.5 items-center justify-center rounded-r-md transition-colors hover:bg-white/10 ${
                      active ? 'text-neutral-600' : 'text-neutral-500'
                    }`}
                  >
                    <ChevronDown size={10} strokeWidth={2.5} />
                  </button>
                  <AnimatePresence>
                    {framesOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.16, ease: EASE }}
                        className="absolute left-1/2 top-8 z-40 w-52 -translate-x-1/2 overflow-hidden rounded-lg border border-white/10 bg-ink-925/95 p-1 shadow-panel backdrop-blur-xl"
                      >
                        {FRAME_PRESETS.map((f) => (
                          <button
                            key={f.label}
                            onClick={() => {
                              setFramesOpen(false)
                              props.onTool('select')
                              props.onInsertFrame(f.w, f.h, f.label.split(' ·')[0])
                            }}
                            className="block w-full rounded-md px-2.5 py-1.5 text-left text-[11.5px] text-neutral-300 transition-colors hover:bg-white/10 hover:text-neutral-100"
                          >
                            {f.label}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* right: history + actions */}
      <div className="flex flex-1 items-center justify-end gap-0.5">
        <input
          ref={fileRef}
          type="file"
          accept=".shear,.json,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) props.onImport(f)
            e.target.value = ''
          }}
        />

        <button
          onClick={props.onUndo}
          disabled={!props.canUndo}
          title="Undo (⌘Z)"
          className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-100 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <Undo2 size={13} strokeWidth={1.8} />
        </button>
        <button
          onClick={props.onRedo}
          disabled={!props.canRedo}
          title="Redo (⇧⌘Z)"
          className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-100 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <Redo2 size={13} strokeWidth={1.8} />
        </button>

        <div className="mx-1 h-4 w-px bg-white/10" />

        <button
          onClick={props.onPlay}
          title="Preview (⇧⌘P)"
          className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-100"
        >
          <Play size={13} strokeWidth={1.8} />
        </button>

        <button
          onClick={props.onShare}
          title="Work together"
          className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-white/10 hover:text-neutral-100 ${
            props.live ? 'text-neutral-100' : 'text-neutral-400'
          }`}
        >
          <Users size={13} strokeWidth={1.8} />
        </button>

        <button
          onClick={() => fileRef.current?.click()}
          title="Open .shear file"
          className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-100"
        >
          <Upload size={13} strokeWidth={1.8} />
        </button>

        <button
          onClick={props.onExport}
          className="ml-1.5 flex h-7 items-center gap-1.5 rounded-md bg-white px-3 text-[12px] font-medium text-neutral-900 transition-colors hover:bg-neutral-200"
        >
          <Download size={12} strokeWidth={2.2} />
          Export
        </button>
      </div>
    </header>
  )
}
