import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Download, FileJson, Image, Upload } from 'lucide-react'

interface Props {
  docName: string
  onRename: (name: string) => void
  savedAt: string | null
  onImport: (file: File) => void
  onExportJSON: () => void
  onExportPNG: () => void
}

const EASE = [0.16, 1, 0.3, 1] as const

export function TopBar({ docName, onRename, savedAt, onImport, onExportJSON, onExportPNG }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  return (
    <header className="relative z-30 flex h-11 shrink-0 items-center gap-3 border-b border-white/5 bg-neutral-800/80 px-3 backdrop-blur-xl">
      <div className="flex w-40 items-center">
        <span className="text-[13px] font-semibold tracking-tight text-neutral-200">Shear</span>
      </div>

      <div className="flex flex-1 items-center justify-center">
        <input
          value={docName}
          onChange={(e) => onRename(e.target.value)}
          spellCheck={false}
          aria-label="Document name"
          className="w-52 rounded-md bg-transparent px-2 py-1 text-center text-[12px] text-neutral-300 outline-none transition-colors hover:bg-white/5 focus:bg-white/5 focus:text-neutral-100"
        />
        {savedAt && (
          <span className="ml-2 text-[11px] text-neutral-600" title={savedAt}>
            saved
          </span>
        )}
      </div>

      <div className="flex w-40 items-center justify-end gap-1">
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onImport(f)
            e.target.value = ''
          }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          title="Import JSON"
          className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-100"
        >
          <Upload size={14} strokeWidth={1.8} />
        </button>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-7 items-center gap-1.5 rounded-md bg-white px-3 text-[12px] font-medium text-neutral-900 transition-colors hover:bg-neutral-200"
          >
            <Download size={13} strokeWidth={2} />
            Export
          </button>

          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, filter: 'blur(8px)', y: -4, scale: 0.97 }}
                animate={{ opacity: 1, filter: 'blur(0px)', y: 0, scale: 1 }}
                exit={{ opacity: 0, filter: 'blur(8px)', y: -4, scale: 0.97 }}
                transition={{ duration: 0.22, ease: EASE }}
                className="absolute right-0 top-9 w-52 overflow-hidden rounded-lg border border-white/10 bg-neutral-900/90 p-1 shadow-panel backdrop-blur-xl"
              >
                <MenuItem icon={<FileJson size={13} strokeWidth={1.8} />} label="Export JSON" hint="Full design file" onClick={() => { setMenuOpen(false); onExportJSON() }} />
                <MenuItem icon={<Image size={13} strokeWidth={1.8} />} label="Export scene as PNG" hint="One scene, rendered in Go" onClick={() => { setMenuOpen(false); onExportPNG() }} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  )
}

function MenuItem({ icon, label, hint, onClick }: { icon: React.ReactNode; label: string; hint: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-white/10"
    >
      <span className="text-neutral-400">{icon}</span>
      <span className="flex-1">
        <span className="block text-[12px] text-neutral-200">{label}</span>
        <span className="block text-[10px] text-neutral-500">{hint}</span>
      </span>
    </button>
  )
}
