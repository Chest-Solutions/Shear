import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Copy, Users } from 'lucide-react'
import type { Peer } from '../types'

const EASE = [0.25, 0.1, 0.25, 1] as const

interface Props {
  open: boolean
  onClose: () => void
  url: string | null
  starting: boolean
  peers: Peer[]
  self: Peer | null
  name: string
  onName: (v: string) => void
  onStart: () => void
  onEnd: () => void
}

/**
 * Share sheet. Starting a session asks the Go backend to open a room and
 * returns a link on this machine's network address — anyone who opens it
 * lands in the same document with their cursor visible.
 */
export function ShareSheet({ open, onClose, url, starting, peers, self, name, onName, onStart, onEnd }: Props) {
  const [copied, setCopied] = useState(false)
  const [link, setLink] = useState(url ?? '')

  useEffect(() => {
    if (url) setLink(url)
  }, [url])

  const copy = async () => {
    const value = link || url
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      /* clipboard blocked — the field is selectable */
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onMouseDown={onClose}
          className="fixed inset-0 z-40 flex items-start justify-center bg-neutral-950/40 pt-24 backdrop-blur-md"
        >
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98, filter: 'blur(10px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -8, scale: 0.98, filter: 'blur(10px)' }}
            transition={{ duration: 0.26, ease: EASE }}
            onMouseDown={(e) => e.stopPropagation()}
            className="w-80 rounded-2xl border border-white/10 bg-neutral-900/80 p-4 shadow-panel backdrop-blur-2xl"
          >
            <div className="flex items-center gap-2">
              <Users size={14} strokeWidth={1.8} className="text-neutral-400" />
              <span className="text-[13px] font-medium text-neutral-100">Work together</span>
            </div>

            {!url ? (
              <>
                <p className="mt-1.5 text-[11px] leading-relaxed text-neutral-500">
                  Opens a live session on this machine and gives you a link to send.
                </p>
                <input
                  value={name}
                  onChange={(e) => onName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !starting && onStart()}
                  placeholder="Your name"
                  spellCheck={false}
                  className="mt-3 w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-[12px] text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 focus:border-white/30"
                />
                <button
                  onClick={onStart}
                  disabled={starting}
                  className="mt-3 w-full rounded-lg bg-white py-2 text-[12px] font-medium text-neutral-900 transition-colors hover:bg-neutral-200 disabled:opacity-50"
                >
                  {starting ? 'Starting…' : 'Start session'}
                </button>
              </>
            ) : (
              <>
                <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 p-1 pl-2.5">
                  <input
                    readOnly
                    value={url}
                    onFocus={(e) => e.target.select()}
                    className="min-w-0 flex-1 bg-transparent text-[11px] text-neutral-300 outline-none"
                  />
                  <button
                    onClick={copy}
                    className="flex h-6 items-center gap-1 rounded-md bg-white px-2 text-[11px] font-medium text-neutral-900 transition-colors hover:bg-neutral-200"
                  >
                    {copied ? <Check size={11} strokeWidth={2.4} /> : <Copy size={11} strokeWidth={2} />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>

                <div className="mt-3 space-y-1.5">
                  {(self ? [self, ...peers] : peers).map((p) => (
                    <div key={p.id} className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                      <span className="text-[11px] text-neutral-300">{p.name}</span>
                      {self?.id === p.id && <span className="text-[10px] text-neutral-600">you</span>}
                    </div>
                  ))}
                </div>

                <button
                  onClick={onEnd}
                  className="mt-3 w-full rounded-lg border border-white/10 py-1.5 text-[11px] text-neutral-400 transition-colors hover:bg-white/5 hover:text-neutral-200"
                >
                  Leave session
                </button>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
