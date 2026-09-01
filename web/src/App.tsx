import { useCallback, useEffect, useRef, useState } from 'react'
import type { Document, Node, Scene, Tool } from './types'
import { uid, clone, slug, downloadBlob, clamp, round1 } from './utils'
import { exportScenePNG, getDocument, listDocuments, saveDocument } from './api'
import { TopBar } from './components/TopBar'
import { Toolbar } from './components/Toolbar'
import { LeftPanel } from './components/LeftPanel'
import { RightPanel } from './components/RightPanel'
import { CanvasView, findAny } from './components/CanvasView'
import { ExportModal } from './components/ExportModal'
import { Toasts, type ToastItem } from './components/Toast'
import type { Viewport } from './render'

const HISTORY_LIMIT = 80

function newDocument(): Document {
  const sceneId = uid()
  return {
    version: 1,
    app: 'shear',
    id: uid(),
    name: 'Untitled',
    updatedAt: new Date().toISOString(),
    selectedSceneId: sceneId,
    scenes: [
      { id: sceneId, name: 'Scene 1', width: 1440, height: 900, background: '#171717', nodes: [] },
    ],
  }
}

export default function App() {
  const [doc, setDoc] = useState<Document>(() => newDocument())
  const [loading, setLoading] = useState(true)
  const [selectionId, setSelectionId] = useState<string | null>(null)
  const [tool, setTool] = useState<Tool>('select')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [viewport, setViewport] = useState<Viewport>({ zoom: 1, panX: 0, panY: 0 })
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [exportOpen, setExportOpen] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  const past = useRef<Document[]>([])
  const future = useRef<Document[]>([])
  const gestureSnapshot = useRef<Document | null>(null)
  const gestureTouched = useRef(false)
  const dirty = useRef(false)
  const toastSeq = useRef(0)
  const lastHistoryPush = useRef(0)
  const docRef = useRef(doc)
  docRef.current = doc

  const scene = doc.scenes.find((s) => s.id === doc.selectedSceneId) ?? doc.scenes[0]
  const currentSceneId = scene.id
  const selectedNode = selectionId ? findAny(scene.nodes, selectionId) : null

  const toast = useCallback((message: string) => {
    const id = ++toastSeq.current
    setToasts((ts) => [...ts.slice(-2), { id, message }])
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 2200)
  }, [])

  // ---- initial load: restore the most recent document from the Go backend ----
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const list = await listDocuments()
        if (list.length > 0) {
          const latest = list[0]
          const d = await getDocument(latest.id)
          if (!cancelled) {
            setDoc(d)
            setSelectionId(null)
          }
        }
      } catch {
        /* first run — stay with the fresh document */
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // ---- autosave (debounced) ----
  useEffect(() => {
    if (loading || !dirty.current) return
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
  }, [doc, loading])

  // ---- history ----
  // Rapid successive edits (slider drags, typing in a name) coalesce into a
  // single undo step.
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
    }
    gestureSnapshot.current = null
    gestureTouched.current = false
    lastHistoryPush.current = 0
  }, [])

  // mark the gesture dirty from the canvas's live-mutation callback
  const markGestureTouched = () => {
    gestureTouched.current = true
  }

  const mutateScene = useCallback(
    (sceneId: string, fn: (s: Scene) => void, recordHistory: boolean) => {
      const doIt = (d: Document) => {
        const s = d.scenes.find((x) => x.id === sceneId)
        if (s) fn(s)
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
    setSelectionId(null)
    dirty.current = true
  }, [])

  const redo = useCallback(() => {
    const next = future.current.pop()
    if (!next) return
    past.current.push(docRef.current)
    setDoc(next)
    setSelectionId(null)
    dirty.current = true
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
      setSelectionId(null)
    },
    [mutateScene, currentSceneId],
  )

  const duplicateNode = useCallback(
    (id: string) => {
      const newIds = new Map<string, string>()
      const assignNewIds = (n: Node): Node => {
        const cp = clone(n)
        newIds.set(n.id, cp.id = uid())
        cp.name = n.name + ' copy'
        cp.x = round1(n.x + 16)
        cp.y = round1(n.y + 16)
        if (cp.children) cp.children = cp.children.map(assignNewIds)
        return cp
      }
      let newId: string | null = null
      mutateScene(
        currentSceneId,
        (s) => {
          const src = findAny(s.nodes, id)
          if (!src) return
          const cp = assignNewIds(src)
          newId = cp.id
          const insert = (list: Node[]): boolean => {
            for (let i = 0; i < list.length; i++) {
              if (list[i].id === id) {
                list.splice(i + 1, 0, cp)
                return true
              }
              if (list[i].children && insert(list[i].children!)) return true
            }
            return false
          }
          insert(s.nodes)
        },
        true,
      )
      if (newId) setSelectionId(newId)
    },
    [mutateScene, currentSceneId],
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
    setSelectionId(null)
  }, [record, scene.width, scene.height, scene.background])

  const deleteScene = useCallback(
    (id: string) => {
      if (doc.scenes.length <= 1) return
      record((d) => {
        d.scenes = d.scenes.filter((s) => s.id !== id)
        if (d.selectedSceneId === id) d.selectedSceneId = d.scenes[0].id
      })
      setSelectionId(null)
    },
    [record, doc.scenes.length],
  )

  // ---- export / import ----
  const exportJSON = useCallback(() => {
    const data = { ...docRef.current, updatedAt: new Date().toISOString() }
    downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `${slug(data.name)}.shear.json`)
    toast('JSON exported')
  }, [toast])

  const doExportPNG = useCallback(
    async (sceneId: string) => {
      const s = docRef.current.scenes.find((x) => x.id === sceneId)
      if (!s) throw new Error('scene not found')
      const blob = await exportScenePNG(s, 2)
      downloadBlob(blob, `${slug(s.name)}.png`)
      setExportOpen(false)
      toast('PNG exported')
    },
    [toast],
  )

  const importJSON = useCallback(
    async (file: File) => {
      try {
        const parsed = JSON.parse(await file.text()) as Partial<Document>
        if (!Array.isArray(parsed.scenes) || parsed.scenes.length === 0) throw new Error('not a Shear document')
        const d: Document = {
          version: 1,
          app: 'shear',
          id: parsed.id || uid(),
          name: parsed.name || file.name.replace(/\.json$/, '') || 'Untitled',
          updatedAt: new Date().toISOString(),
          selectedSceneId: parsed.selectedSceneId && parsed.scenes.some((s) => s.id === parsed.selectedSceneId) ? parsed.selectedSceneId : parsed.scenes[0].id,
          scenes: parsed.scenes,
        }
        past.current = []
        future.current = []
        setDoc(d)
        setSelectionId(null)
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
        if (editingId) closeTextEdit()
        else if (exportOpen) setExportOpen(false)
        else setSelectionId(null)
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
        if (selectionId) duplicateNode(selectionId)
        return
      }
      if (meta && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault()
        exportJSON()
        return
      }
      if (!meta) {
        switch (e.key.toLowerCase()) {
          case 'v':
            setTool('select')
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
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectionId) {
        e.preventDefault()
        deleteNode(selectionId)
        return
      }
      if (e.key.startsWith('Arrow') && selectionId) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        mutateScene(
          currentSceneId,
          (s) => {
            const n = findAny(s.nodes, selectionId)
            if (n && !n.locked) {
              n.x = round1(n.x + dx)
              n.y = round1(n.y + dy)
            }
          },
          true,
        )
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editingId, exportOpen, selectionId, undo, redo, duplicateNode, deleteNode, exportJSON, mutateScene, currentSceneId, closeTextEdit])

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

  const fit = useCallback(() => {
    const el = document.querySelector('.canvas-wrap') as HTMLElement | null
    if (!el) return
    const { width: vw, height: vh } = el.getBoundingClientRect()
    const pad = 72
    const zoom = clamp(Math.min((vw - pad * 2) / scene.width, (vh - pad * 2) / scene.height), 0.05, 4)
    setViewport({ zoom, panX: (vw - scene.width * zoom) / 2, panY: (vh - scene.height * zoom) / 2 })
  }, [scene.width, scene.height])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-neutral-800">
        <div className="h-4 w-4 animate-pulse rounded-full bg-neutral-600" />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-neutral-800 font-sans text-neutral-200 antialiased select-none">
      <TopBar
        docName={doc.name}
        onRename={(name) => apply((d) => (d.name = name))}
        savedAt={savedAt}
        onImport={importJSON}
        onExportJSON={exportJSON}
        onExportPNG={() => setExportOpen(true)}
      />

      <div className="flex min-h-0 flex-1">
        <LeftPanel
          scene={scene}
          selectedId={selectionId}
          onSelect={(id) => setSelectionId(id)}
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
            setSelectionId(null)
          }}
          onAddScene={addScene}
          onRenameScene={(id, name) =>
            apply((d) => {
              const s = d.scenes.find((x) => x.id === id)
              if (s) s.name = name
            })
          }
          onDeleteScene={deleteScene}
        />

        <main className="relative min-w-0 flex-1">
          <div className="canvas-wrap absolute inset-0">
            <CanvasView
              scene={scene}
              tool={tool}
              selectionId={selectionId}
              editingId={editingId}
              viewport={viewport}
              onViewport={setViewport}
              select={setSelectionId}
              mutate={canvasMutate}
              gestureBegin={gestureBegin}
              gestureEnd={gestureEnd}
              addNode={addNode}
              startTextEdit={startTextEdit}
              liveTextEdit={liveTextEdit}
              commitTextEdit={commitTextEdit}
              onToolDone={() => setTool('select')}
              onFit={fit}
            />
          </div>
          <Toolbar tool={tool} onTool={setTool} />
        </main>

        <RightPanel
          node={selectedNode}
          scene={scene}
          onUpdateNode={updateNode}
          onUpdateText={updateText}
          onUpdateScene={updateSceneProps}
          onDuplicate={duplicateNode}
          onDelete={deleteNode}
          onSelect={() => setSelectionId(null)}
        />
      </div>

      <ExportModal
        open={exportOpen}
        scenes={doc.scenes}
        defaultSceneId={currentSceneId}
        onClose={() => setExportOpen(false)}
        onExport={doExportPNG}
      />
      <Toasts toasts={toasts} />
    </div>
  )
}
