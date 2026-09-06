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
    const ctrl = new AbortController()
    const timer = window.setTimeout(() => ctrl.abort(), 8000)
    const load = (attempt: number) => {
      fetch(`/api/sessions/${sessionId}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status === 404 ? 'This session has ended.' : 'Could not join.'))))
        .then(setInfo)
        .catch((e: Error) => {
          if (ctrl.signal.aborted) return
          if (attempt < 8 && (e.name === 'TypeError' || e.message === 'Failed to fetch')) {
            window.setTimeout(() => load(attempt + 1), 250)
            return
          }
          if (e.name === 'AbortError') setError('Could not reach the host. Check the link and that the session is still open.')
          else setError(e.message || 'This session has ended.')
        })
    }
    load(0)
    return () => {
      ctrl.abort()
      window.clearTimeout(timer)
    }
  }, [sessionId])

  const remember = () => sessionStorage.setItem('shear.name', name.trim() || 'Designer')

  const openApp = () => {
    remember()
    setTried(true)
    // Launch shear:// without navigating this page away. Navigating to a
    // custom scheme leaves a blank tab if the app isn't installed; an
    // iframe / hidden <a> keeps the join UI (and Continue here) alive.
    const url = `shear://${window.location.host}/join/${sessionId}`
    const a = document.createElement('a')
    a.href = url
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    a.remove()
    const iframe = document.createElement('iframe')
    iframe.src = url
    iframe.style.display = 'none'
    iframe.setAttribute('aria-hidden', 'true')
    document.body.appendChild(iframe)
    window.setTimeout(() => iframe.remove(), 2500)
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
          <>
            <p className="mt-2 text-[12px] text-neutral-400">{error}</p>
            <button
              onClick={enter}
              className="mt-3 w-full rounded-lg bg-white py-2 text-[12px] font-medium text-neutral-900 transition-colors hover:bg-neutral-200"
            >
              Open editor anyway
            </button>
          </>
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
                Nothing happened? Shear may not be installed on this machine — continue here.
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
