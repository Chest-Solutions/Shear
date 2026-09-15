import { useCallback, useEffect, useRef, useState } from 'react'
import type { Document, Peer } from './types'
import { uid } from './utils'

export interface Session {
  id: string
  url: string
  name: string
}

/** Ask the Go backend to open a room and hand back a shareable link. */
export async function createSession(document: Document): Promise<Session> {
  const res = await fetch('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ document }),
  })
  if (!res.ok) throw new Error('could not start the session')
  const s = (await res.json()) as Session
  // The link must match how *this* browser reached the server: behind a
  // tunnel or on a LAN host the origin already works, while the server's
  // guessed LAN address may not. Only on a loopback origin (desktop app,
  // localhost) fall back to the server's guess.
  try {
    const host = window.location.hostname
    const loopback = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === ''
    if (!loopback) s.url = `${window.location.origin}/join/${s.id}`
  } catch {
    /* keep the server's url */
  }
  return s
}

export interface CollabState {
  connected: boolean
  peers: Peer[]
  self: Peer | null
}

interface Options {
  sessionId: string | null
  name: string
  /** Called when the document changes remotely. `initial` marks the first sync. */
  onDocument: (doc: Document, initial: boolean) => void
  /** The document to publish when this peer edits. */
  docRef: React.MutableRefObject<Document>
}

const PUSH_DEBOUNCE = 180
const REMOTE_QUIET_MS = 420

/**
 * Live session client. One SSE stream in, small JSON posts out.
 *
 * Hardened for real two-person use:
 *  - the peer id is stable across reconnects, so the room sees one
 *    designer even when EventSource re-dials
 *  - remote documents carry the room's revision; anything older than
 *    what we already applied is dropped (kills the echo storm where two
 *    browsers push the same document back and forth forever)
 *  - applying a remote document quiets our own publisher long enough to
 *    outlast its debounce, so it can't bounce straight back
 *  - a presence heartbeat keeps long-idle peers from being reaped
 */
export function useCollab({ sessionId, name, onDocument, docRef }: Options) {
  const [state, setState] = useState<CollabState>({ connected: false, peers: [], self: null })
  const peerIdRef = useRef<string>('')
  const lastRevRef = useRef(0)
  const quietUntilRef = useRef(0)
  const onDocumentRef = useRef(onDocument)
  onDocumentRef.current = onDocument

  useEffect(() => {
    if (!sessionId) {
      setState({ connected: false, peers: [], self: null })
      peerIdRef.current = ''
      lastRevRef.current = 0
      return
    }

    // One identity per room per tab, kept across EventSource reconnects.
    if (!peerIdRef.current) peerIdRef.current = uid()
    const peerId = peerIdRef.current

    const url = `/api/sessions/${sessionId}/events?name=${encodeURIComponent(name)}&peer=${encodeURIComponent(peerId)}`
    const es = new EventSource(url)
    let disposed = false

    es.addEventListener('hello', (e) => {
      const data = JSON.parse((e as MessageEvent).data) as {
        peer: Peer
        document: Document
        rev: number
        peers: Peer[]
      }
      lastRevRef.current = Math.max(lastRevRef.current, data.rev ?? 0)
      quietUntilRef.current = Date.now() + REMOTE_QUIET_MS
      onDocumentRef.current(data.document, true)
      setState({ connected: true, self: data.peer, peers: data.peers.filter((p) => p.id !== peerId) })
    })

    es.addEventListener('peers', (e) => {
      const peers = JSON.parse((e as MessageEvent).data) as Peer[]
      setState((s) => ({ ...s, peers: peers.filter((p) => p.id !== peerId) }))
    })

    es.addEventListener('presence', (e) => {
      const p = JSON.parse((e as MessageEvent).data) as Peer
      if (p.id === peerId) return
      setState((s) => {
        const next = s.peers.some((x) => x.id === p.id)
          ? s.peers.map((x) => (x.id === p.id ? p : x))
          : [...s.peers, p]
        return { ...s, peers: next }
      })
    })

    es.addEventListener('document', (e) => {
      const data = JSON.parse((e as MessageEvent).data) as { document: Document; rev: number; from: string }
      if (data.from === peerId) return
      if ((data.rev ?? 0) <= lastRevRef.current) return // stale or echo
      lastRevRef.current = data.rev ?? 0
      quietUntilRef.current = Date.now() + REMOTE_QUIET_MS
      onDocumentRef.current(data.document, false)
    })

    es.onopen = () => setState((s) => ({ ...s, connected: true }))
    es.onerror = () => {
      if (!disposed) setState((s) => ({ ...s, connected: false }))
    }

    // Presence heartbeat: the room reaps peers it hasn't heard from, and
    // pointer events only fly while someone is actively moving. x<0 tells
    // the server to refresh the lease without moving the cursor.
    const heartbeat = window.setInterval(() => {
      void fetch(`/api/sessions/${sessionId}/presence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({ peer: peerId, x: -1, y: -1, sceneId: '', selection: '', active: true }),
      }).catch(() => {})
    }, 15000)

    return () => {
      disposed = true
      window.clearInterval(heartbeat)
      es.close()
    }
    // `name` is only read at connect time on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  /** Throttled cursor + selection broadcast. */
  const lastSent = useRef(0)
  const sendPresence = useCallback(
    (p: { x: number; y: number; sceneId: string; selection: string | null }) => {
      const id = peerIdRef.current
      if (!sessionId || !id) return
      const now = performance.now()
      if (now - lastSent.current < 45) return
      lastSent.current = now
      void fetch(`/api/sessions/${sessionId}/presence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({ peer: id, x: p.x, y: p.y, sceneId: p.sceneId, selection: p.selection ?? '', active: true }),
      }).catch(() => {})
    },
    [sessionId],
  )

  /** Debounced document publish; skipped while a remote change settles. */
  const pushTimer = useRef<number | null>(null)
  const pushDocument = useCallback(() => {
    const id = peerIdRef.current
    if (!sessionId || !id) return
    if (Date.now() < quietUntilRef.current) return
    if (pushTimer.current) window.clearTimeout(pushTimer.current)
    pushTimer.current = window.setTimeout(() => {
      if (Date.now() < quietUntilRef.current) return
      void fetch(`/api/sessions/${sessionId}/document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ peer: id, document: docRef.current }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((body) => {
          if (body && typeof body.rev === 'number') lastRevRef.current = Math.max(lastRevRef.current, body.rev)
        })
        .catch(() => {})
    }, PUSH_DEBOUNCE)
  }, [sessionId, docRef])

  return { ...state, sendPresence, pushDocument }
}
