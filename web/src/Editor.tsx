import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ColorVariable, Document, LineVariant, Node, RectVariant, Scene, SceneFormat, Tool } from './types'
import { uid, clone, slug, downloadBlob, clamp, round1, makeNode, defaultCornerRadii } from './utils'
import { exportSceneHTML, exportScenePNG, exportSceneSVG, getDocument, saveDocument } from './api'
import { sceneToReact } from './exporters'
import { resolveNodes, sceneDuration, sceneLoops, syncTree } from './anim'
import { AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignHorizontalSpaceBetween, AlignStartHorizontal, AlignStartVertical, AlignVerticalSpaceBetween, ChevronsDown, ChevronsUp, FlipHorizontal2, FlipVertical2 } from 'lucide-react'
import { TopBar, PresencePill } from './components/TopBar'
import { VerticalToolbar } from './components/VerticalToolbar'
import { TimelineBar } from './components/TimelineBar'
import { reactProjectZip } from './reactProject'
import { LeftPanel, type LeftTab } from './components/LeftPanel'
import { RightPanel } from './components/RightPanel'
import { CanvasView, findAny } from './components/CanvasView'
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
  const [rectVar, setRectVar] = useState<RectVariant>('rect')
  const [lineVar, setLineVar] = useState<LineVariant>('line')
  const [ovalVar, setOvalVar] = useState<'ellipse' | 'triangle' | 'polygon' | 'star'>('ellipse')
  const [animMode, setAnimMode] = useState(false)
  const [stamp, setStamp] = useState<{ svg: string; color: string; name: string } | null>(null)
  const [leftTab, setLeftTab] = useState<LeftTab>('layers')
  const [rightTab, setRightTab] = useState<'design' | 'export' | 'code'>('design')
  const [leftOpen, setLeftOpen] = useState(true)
  const [lockAspect, setLockAspect] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [viewport, setViewport] = useState<Viewport>({ zoom: 1, panX: 0, panY: 0 })
  const [toasts, setToasts] = useState<ToastItem[]>([])
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

  // ---- icon stamp, drawn shapes, alignment ----

  const pickIcon = useCallback((icon: IconDef) => {
    setStamp({ svg: icon.svg, color: '#ffffff', name: icon.name })
  }, [])

  const placeStamp = useCallback(
    (wx: number, wy: number) => {
      if (!stamp) return
      const size = 32
      const n: Node = {
        id: uid(),
        name: stamp.name
          .split('-')
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(' '),
        type: 'icon',
        x: round1(wx - size / 2),
        y: round1(wy - size / 2),
        width: size,
        height: size,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        fill: null,
        stroke: null,
        icon: { svg: stamp.svg, color: stamp.color },
        effects: [],
      }
      addNode(n)
      setSelectionIds([n.id])
      setStamp(null)
    },
    [stamp, addNode],
  )

  const variantName = (label: string): string => {
    let max = 0
    const re = new RegExp(`^${label} (\\d+)$`)
    const walk = (list: Node[]) => {
      for (const n of list) {
        const m = re.exec(n.name)
        if (m) max = Math.max(max, Number(m[1]))
        if (n.children) walk(n.children)
      }
    }
    walk(scene.nodes)
    return `${label} ${max + 1}`
  }

  /** CanvasView reports the drawn box; the editor applies shape variants. */
  const createDrawn = useCallback(
    (kind: 'rect' | 'ellipse' | 'line', x0: number, y0: number, x1: number, y1: number) => {
      let n: Node
      if (kind === 'line') {
        n = makeNode('line', 0, 0, 1, 1)
        let dx = x1 - x0
        let dy = y1 - y0
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
          dx = 120
          dy = 0
          x1 = x0 + dx
          y1 = y0 + dy
        }
        n.x = Math.min(x0, x1)
        n.y = Math.min(y0, y1)
        n.width = Math.abs(x1 - x0)
        n.height = Math.abs(y1 - y0)
        n.flip = (x1 - x0) * (y1 - y0) < 0
        if (lineVar === 'arrow') n.name = variantName('Arrow')
      } else if (kind === 'rect') {
        n = makeNode('rect', Math.min(x0, x1), Math.min(y0, y1), Math.max(1, Math.abs(x1 - x0)), Math.max(1, Math.abs(y1 - y0)))
        if (rectVar === 'rounded') {
          n.cornerRadius = 12
          n.cornerRadii = defaultCornerRadii(12)
          n.name = variantName('Rounded rectangle')
        }
      } else if (ovalVar === 'ellipse') {
        n = makeNode('ellipse', Math.min(x0, x1), Math.min(y0, y1), Math.max(1, Math.abs(x1 - x0)), Math.max(1, Math.abs(y1 - y0)))
      } else {
        n = makeNode('poly', Math.min(x0, x1), Math.min(y0, y1), Math.max(1, Math.abs(x1 - x0)), Math.max(1, Math.abs(y1 - y0)))
        n.poly = { kind: ovalVar === 'polygon' ? 'polygon' : ovalVar, sides: ovalVar === 'polygon' ? 6 : undefined }
        n.name = variantName(ovalVar === 'triangle' ? 'Triangle' : ovalVar === 'polygon' ? 'Polygon' : 'Star')
      }
      addNode(n)
      setSelectionIds([n.id])
    },
    [addNode, lineVar, rectVar, ovalVar, scene.nodes],
  )

  const selNodes = useCallback(
    (nodes: Node[]) => selectionIds.map((id) => findAny(nodes, id)).filter((n): n is Node => !!n && !n.locked),
    [selectionIds],
  )

  const alignSelection = useCallback(
    (mode: 'left' | 'centerH' | 'right' | 'top' | 'midV' | 'bottom') => {
      mutateScene(currentSceneId, (sc) => {
        const ns = selNodes(sc.nodes)
        if (ns.length === 0) return
        let bx0 = 0, by0 = 0, bx1 = sc.width, by1 = sc.height
        if (ns.length > 1) {
          bx0 = Math.min(...ns.map((n) => n.x))
          by0 = Math.min(...ns.map((n) => n.y))
          bx1 = Math.max(...ns.map((n) => n.x + n.width))
          by1 = Math.max(...ns.map((n) => n.y + n.height))
        }
        for (const n of ns) {
          if (mode === 'left') n.x = round1(bx0)
          if (mode === 'right') n.x = round1(bx1 - n.width)
          if (mode === 'centerH') n.x = round1(bx0 + (bx1 - bx0 - n.width) / 2)
          if (mode === 'top') n.y = round1(by0)
          if (mode === 'bottom') n.y = round1(by1 - n.height)
          if (mode === 'midV') n.y = round1(by0 + (by1 - by0 - n.height) / 2)
        }
      }, true)
    },
    [mutateScene, currentSceneId, selNodes],
  )

  const distributeSelection = useCallback(
    (mode: 'h' | 'v') => {
      mutateScene(currentSceneId, (sc) => {
        const ns = selNodes(sc.nodes)
        if (ns.length < 3) return
        const sorted = [...ns].sort((a, b) => (mode === 'h' ? a.x - b.x : a.y - b.y))
        const first = sorted[0]
        const last = sorted[sorted.length - 1]
        const span = mode === 'h' ? last.x + last.width - first.x : last.y + last.height - first.y
        const item = sorted.reduce((acc, n) => acc + (mode === 'h' ? n.width : n.height), 0)
        const gap = (span - item) / (sorted.length - 1)
        let cursor = mode === 'h' ? first.x + first.width : first.y + first.height
        for (let i = 1; i < sorted.length - 1; i++) {
          const n = sorted[i]
          if (mode === 'h') n.x = round1(cursor + gap)
          else n.y = round1(cursor + gap)
          cursor = (mode === 'h' ? n.x + n.width : n.y + n.height)
        }
      }, true)
    },
    [mutateScene, currentSceneId, selNodes],
  )

  const flipSelection = useCallback(
    (mode: 'h' | 'v') => {
      mutateScene(currentSceneId, (sc) => {
        const ns = selNodes(sc.nodes)
        if (ns.length === 0) return
        if (ns.length === 1 && ns[0].type === 'line') {
          ns[0].flip = !ns[0].flip
          return
        }
        const bx0 = ns.length > 1 ? Math.min(...ns.map((n) => n.x)) : 0
        const by0 = ns.length > 1 ? Math.min(...ns.map((n) => n.y)) : 0
        const bx1 = ns.length > 1 ? Math.max(...ns.map((n) => n.x + n.width)) : sc.width
        const by1 = ns.length > 1 ? Math.max(...ns.map((n) => n.y + n.height)) : sc.height
        for (const n of ns) {
          if (mode === 'h') n.x = round1(bx1 - (n.x - bx0) - n.width)
          else n.y = round1(by1 - (n.y - by0) - n.height)
        }
      }, true)
    },
    [mutateScene, currentSceneId, selNodes],
  )

  const zoomBy = useCallback((factor: number) => {
    const el = document.querySelector('.canvas-wrap') as HTMLElement | null
    if (!el) return
    const { width: vw, height: vh } = el.getBoundingClientRect()
    const cx = vw / 2
    const cy = vh / 2
    setViewport((vp) => {
      const zoom = clamp(vp.zoom * factor, 0.05, 4)
      const wx = (cx - vp.panX) / vp.zoom
      const wy = (cy - vp.panY) / vp.zoom
      return { zoom, panX: cx - wx * zoom, panY: cy - wy * zoom }
    })
  }, [])

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
        return
      }
      if (format === 'react') {
        downloadBlob(new Blob([sceneToReact(s)], { type: 'text/plain' }), `${slug(s.name)}.tsx`)
      } else {
        const blob =
          format === 'png' ? await exportScenePNG(s, 2) : format === 'svg' ? await exportSceneSVG(s) : await exportSceneHTML(s)
        downloadBlob(blob, `${slug(s.name)}.${format}`)
      }
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
        else if (stamp) setStamp(null)
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
        setRightTab('export')
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
      if (e.altKey && e.key === '1') {
        setLeftTab('layers')
        setLeftOpen(true)
        return
      }
      if (e.altKey && e.key === '2') {
        setLeftTab('icons')
        setLeftOpen(true)
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
          case 'r':
            if (tool === 'rect') setRectVar((v) => (v === 'rect' ? 'rounded' : 'rect'))
            setTool('rect')
            return
          case 'l':
            if (tool === 'line') setLineVar((v) => (v === 'line' ? 'arrow' : 'line'))
            setTool('line')
            return
          case 'o':
            if (tool === 'ellipse') setOvalVar((v) => (v === 'ellipse' ? 'triangle' : v === 'triangle' ? 'polygon' : 'ellipse'))
            setTool('ellipse')
            return
          case 't':
            setTool('text')
            return
          case 'x':
            setLeftTab('icons')
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
  }, [editingId, playing, shareOpen, stamp, tool, selectionIds, undo, redo, duplicateNode, deleteSelection, mutateScene, currentSceneId, closeTextEdit])

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

  const selBBox = useMemo(() => {
    if (selectionIds.length === 0) return null
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const id of selectionIds) {
      const n = findAny(scene.nodes, id)
      if (!n) continue
      x0 = Math.min(x0, n.x)
      y0 = Math.min(y0, n.y)
      x1 = Math.max(x1, n.x + n.width)
      y1 = Math.max(y1, n.y + n.height)
    }
    if (x0 === Infinity) return null
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
  }, [selectionIds, scene])


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
        onUndo={undo}
        onRedo={redo}
        canUndo={past.current.length > 0 && historyTick >= 0}
        canRedo={future.current.length > 0 && historyTick >= 0}
        onImport={importJSON}
        onPlay={() => setPlaying(true)}
        onAnimMode={() => setAnimMode((v) => !v)}
        animMode={animMode}
        onHome={onHome}
        zoom={viewport.zoom}
        onZoomIn={() => zoomBy(1.2)}
        onZoomOut={() => zoomBy(1 / 1.2)}
        onZoomReset={zoomReset}
        onFit={fit}
      />

      <div className="relative min-h-0 flex-1">
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
            stamp={stamp ? { svg: stamp.svg, color: stamp.color } : null}
            onPlaceStamp={placeStamp}
            createDrawn={createDrawn}
            lockAspect={lockAspect}
          />
        </div>

        <LeftPanel
          tab={leftTab}
          onTab={setLeftTab}
          open={leftOpen}
          onOpen={setLeftOpen}
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
              const sc = d.scenes.find((x) => x.id === id)
              if (sc) sc.name = name
            })
          }
          onDeleteScene={deleteScene}
          onPickIcon={pickIcon}
          stampArmed={!!stamp}
          variables={variables}
          onVariables={setVariables}
          variableUsage={variableUsage}
          onCreateVariable={createVariable}
        />

        <VerticalToolbar
          tool={tool}
          rectVar={rectVar}
          lineVar={lineVar}
          ovalVar={ovalVar}
          onRect={(v) => { setRectVar(v); setTool('rect') }}
          onLine={(v) => { setLineVar(v); setTool('line') }}
          onOval={(v) => { setOvalVar(v); setTool('ellipse') }}
          onTool={setTool}
          left={leftOpen ? 52 + 240 + 12 : 52 + 12}
        />

        {selBBox && tool === 'select' && !stamp && (
          <ContextToolbar
            bbox={selBBox}
            viewport={viewport}
            count={selectionIds.length}
            onAlign={alignSelection}
            onDistribute={distributeSelection}
            onFlip={flipSelection}
            onToFront={() => selectionIds.forEach((id) => reorderNode(id, null))}
            onToBack={() =>
              selectionIds.forEach((id) => {
                const first = scene.nodes.find((n) => n.id !== id)
                reorderNode(id, first?.id ?? null)
              })
            }
          />
        )}

        <div className="pointer-events-none absolute top-3 z-20" style={{ right: 272 + 12 + 10 }}>
          <PresencePill peers={collab.peers} self={collab.self} live={live} onShare={() => setShareOpen(true)} />
        </div>

        <RightPanel
          tab={rightTab}
          onTab={setRightTab}
          node={selectedNode}
          multiCount={selectionIds.length}
          scene={scene}
          variables={variables}
          onCreateVariable={createVariable}
          onVariables={setVariables}
          variableUsage={variableUsage}
          onUpdateNode={updateNode}
          onUpdateText={updateText}
          onUpdateScene={updateSceneProps}
          onFlipH={() => flipSelection('h')}
          onFlipV={() => flipSelection('v')}
          onAlign={alignSelection}
          onDistribute={distributeSelection}
          lockAspect={lockAspect}
          onLockAspect={setLockAspect}
          onExportScene={(fmt) => void doExportScene(currentSceneId, fmt)}
          onExportShear={exportShear}
          onExportProject={() => {
            downloadBlob(reactProjectZip(scene), `${slug(doc.name)}-react-project.zip`)
          }}
        />

        {animMode && (
          <TimelineBar
            node={selectedNode}
            time={time}
            playing={timelinePlaying}
            onTime={setTime}
            onPlaying={setTimelinePlaying}
            onTimeline={(id, tl) => updateNode(id, { timeline: tl })}
            onClose={() => setAnimMode(false)}
          />
        )}
      </div>
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

// ---- Lunacy-style floating context toolbar above the selection ----

function ContextToolbar(props: {
  bbox: { x: number; y: number; w: number; h: number }
  viewport: { zoom: number; panX: number; panY: number }
  count: number
  onAlign: (m: 'left' | 'centerH' | 'right' | 'top' | 'midV' | 'bottom') => void
  onDistribute: (m: 'h' | 'v') => void
  onFlip: (m: 'h' | 'v') => void
  onToFront: () => void
  onToBack: () => void
}) {
  const vp = props.viewport
  const left = vp.panX + props.bbox.x * vp.zoom + (props.bbox.w * vp.zoom) / 2
  const top = Math.max(8, vp.panY + props.bbox.y * vp.zoom - 42)
  return (
    <div
      className="absolute z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border border-white/10 bg-ink-900/90 p-1 shadow-panel backdrop-blur-xl"
      style={{ left, top }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <CtxBtn title="Align left edges" onClick={() => props.onAlign('left')}><AlignStartVertical size={13} strokeWidth={1.8} /></CtxBtn>
      <CtxBtn title="Align horizontal centers" onClick={() => props.onAlign('centerH')}><AlignCenterVertical size={13} strokeWidth={1.8} /></CtxBtn>
      <CtxBtn title="Align right edges" onClick={() => props.onAlign('right')}><AlignEndVertical size={13} strokeWidth={1.8} /></CtxBtn>
      <CtxBtn title="Align top edges" onClick={() => props.onAlign('top')}><AlignStartHorizontal size={13} strokeWidth={1.8} /></CtxBtn>
      <CtxBtn title="Align vertical centers" onClick={() => props.onAlign('midV')}><AlignCenterHorizontal size={13} strokeWidth={1.8} /></CtxBtn>
      <CtxBtn title="Align bottom edges" onClick={() => props.onAlign('bottom')}><AlignEndHorizontal size={13} strokeWidth={1.8} /></CtxBtn>
      {props.count > 2 && (
        <>
          <span className="mx-0.5 h-4 w-px bg-white/10" />
          <CtxBtn title="Distribute horizontally" onClick={() => props.onDistribute('h')}><AlignHorizontalSpaceBetween size={13} strokeWidth={1.8} /></CtxBtn>
          <CtxBtn title="Distribute vertically" onClick={() => props.onDistribute('v')}><AlignVerticalSpaceBetween size={13} strokeWidth={1.8} /></CtxBtn>
        </>
      )}
      <span className="mx-0.5 h-4 w-px bg-white/10" />
      <CtxBtn title="Flip horizontal" onClick={() => props.onFlip('h')}><FlipHorizontal2 size={13} strokeWidth={1.8} /></CtxBtn>
      <CtxBtn title="Flip vertical" onClick={() => props.onFlip('v')}><FlipVertical2 size={13} strokeWidth={1.8} /></CtxBtn>
      {props.count === 1 && (
        <>
          <span className="mx-0.5 h-4 w-px bg-white/10" />
          <CtxBtn title="Bring to front" onClick={props.onToFront}><ChevronsUp size={13} strokeWidth={1.8} /></CtxBtn>
          <CtxBtn title="Send to back" onClick={props.onToBack}><ChevronsDown size={13} strokeWidth={1.8} /></CtxBtn>
        </>
      )}
    </div>
  )
}

function CtxBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="flex h-6 w-6 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-100"
    >
      {children}
    </button>
  )
}
