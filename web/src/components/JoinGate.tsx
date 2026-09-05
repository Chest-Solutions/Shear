import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'

const EASE = [0.25, 0.1, 0.25, 1] as const

/**
 * Shown when a share link is opened. Shear is a desktop app, so we offer
 * to hand off to it first (shear://) and fall back to this browser.
 */
export function JoinGate({ sessionId, onContinue }: { sessionId: string; onContinue: () => void }) {
  const [name, setName] = useState('')
  const [info, setInfo] = useState<{ name: string; peers: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tried, setTried] = useState(false)

  useEffect(() => {
    fetch(`/api/sessions/${sessionId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('This session has ended.'))))
      .then(setInfo)
      .catch((e: Error) => setError(e.message))
  }, [sessionId])

  const remember = () => sessionStorage.setItem('shear.name', name.trim() || 'Designer')

  const openApp = () => {
    remember()
    setTried(true)
    // The scheme carries the host, so the desktop app knows which machine
    // is hosting the room and connects there rather than to its own
    // in-process backend. If Shear isn't installed nothing happens and
    // the browser option below stays available.
    window.location.href = `shear://${window.location.host}/join/${sessionId}`
  }

  const enter = () => {
    remember()
    onContinue()
  }

  return (
    <div className="flex h-full items-center justify-center bg-neutral-800 px-6">
      <motion.div
        initial={{ opacity: 0, y: 8, filter: 'blur(12px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.4, ease: EASE }}
        className="w-80 rounded-2xl border border-white/10 bg-neutral-900/70 p-5 shadow-panel backdrop-blur-2xl"
      >
        <div className="text-[13px] font-semibold tracking-tight text-neutral-100">Shear</div>

        {error ? (
          <p className="mt-2 text-[12px] text-neutral-400">{error}</p>
        ) : (
          <>
            <p className="mt-1 text-[12px] text-neutral-400">
              {info ? `Join “${info.name}”` : 'Joining…'}
            </p>

            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && name.trim() && openApp()}
              autoFocus
              placeholder="Your name"
              spellCheck={false}
              className="mt-4 w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-[12px] text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 focus:border-white/30"
            />

            <button
              onClick={openApp}
              disabled={!name.trim()}
              className="mt-2.5 w-full rounded-lg bg-white py-2 text-[12px] font-medium text-neutral-900 transition-colors hover:bg-neutral-200 disabled:opacity-40"
            >
              Open in Shear
            </button>

            {tried && (
              <p className="mt-1.5 text-center text-[10px] leading-relaxed text-neutral-600">
                Nothing happened? Shear may not be installed on this machine.
              </p>
            )}

            <button
              onClick={enter}
              disabled={!name.trim()}
              className="mt-1.5 flex w-full items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] text-neutral-500 transition-colors hover:text-neutral-300 disabled:opacity-40"
            >
              Continue here
              <ArrowRight size={11} strokeWidth={2} />
            </button>
          </>
        )}
      </motion.div>
    </div>
  )
}
