import { useCallback, useEffect, useState } from 'react'
import type { Document } from './types'
import { HomePage } from './components/HomePage'
import { JoinGate } from './components/JoinGate'
import { Editor } from './Editor'

type Route =
  | { kind: 'home' }
  | { kind: 'doc'; id: string }
  | { kind: 'join'; sessionId: string }

function parseRoute(path: string): Route {
  const join = /^\/join\/([\w-]+)/.exec(path)
  if (join) return { kind: 'join', sessionId: join[1] }
  const doc = /^\/doc\/([\w-]+)/.exec(path)
  if (doc) return { kind: 'doc', id: doc[1] }
  return { kind: 'home' }
}

/**
 * App shell: a tiny router around three surfaces —
 *   /            the start page with recent designs
 *   /doc/<id>    the editor on a stored document
 *   /join/<id>   joining a live "work together" session
 */
export default function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname))
  // document handed straight to the editor after "New design"
  const [handoff, setHandoff] = useState<Document | null>(null)
  const [joinName, setJoinName] = useState<string | null>(null)

  useEffect(() => {
    const onPop = () => setRoute(parseRoute(window.location.pathname))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const navigate = useCallback((to: string) => {
    window.history.pushState({}, '', to)
    setRoute(parseRoute(to))
  }, [])

  const goHome = useCallback(() => {
    setHandoff(null)
    setJoinName(null)
    navigate('/')
  }, [navigate])

  if (route.kind === 'join') {
    if (joinName === null) {
      return (
        <JoinGate
          key={route.sessionId}
          sessionId={route.sessionId}
          onContinue={(name) => setJoinName(name)}
        />
      )
    }
    return (
      <Editor
        key={route.sessionId}
        join={{ sessionId: route.sessionId, name: joinName }}
        onHome={goHome}
      />
    )
  }

  if (route.kind === 'doc') {
    return (
      <Editor
        key={route.id}
        docId={route.id}
        initialDoc={handoff?.id === route.id ? handoff : null}
        onHome={goHome}
      />
    )
  }

  return (
    <HomePage
      onOpen={(id) => {
        setHandoff(null)
        navigate(`/doc/${id}`)
      }}
      onCreate={(doc) => {
        setHandoff(doc)
        navigate(`/doc/${doc.id}`)
      }}
    />
  )
}
