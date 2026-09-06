import { useCallback, useEffect, useRef, useState } from 'react'
import type { Document, Peer } from './types'

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
  // The share link must match how THIS browser reached the server, so a
  // port-forward / tunnel origin is what guests actually open.
  if (typeof window !== 'undefined' && window.location?.origin && !window.location.origin.startsWith('file:')) {
    s.url = `${window.location.origin}/join/${s.id}`
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
  /** Called when another peer edits the document. */
  onDocument: (doc: Document) => void
  /** The document to publish when this peer edits. */
  docRef: React.MutableRefObject<Document>
}

/**
 * Live session client. Receives everything over one SSE stream and pushes
 * cursor/selection/document updates back with small POSTs — no extra
 * dependency on either side of the wire.
 */
export function useCollab({ sessionId, name, onDocument, docRef }: Options) {
  const [state, setState] = useState<CollabState>({ connected: false, peers: [], self: null })
  const peerIdRef = useRef<string | null>(null)
  const suppressRef = useRef(false)
  const onDocumentRef = useRef(onDocument)
  onDocumentRef.current = onDocument

  useEffect(() => {
    if (!sessionId) {
      setState({ connected: false, peers: [], self: null })
      peerIdRef.current = null
      return
    }
    const url = `/api/sessions/${sessionId}/events?name=${encodeURIComponent(name)}`
    const es = new EventSource(url)

    es.addEventListener('hello', (e) => {
      const data = JSON.parse((e as MessageEvent).data) as { peer: Peer; document: Document; peers: Peer[] }
      peerIdRef.current = data.peer.id
      suppressRef.current = true
      onDocumentRef.current(data.document)
      setTimeout(() => (suppressRef.current = false), 0)
      setState({ connected: true, self: data.peer, peers: data.peers.filter((p) => p.id !== data.peer.id) })
    })

    es.addEventListener('peers', (e) => {
      const peers = JSON.parse((e as MessageEvent).data) as Peer[]
      setState((s) => ({ ...s, peers: peers.filter((p) => p.id !== peerIdRef.current) }))
    })

    es.addEventListener('presence', (e) => {
      const p = JSON.parse((e as MessageEvent).data) as Peer
      if (p.id === peerIdRef.current) return
      setState((s) => {
        const next = s.peers.some((x) => x.id === p.id)
          ? s.peers.map((x) => (x.id === p.id ? p : x))
          : [...s.peers, p]
        return { ...s, peers: next }
      })
    })

    es.addEventListener('document', (e) => {
      const data = JSON.parse((e as MessageEvent).data) as { document: Document; from: string }
      if (data.from === peerIdRef.current) return
      suppressRef.current = true
      onDocumentRef.current(data.document)
      setTimeout(() => (suppressRef.current = false), 0)
    })

    es.onerror = () => setState((s) => ({ ...s, connected: false }))

    return () => {
      es.close()
      peerIdRef.current = null
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

  /** Debounced document publish; skipped while applying a remote change. */
  const pushTimer = useRef<number | null>(null)
  const pushDocument = useCallback(() => {
    const id = peerIdRef.current
    if (!sessionId || !id || suppressRef.current) return
    if (pushTimer.current) window.clearTimeout(pushTimer.current)
    pushTimer.current = window.setTimeout(() => {
      void fetch(`/api/sessions/${sessionId}/document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ peer: id, document: docRef.current }),
      }).catch(() => {})
    }, 180)
  }, [sessionId, docRef])

  return { ...state, sendPresence, pushDocument }
}
