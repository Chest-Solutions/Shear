import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import type { Scene } from '../types'

const EASE = [0.16, 1, 0.3, 1] as const

interface Props {
  open: boolean
  scenes: Scene[]
  defaultSceneId: string
  onClose: () => void
  onExport: (sceneId: string) => Promise<void>
}

export function ExportModal({ open, scenes, defaultSceneId, onClose, onExport }: Props) {
  const [selected, setSelected] = useState(defaultSceneId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setSelected(defaultSceneId)
      setBusy(false)
      setError(null)
    }
  }, [open, defaultSceneId])

  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      await onExport(selected)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'export failed')
      setBusy(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: EASE }}
          className="fixed inset-0 z-40 flex items-center justify-center bg-neutral-950/40 backdrop-blur-sm"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose()
          }}
        >
          <motion.div
            initial={{ opacity: 0, filter: 'blur(12px)', scale: 0.96, y: 8 }}
            animate={{ opacity: 1, filter: 'blur(0px)', scale: 1, y: 0 }}
            exit={{ opacity: 0, filter: 'blur(12px)', scale: 0.97, y: 6 }}
            transition={{ duration: 0.32, ease: EASE }}
            className="w-80 overflow-hidden rounded-xl border border-white/10 bg-neutral-900/95 shadow-panel backdrop-blur-2xl"
          >
            <div className="px-4 pt-4">
              <h2 className="text-[13px] font-medium text-neutral-100">Export scene</h2>
              <p className="mt-0.5 text-[11px] text-neutral-500">One scene, rendered to PNG.</p>
            </div>

            <div className="max-h-56 space-y-0.5 overflow-y-auto p-2">
              {scenes.map((s) => {
                const active = s.id === selected
                return (
                  <button
                    key={s.id}
                    onClick={() => setSelected(s.id)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                      active ? 'bg-white/10' : 'hover:bg-white/5'
                    }`}
                  >
                    <span
                      className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                        active ? 'border-white' : 'border-neutral-600'
                      }`}
                    >
                      {active && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </span>
                    <span className={`flex-1 truncate text-[12px] ${active ? 'text-neutral-100' : 'text-neutral-400'}`}>
                      {s.name}
                    </span>
                    <span className="text-[10px] tabular-nums text-neutral-600">
                      {Math.round(s.width)}×{Math.round(s.height)}
                    </span>
                  </button>
                )
              })}
            </div>

            {error && <p className="px-4 pb-1 text-[11px] text-red-400">{error}</p>}

            <div className="flex items-center justify-end gap-2 border-t border-white/5 p-3">
              <button
                onClick={onClose}
                className="rounded-md px-3 py-1.5 text-[12px] text-neutral-400 transition-colors hover:bg-white/5 hover:text-neutral-200"
              >
                Cancel
              </button>
              <button
                onClick={run}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-md bg-white px-3.5 py-1.5 text-[12px] font-medium text-neutral-900 transition-colors hover:bg-neutral-200 disabled:opacity-60"
              >
                {busy && <Loader2 size={12} className="animate-spin" />}
                {busy ? 'Rendering' : 'Export PNG'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
