import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ColorVariable, Document, Node, Scene, Tool } from './types'
import { uid, clone, slug, downloadBlob, clamp, round1 } from './utils'
import { exportSceneHTML, exportScenePNG, exportSceneSVG, getDocument, saveDocument } from './api'
import { sceneToReact } from './exporters'
import { resolveNodes, sceneDuration, sceneLoops, syncTree } from './anim'
import { TopBar } from './components/TopBar'
import { LeftPanel } from './components/LeftPanel'
import { RightPanel } from './components/RightPanel'
import { CanvasView, findAny } from './components/CanvasView'
import { ExportModal, type SceneFormat } from './components/ExportModal'
import { PreviewOverlay } from './components/PreviewOverlay'
import { ShareSheet } from './components/ShareSheet'
import { createSession, useCollab, type Session } from './collab'
import { Toasts, type ToastItem } from './components/Toast'
import type { Viewport } from './render'
import type { IconDef } from './icons/library'

const HISTORY_LIMIT = 80

export interface EditorProps {
  /** local document to edit */
  docId?: string
  /** freshly created document handed over from the home page */
  initialDoc?: Document | null
  /** join a live session instead of a stored document */
  join?: { sessionId: string; name: string }
  onHome: () => void
}

export function Editor({ docId, initialDoc, join, onHome }: EditorProps) {
  const [doc, setDoc] = useState<Document>(() => initialDoc ?? emptyDocument())
  const [loading, setLoading] = useState(!initialDoc && !join)
  const [selectionIds, setSelectionIds] = useState<string[]>([])
  const [tool, setTool] = useState<Tool>('select')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [viewport, setViewport] = useState<Viewport>({ zoom: 1, panX: 0, panY: 0 })
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [exportOpen, setExportOpen] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [starting, setStarting] = useState(false)
  const [historyTick, setHistoryTick] = useState(0)
  // Timeline scrubbing: the canvas shows the scene at this time.
  const [time, setTime] = useState(0)
  const [timelinePlaying, setTimelinePlaying] = useState(false)
  const [myName, setMyName] = useState(
    () => (typeof window !== 'undefined' ? sessionStorage.getItem('shear.name') ?? '' : ''),
  )

  const past = useRef<Document[]>([])
  const future = useRef<Document[]>([])
  const gestureSnapshot = useRef<Document | null>(null)
  const gestureTouched = useRef(false)
  const dirty = useRef(false)
  const toastSeq = useRef(0)
  const lastHistoryPush = useRef(0)
  const docRef = useRef(doc)
  docRef.current = doc

  const applyRemoteDoc = useCallback((d: Document, initial: boolean) => {
    if (initial) {
      past.current = []
      future.current = []
    }
    setDoc(d)
    setLoading(false)
  }, [])

  const collab = useCollab({
    sessionId: session?.id ?? (join ? join.sessionId : null),
    name: (join?.name ?? myName.trim()) || 'Designer',
    onDocument: applyRemoteDoc,
    docRef,
  })
  const live = collab.connected
  const pushDocument = collab.pushDocument

  const scene = doc.scenes.find((s) => s.id === doc.selectedSceneId) ?? doc.scenes[0]
  const currentSceneId = scene.id
  const selectionId = selectionIds.length > 0 ? selectionIds[selectionIds.length - 1] : null
  const selectedNode = selectionId ? findAny(scene.nodes, selectionId) : null
  const variables: ColorVariable[] = doc.variables ?? []

  const toast = useCallback((message: string) => {
    const id = ++toastSeq.current
    setToasts((ts) => [...ts.slice(-2), { id, message }])
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 2200)
  }, [])

  // ---- initial load for stored documents ----
  useEffect(() => {
    if (join || !docId || initialDoc) return
    let cancelled = false
    ;(async () => {
      try {
        const d = await getDocument(docId)
        if (!cancelled) {
          setDoc(d)
          setSelectionIds([])
        }
      } catch {
        if (!cancelled) toast('Could not open that design')
        if (!cancelled) onHome()
        return
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, join, initialDoc])

  // Publish every local edit to the room (debounced inside the hook).
  useEffect(() => {
    if (live) pushDocument()
  }, [doc, live, pushDocument])

  // ---- autosave (debounced) ----
  useEffect(() => {
    if (loading || join) return
    if (!dirty.current && !initialDoc) return
    const t = setTimeout(async () => {
      try {
        await saveDocument(docRef.current)
        dirty.current = false
        setSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
      } catch {
        /* backend offline; keep the document in memory */
      }
    }, 1200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, loading])

  // ---- history ----
  const bumpHistory = () => setHistoryTick((v) => v + 1)

  const record = useCallback((fn: (d: Document) => void) => {
    const now = Date.now()
    const coalesce = now - lastHistoryPush.current < 600
    lastHistoryPush.current = now
    setDoc((d) => {
      if (!coalesce) {
        past.current.push(d)
        if (past.current.length > HISTORY_LIMIT) past.current.shift()
        future.current = []
      }
      const next = clone(d)
      fn(next)
      return next
    })
    dirty.current = true
    bumpHistory()
  }, [])

  const apply = useCallback((fn: (d: Document) => void) => {
    setDoc((d) => {
      const next = clone(d)
      fn(next)
      return next
    })
    dirty.current = true
  }, [])

  const gestureBegin = useCallback(() => {
    gestureSnapshot.current = clone(docRef.current)
    gestureTouched.current = false
  }, [])

  const gestureEnd = useCallback(() => {
    if (gestureTouched.current && gestureSnapshot.current) {
      past.current.push(gestureSnapshot.current)
      if (past.current.length > HISTORY_LIMIT) past.current.shift()
      future.current = []
      bumpHistory()
    }
    gestureSnapshot.current = null
    gestureTouched.current = false
    lastHistoryPush.current = 0
  }, [])

  const markGestureTouched = () => {
    gestureTouched.current = true
  }

  const timeRef = useRef(0)

  const mutateScene = useCallback(
    (sceneId: string, fn: (s: Scene) => void, recordHistory: boolean) => {
      const doIt = (d: Document) => {
        const s = d.scenes.find((x) => x.id === sceneId)
        if (!s) return
        const before = docRef.current.scenes.find((x) => x.id === sceneId)?.nodes ?? []
        fn(s)
        s.nodes = syncTree(before, s.nodes, timeRef.current)
      }
      if (recordHistory) record(doIt)
      else apply(doIt)
    },
    [record, apply],
  )

  // ---- inline text editing ----
  const editingIdRef = useRef<string | null>(null)
  editingIdRef.current = editingId

  const startTextEdit = useCallback(
    (id: string) => {
      gestureBegin()
      gestureTouched.current = true
      setEditingId(id)
    },
    [gestureBegin],
  )

  const liveTextEdit = useCallback(
    (id: string, content: string) => {
      mutateScene(
        currentSceneId,
        (s) => {
          const n = findAny(s.nodes, id)
          if (n?.text) n.text.content = content
        },
        false,
      )
    },
    [mutateScene, currentSceneId],
  )

  const commitTextEdit = useCallback(
    (id: string, content: string) => {
      const sceneNodes = docRef.current.scenes.find((s) => s.id === currentSceneId)?.nodes ?? []
      const n = findAny(sceneNodes, id)
      if (n?.text && n.text.content !== content) {
        mutateScene(
          currentSceneId,
          (s) => {
            const nn = findAny(s.nodes, id)
            if (nn?.text) nn.text.content = content
          },
          false,
        )
      }
      if (editingIdRef.current === id) gestureEnd()
      setEditingId(null)
    },
    [mutateScene, currentSceneId, gestureEnd],
  )

  const closeTextEdit = useCallback(() => {
    const id = editingIdRef.current
    if (id) {
      const n = findAny(docRef.current.scenes.find((s) => s.id === currentSceneId)?.nodes ?? [], id)
      commitTextEdit(id, n?.text?.content ?? '')
    }
  }, [commitTextEdit, currentSceneId])

  const undo = useCallback(() => {
    const prev = past.current.pop()
    if (!prev) return
    future.current.push(docRef.current)
    setDoc(prev)
    setSelectionIds([])
    dirty.current = true
    bumpHistory()
  }, [])

  const redo = useCallback(() => {
    const next = future.current.pop()
    if (!next) return
    past.current.push(docRef.current)
    setDoc(next)
    setSelectionIds([])
    dirty.current = true
    bumpHistory()
  }, [])

  // ---- document operations ----

  const updateNode = useCallback(
    (id: string, patch: Partial<Node>) => {
      mutateScene(
        currentSceneId,
        (s) => {
          const n = findAny(s.nodes, id)
          if (n) Object.assign(n, patch)
        },
        true,
      )
    },
    [mutateScene, currentSceneId],
  )

  const updateText = useCallback(
    (id: string, patch: Partial<NonNullable<Node['text']>>) => {
      mutateScene(
        currentSceneId,
        (s) => {
          const n = findAny(s.nodes, id)
          if (n?.text) Object.assign(n.text, patch)
        },
        true,
      )
    },
    [mutateScene, currentSceneId],
  )

  const updateSceneProps = useCallback(
    (patch: Partial<Scene>) => {
      mutateScene(currentSceneId, (s) => Object.assign(s, patch), true)
    },
    [mutateScene, currentSceneId],
  )

  const deleteNode = useCallback(
    (id: string) => {
      mutateScene(
        currentSceneId,
        (s) => {
          const remove = (list: Node[]): Node[] =>
            list.filter((n) => n.id !== id).map((n) => (n.children ? { ...n, children: remove(n.children) } : n))
          s.nodes = remove(s.nodes)
        },
        true,
      )
      setSelectionIds((ids) => ids.filter((x) => x !== id))
    },
    [mutateScene, currentSceneId],
  )

  const deleteSelection = useCallback(() => {
    const ids = selectionIds
    if (ids.length === 0) return
    mutateScene(
      currentSceneId,
      (s) => {
        const remove = (list: Node[]): Node[] =>
          list.filter((n) => !ids.includes(n.id)).map((n) => (n.children ? { ...n, children: remove(n.children) } : n))
        s.nodes = remove(s.nodes)
      },
      true,
    )
    setSelectionIds([])
  }, [mutateScene, currentSceneId, selectionIds])

  const duplicateNode = useCallback(
    (id: string) => {
      // Duplicating duplicates the whole selection when the anchor is part
      // of it — same as Figma's ⌘D on a multi-selection.
      const ids = selectionIds.includes(id) ? selectionIds : [id]
      const assignNewIds = (n: Node): Node => {
        const cp = clone(n)
        cp.id = uid()
        cp.name = n.name + ' copy'
        cp.x = round1(n.x + 16)
        cp.y = round1(n.y + 16)
        if (cp.children) cp.children = cp.children.map(assignNewIds)
        return cp
      }
      const newIds: string[] = []
      mutateScene(
        currentSceneId,
        (s) => {
          const dupIn = (list: Node[]) => {
            for (let i = list.length - 1; i >= 0; i--) {
              const n = list[i]
              if (n.children) dupIn(n.children)
              if (ids.includes(n.id)) {
                const cp = assignNewIds(n)
                newIds.push(cp.id)
                list.splice(i + 1, 0, cp)
              }
            }
          }
          dupIn(s.nodes)
        },
        true,
      )
      if (newIds.length > 0) setSelectionIds(newIds)
    },
    [mutateScene, currentSceneId, selectionIds],
  )

  const addNode = useCallback(
    (n: Node) => {
      mutateScene(currentSceneId, (s) => s.nodes.push(n), true)
    },
    [mutateScene, currentSceneId],
  )

  const reorderNode = useCallback(
    (dragId: string, beforeId: string | null) => {
      mutateScene(
        currentSceneId,
        (s) => {
          const move = (list: Node[]): boolean => {
            const from = list.findIndex((n) => n.id === dragId)
            if (from === -1) return list.some((n) => n.children && move(n.children!))
            const [n] = list.splice(from, 1)
            if (beforeId === null) {
              list.push(n)
            } else {
              const to = list.findIndex((x) => x.id === beforeId)
              if (to === -1) {
                list.push(n)
                return false
              }
              list.splice(to, 0, n)
            }
            return true
          }
          move(s.nodes)
        },
        true,
      )
    },
    [mutateScene, currentSceneId],
  )

  const addScene = useCallback(() => {
    record((d) => {
      const s: Scene = { id: uid(), name: `Scene ${d.scenes.length + 1}`, width: scene.width, height: scene.height, background: scene.background, nodes: [] }
      d.scenes.push(s)
      d.selectedSceneId = s.id
    })
    setSelectionIds([])
  }, [record, scene.width, scene.height, scene.background])

  const deleteScene = useCallback(
    (id: string) => {
      if (doc.scenes.length <= 1) return
      record((d) => {
        d.scenes = d.scenes.filter((s) => s.id !== id)
        if (d.selectedSceneId === id) d.selectedSceneId = d.scenes[0].id
      })
      setSelectionIds([])
    },
    [record, doc.scenes.length],
  )

  // ---- color variables ----

  const setVariables = useCallback(
    (next: ColorVariable[]) => {
      record((d) => {
        const prev = d.variables ?? []
        // When a variable's colour changes, keep every node that tracks it
        // in sync — that's the whole point of variables.
        for (const v of next) {
          const old = prev.find((p) => p.id === v.id)
          if (!old || old.color === v.color) continue
          const retint = (list: Node[]) => {
            for (const n of list) {
              if (n.fillVar === v.id && n.fill !== null) n.fill = v.color
              if (n.strokeVar === v.id && n.stroke) n.stroke = { ...n.stroke, color: v.color }
              if (n.textVar === v.id && n.text) n.text = { ...n.text, color: v.color }
              if (n.children) retint(n.children)
            }
          }
          for (const s of d.scenes) {
            if (s.backgroundVar === v.id) s.background = v.color
            retint(s.nodes)
          }
        }
        // Deleting a variable leaves colours as they are and unbinds refs.
        const kept = new Set(next.map((v) => v.id))
        const unbind = (list: Node[]) => {
          for (const n of list) {
            if (n.fillVar && !kept.has(n.fillVar)) n.fillVar = undefined
            if (n.strokeVar && !kept.has(n.strokeVar)) n.strokeVar = undefined
            if (n.textVar && !kept.has(n.textVar)) n.textVar = undefined
            if (n.children) unbind(n.children)
          }
        }
        for (const s of d.scenes) {
          if (s.backgroundVar && !kept.has(s.backgroundVar)) s.backgroundVar = undefined
          unbind(s.nodes)
        }
        d.variables = next
      })
    },
    [record],
  )

  const createVariable = useCallback(
    (v: ColorVariable) => {
      record((d) => {
        d.variables = [...(d.variables ?? []), v]
      })
    },
    [record],
  )

  const variableUsage = useCallback(
    (varId: string): number => {
      let count = 0
      const walk = (list: Node[]) => {
        for (const n of list) {
          if (n.fillVar === varId || n.strokeVar === varId || n.textVar === varId) count++
          if (n.children) walk(n.children)
        }
      }
      for (const s of doc.scenes) {
        if (s.backgroundVar === varId) count++
        walk(s.nodes)
      }
      return count
    },
    [doc],
  )

  // ---- icon + frame insertion ----

  const insertIcon = useCallback(
    (icon: IconDef) => {
      const el = document.querySelector('.canvas-wrap') as HTMLElement | null
      const size = 32
      // centre of the visible canvas, in scene coordinates
      let wx = scene.width / 2 - size / 2
      let wy = scene.height / 2 - size / 2
      if (el) {
        const { width: vw, height: vh } = el.getBoundingClientRect()
        wx = (vw / 2 - viewport.panX) / viewport.zoom - size / 2
        wy = (vh / 2 - viewport.panY) / viewport.zoom - size / 2
      }
      const n: Node = {
        id: uid(),
        name: icon.name
          .split('-')
          .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
          .join(' '),
        type: 'icon',
        x: round1(wx),
        y: round1(wy),
        width: size,
        height: size,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        fill: null,
        stroke: null,
        icon: { svg: icon.svg, color: '#ffffff' },
        effects: [],
      }
      addNode(n)
      setSelectionIds([n.id])
    },
    [addNode, scene.width, scene.height, viewport],
  )

  const insertFrame = useCallback(
    (w: number, h: number, label: string) => {
      const el = document.querySelector('.canvas-wrap') as HTMLElement | null
      let wx = 64
      let wy = 64
      if (el) {
        const { width: vw, height: vh } = el.getBoundingClientRect()
        wx = (vw / 2 - viewport.panX) / viewport.zoom - w / 2
        wy = (vh / 2 - viewport.panY) / viewport.zoom - h / 2
      }
      const n: Node = {
        id: uid(),
        name: label,
        type: 'frame',
        x: round1(wx),
        y: round1(wy),
        width: w,
        height: h,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        fill: '#1d1d1d',
        stroke: null,
        cornerRadius: 0,
        children: [],
        effects: [],
      }
      addNode(n)
      setSelectionIds([n.id])
    },
    [addNode, viewport],
  )

  // ---- export / import ----
  const exportShear = useCallback(() => {
    const data = { ...docRef.current, updatedAt: new Date().toISOString() }
    downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `${slug(data.name)}.shear`)
    toast('Saved .shear file')
  }, [toast])

  const doExportScene = useCallback(
    async (sceneId: string, format: SceneFormat) => {
      const s = docRef.current.scenes.find((x) => x.id === sceneId)
      if (!s) throw new Error('scene not found')
      if (format === 'shear') {
        exportShear()
        setExportOpen(false)
        return
      }
      if (format === 'react') {
        downloadBlob(new Blob([sceneToReact(s)], { type: 'text/plain' }), `${slug(s.name)}.tsx`)
      } else {
        const blob =
          format === 'png' ? await exportScenePNG(s, 2) : format === 'svg' ? await exportSceneSVG(s) : await exportSceneHTML(s)
        downloadBlob(blob, `${slug(s.name)}.${format}`)
      }
      setExportOpen(false)
      toast(`${format === 'react' ? 'React component' : format.toUpperCase()} exported`)
    },
    [toast, exportShear],
  )

  // ---- work together ----
  const startSession = useCallback(async () => {
    sessionStorage.setItem('shear.name', myName.trim() || 'Designer')
    setStarting(true)
    try {
      const s = await createSession(docRef.current)
      setSession(s)
      toast('Session started')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not start session')
    } finally {
      setStarting(false)
    }
  }, [toast, myName])

  const endSession = useCallback(() => {
    setSession(null)
    setShareOpen(false)
    toast('Left the session')
  }, [toast])

  const broadcastPointer = useCallback(
    (p: { x: number; y: number }) => {
      if (!live) return
      collab.sendPresence({ x: p.x, y: p.y, sceneId: currentSceneId, selection: selectionId })
    },
    [live, collab, currentSceneId, selectionId],
  )

  const importJSON = useCallback(
    async (file: File) => {
      try {
        const parsed = JSON.parse(await file.text()) as Partial<Document>
        if (!Array.isArray(parsed.scenes) || parsed.scenes.length === 0) throw new Error('not a Shear file')
        const d: Document = {
          version: 1,
          app: 'shear',
          id: parsed.id || uid(),
          name: parsed.name || file.name.replace(/\.(shear|json)$/, '') || 'Untitled',
          updatedAt: new Date().toISOString(),
          selectedSceneId: parsed.selectedSceneId && parsed.scenes.some((s) => s.id === parsed.selectedSceneId) ? parsed.selectedSceneId : parsed.scenes[0].id,
          scenes: parsed.scenes,
          variables: parsed.variables,
        }
        past.current = []
        future.current = []
        setDoc(d)
        setSelectionIds([])
        dirty.current = true
        toast('Imported')
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Import failed')
      }
    },
    [toast],
  )

  // ---- keyboard shortcuts ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const inField = !!target.closest('input,textarea,select,[contenteditable]')
      const meta = e.metaKey || e.ctrlKey

      if (e.key === 'Escape') {
        if (playing) setPlaying(false)
        else if (shareOpen) setShareOpen(false)
        else if (editingId) closeTextEdit()
        else if (exportOpen) setExportOpen(false)
        else setSelectionIds([])
        return
      }
      if (inField) return

      if (meta && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if (meta && e.key === 'y') {
        e.preventDefault()
        redo()
        return
      }
      if (meta && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault()
        if (selectionIds.length > 0) duplicateNode(selectionIds[selectionIds.length - 1])
        return
      }
      if (meta && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault()
        setExportOpen(true)
        return
      }
      if (meta && e.shiftKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault()
        setPlaying(true)
        return
      }
      if (meta && !e.shiftKey && e.key === '0') {
        e.preventDefault()
        zoomReset()
        return
      }
      if (meta && e.key === '1') {
        e.preventDefault()
        fit()
        return
      }
      if (!meta) {
        switch (e.key.toLowerCase()) {
          case 'v':
            setTool('select')
            return
          case 'h':
            setTool('hand')
            return
          case 'f':
            setTool('frame')
            return
          case 'r':
            setTool('rect')
            return
          case 'o':
            setTool('ellipse')
            return
          case 'l':
            setTool('line')
            return
          case 't':
            setTool('text')
            return
        }
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectionIds.length > 0) {
        e.preventDefault()
        deleteSelection()
        return
      }
      if (e.key.startsWith('Arrow') && selectionIds.length > 0) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        mutateScene(
          currentSceneId,
          (s) => {
            for (const id of selectionIds) {
              const n = findAny(s.nodes, id)
              if (n && !n.locked) {
                n.x = round1(n.x + dx)
                n.y = round1(n.y + dy)
              }
            }
          },
          true,
        )
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId, exportOpen, playing, shareOpen, selectionIds, undo, redo, duplicateNode, deleteSelection, mutateScene, currentSceneId, closeTextEdit])

  // canvas node mutation: live (unrecorded) writes mark the gesture as touched
  const canvasMutate = useCallback(
    (fn: (nodes: Node[]) => void, recordHistory: boolean) => {
      if (recordHistory) {
        mutateScene(currentSceneId, (s) => fn(s.nodes), true)
      } else {
        markGestureTouched()
        mutateScene(currentSceneId, (s) => fn(s.nodes), false)
      }
    },
    [mutateScene, currentSceneId],
  )

  // ---- timeline clock ----
  useEffect(() => {
    if (!timelinePlaying) return
    const dur = Math.max(sceneDuration(scene.nodes), 0.1)
    const loops = sceneLoops(scene.nodes)
    let frame = 0
    const started = performance.now() - time * 1000
    const tick = () => {
      const t = (performance.now() - started) / 1000
      if (t >= dur && !loops) {
        setTime(dur)
        setTimelinePlaying(false)
        return
      }
      setTime(loops ? t % dur : t)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
    // `time` seeds the clock but must not restart it every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timelinePlaying, scene.nodes])

  timeRef.current = time

  const displayScene = useMemo(
    () => (time > 0 ? { ...scene, nodes: resolveNodes(scene.nodes, time) } : scene),
    [scene, time],
  )

  const fit = useCallback(() => {
    const el = document.querySelector('.canvas-wrap') as HTMLElement | null
    if (!el) return
    const { width: vw, height: vh } = el.getBoundingClientRect()
    const pad = 72
    const zoom = clamp(Math.min((vw - pad * 2) / scene.width, (vh - pad * 2) / scene.height), 0.05, 4)
    setViewport({ zoom, panX: (vw - scene.width * zoom) / 2, panY: (vh - scene.height * zoom) / 2 })
  }, [scene.width, scene.height])

  const zoomReset = useCallback(() => {
    const el = document.querySelector('.canvas-wrap') as HTMLElement | null
    if (!el) return
    const { width: vw, height: vh } = el.getBoundingClientRect()
    const cx = vw / 2
    const cy = vh / 2
    setViewport((vp) => {
      const wx = (cx - vp.panX) / vp.zoom
      const wy = (cy - vp.panY) / vp.zoom
      return { zoom: 1, panX: cx - wx, panY: cy - wy }
    })
  }, [])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-ink-800">
        <div className="h-4 w-4 animate-pulse rounded-full bg-neutral-600" />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-ink-800 font-sans text-neutral-200 antialiased select-none">
      <TopBar
        docName={doc.name}
        onRename={(name) => apply((d) => (d.name = name))}
        savedAt={savedAt}
        tool={tool}
        onTool={setTool}
        onInsertFrame={insertFrame}
        onUndo={undo}
        onRedo={redo}
        canUndo={past.current.length > 0 && historyTick >= 0}
        canRedo={future.current.length > 0 && historyTick >= 0}
        onImport={importJSON}
        onExport={() => setExportOpen(true)}
        onPlay={() => setPlaying(true)}
        onShare={() => setShareOpen(true)}
        onHome={onHome}
        peers={collab.peers}
        self={collab.self}
        live={live}
      />

      <div className="flex min-h-0 flex-1">
        <LeftPanel
          scene={scene}
          selectedId={selectionId}
          onSelect={(id) => setSelectionIds(id ? [id] : [])}
          onRenameNode={(id, name) => updateNode(id, { name })}
          onToggleVisible={(id) =>
            updateNode(id, { visible: !findAny(scene.nodes, id)?.visible })
          }
          onToggleLock={(id) => updateNode(id, { locked: !findAny(scene.nodes, id)?.locked })}
          onReorder={reorderNode}
          scenes={doc.scenes}
          activeSceneId={currentSceneId}
          onSelectScene={(id) => {
            if (editingId) closeTextEdit()
            apply((d) => (d.selectedSceneId = id))
            setSelectionIds([])
          }}
          onAddScene={addScene}
          onRenameScene={(id, name) =>
            apply((d) => {
              const s = d.scenes.find((x) => x.id === id)
              if (s) s.name = name
            })
          }
          onDeleteScene={deleteScene}
          variables={variables}
          onVariables={setVariables}
          variableUsage={variableUsage}
          onInsertIcon={insertIcon}
        />

        <main className="relative min-w-0 flex-1">
          <div className="canvas-wrap absolute inset-0">
            <CanvasView
              scene={displayScene}
              tool={tool}
              selectionIds={selectionIds}
              editingId={editingId}
              viewport={viewport}
              onViewport={setViewport}
              select={setSelectionIds}
              mutate={canvasMutate}
              gestureBegin={gestureBegin}
              gestureEnd={gestureEnd}
              addNode={addNode}
              startTextEdit={startTextEdit}
              liveTextEdit={liveTextEdit}
              commitTextEdit={commitTextEdit}
              onToolDone={() => setTool('select')}
              onFit={fit}
              onDuplicate={duplicateNode}
              onDelete={deleteNode}
              peers={collab.peers}
              onPointer={broadcastPointer}
            />
          </div>
        </main>

        <RightPanel
          node={selectedNode}
          multiCount={selectionIds.length}
          scene={scene}
          variables={variables}
          onCreateVariable={createVariable}
          onUpdateNode={updateNode}
          onUpdateText={updateText}
          onUpdateScene={updateSceneProps}
          onDuplicate={duplicateNode}
          onDelete={deleteNode}
          onDeleteMany={deleteSelection}
          onSelect={() => setSelectionIds([])}
          time={time}
          playing={timelinePlaying}
          onTime={setTime}
          onPlaying={setTimelinePlaying}
        />
      </div>

      <ExportModal
        open={exportOpen}
        scenes={doc.scenes}
        defaultSceneId={currentSceneId}
        onClose={() => setExportOpen(false)}
        onExport={doExportScene}
      />

      <PreviewOverlay scene={scene} open={playing} onClose={() => setPlaying(false)} />

      <ShareSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        url={session?.url ?? null}
        starting={starting}
        peers={collab.peers}
        self={collab.self}
        name={myName}
        onName={setMyName}
        onStart={startSession}
        onEnd={endSession}
      />
      <Toasts toasts={toasts} />
    </div>
  )
}

function emptyDocument(): Document {
  const sceneId = uid()
  return {
    version: 1,
    app: 'shear',
    id: uid(),
    name: 'Untitled',
    updatedAt: new Date().toISOString(),
    selectedSceneId: sceneId,
    scenes: [{ id: sceneId, name: 'Scene 1', width: 1440, height: 900, background: '#171717', nodes: [] }],
  }
}
