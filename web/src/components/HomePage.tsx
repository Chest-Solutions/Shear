import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Clock, Copy, FilePlus, FolderOpen, Search, Trash2 } from 'lucide-react'
import type { Document, Scene } from '../types'
import { deleteDocument, getDocument, listDocuments, saveDocument, type DocSummary } from '../api'
import { drawScene } from '../render'
import { uid } from '../utils'
import { Logo } from './Logo'
import { Toasts, type ToastItem } from './Toast'

interface Props {
  onOpen: (id: string) => void
  onCreate: (doc: Document) => void
}

export function newDocument(): Document {
  const sceneId = uid()
  return {
    version: 1,
    app: 'shear',
    id: uid(),
    name: 'Untitled',
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    selectedSceneId: sceneId,
    scenes: [{ id: sceneId, name: 'Scene 1', width: 1440, height: 900, background: '#171717', nodes: [] }],
  }
}

/**
 * The start page: everything you worked on recently, and one button to
 * begin something new — the same landing Figma and Lunacy give you.
 */
export function HomePage({ onOpen, onCreate }: Props) {
  const [summaries, setSummaries] = useState<DocSummary[] | null>(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<'recent' | 'az' | 'created'>('recent')
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const toastSeq = useRef(0)
  const fileRef = useRef<HTMLInputElement>(null)

  const toast = useCallback((message: string) => {
    const id = ++toastSeq.current
    setToasts((ts) => [...ts.slice(-2), { id, message }])
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 2200)
  }, [])

  const refresh = useCallback(() => {
    listDocuments()
      .then(setSummaries)
      .catch(() => setSummaries([]))
  }, [])

  useEffect(refresh, [refresh])

  const create = async () => {
    const doc = newDocument()
    try {
      await saveDocument(doc)
    } catch {
      /* offline — the editor keeps it in memory and retries autosave */
    }
    onCreate(doc)
  }

  const remove = async (id: string, name: string) => {
    setSummaries((s) => (s ? s.filter((d) => d.id !== id) : s))
    try {
      await deleteDocument(id)
      toast(`Deleted “${name}”`)
    } catch {
      toast('Could not delete')
      refresh()
    }
  }

  const duplicate = async (sum: DocSummary) => {
    try {
      const src = await getDocument(sum.id)
      const copy: Document = {
        ...JSON.parse(JSON.stringify(src)),
        id: uid(),
        name: `${src.name} copy`,
        updatedAt: new Date().toISOString(),
      }
      await saveDocument(copy)
      toast('Duplicated')
      refresh()
    } catch {
      toast('Could not duplicate')
    }
  }

  const importFile = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as Partial<Document>
      if (!Array.isArray(parsed.scenes) || parsed.scenes.length === 0) throw new Error('not a Shear file')
      const doc: Document = {
        version: 1,
        app: 'shear',
        id: uid(),
        name: parsed.name || file.name.replace(/\.(shear|json)$/, '') || 'Untitled',
        updatedAt: new Date().toISOString(),
        selectedSceneId:
          parsed.selectedSceneId && parsed.scenes.some((s) => s.id === parsed.selectedSceneId)
            ? parsed.selectedSceneId
            : parsed.scenes[0].id,
        scenes: parsed.scenes,
        variables: parsed.variables,
      }
      await saveDocument(doc)
      onCreate(doc)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Import failed')
    }
  }

  const shown = (summaries ?? [])
    .filter((d) => !query || d.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) =>
      sort === 'az' ? a.name.localeCompare(b.name) : sort === 'created' ? (a.createdAt || a.updatedAt).localeCompare(b.createdAt || b.updatedAt) : b.updatedAt.localeCompare(a.updatedAt),
    )

  return (
    <div className="flex h-full bg-ink-800 text-neutral-200 antialiased select-none">
      {/* sidebar */}
      <aside className="flex w-52 shrink-0 flex-col border-r border-white/5 bg-ink-925 px-3 py-4">
        <div className="flex items-center gap-2 px-2">
          <Logo size={16} className="text-neutral-100" />
          <span className="text-[13px] font-semibold tracking-tight text-neutral-100">Shear</span>
        </div>
        <nav className="mt-6 space-y-0.5">
          <span className="flex items-center gap-2.5 rounded-md bg-white/10 px-2.5 py-1.5 text-[12px] text-neutral-100">
            <Clock size={13} strokeWidth={1.8} /> Recent
          </span>
        </nav>
        <div className="flex-1" />
        <div className="space-y-1 border-t border-white/5 pt-3 text-[11px] text-neutral-500">
          <a className="block px-2 py-1 transition-colors hover:text-neutral-200" href="https://github.com/Chest-Solutions/Shear" target="_blank" rel="noreferrer">Documentation</a>
          <a className="block px-2 py-1 transition-colors hover:text-neutral-200" href="https://github.com/Chest-Solutions/Shear/releases" target="_blank" rel="noreferrer">What’s new?</a>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* top bar: search + sort */}
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-white/5 px-5">
          <div className="flex h-7 w-72 items-center gap-2 rounded-md border border-white/10 bg-white/5 px-2.5">
            <Search size={12} strokeWidth={2} className="text-neutral-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="w-full bg-transparent text-[12px] text-neutral-200 outline-none placeholder:text-neutral-600"
            />
          </div>
          <div className="flex-1" />
          {(['recent', 'az', 'created'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setSort(k)}
              className={`text-[11px] transition-colors ${sort === k ? 'font-semibold text-neutral-100' : 'text-neutral-500 hover:text-neutral-300'}`}
            >
              {k === 'recent' ? 'Recent' : k === 'az' ? 'A–Z' : 'Created'}
            </button>
          ))}
        </header>

        <main className="flex-1 overflow-y-auto px-5 py-5">
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
            <input
              ref={fileRef}
              type="file"
              accept=".shear,.json,application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void importFile(f)
                e.target.value = ''
              }}
            />
            <ActionCard
              icon={<FilePlus size={22} strokeWidth={1.6} className="text-sky-400" />}
              title="New Local Document"
              sub="Create a document on your computer"
              onClick={() => void create()}
            />
            <ActionCard
              icon={<FolderOpen size={22} strokeWidth={1.6} className="text-amber-400" />}
              title="Open…"
              sub="Import a .shear or .json file"
              onClick={() => fileRef.current?.click()}
            />

            <AnimatePresence initial={false}>
              {shown.map((s) => (
                <motion.div
                  key={s.id}
                  layout
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.2 }}
                  className="group relative"
                >
                  <button
                    onClick={() => onOpen(s.id)}
                    className="block w-full overflow-hidden rounded-xl border border-white/10 bg-ink-850 text-left transition-all hover:border-white/25 hover:shadow-panel"
                  >
                    <DocThumb id={s.id} />
                    <div className="px-3 py-2.5">
                      <div className="truncate text-[12.5px] font-medium text-neutral-200">{s.name}</div>
                      <div className="mt-0.5 text-[10.5px] text-neutral-600">
                        {s.scenes} scene{s.scenes === 1 ? '' : 's'} · {relTime(s.updatedAt)}
                      </div>
                    </div>
                  </button>
                  <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <CardBtn title="Duplicate" onClick={() => void duplicate(s)}>
                      <Copy size={11} strokeWidth={2} />
                    </CardBtn>
                    <CardBtn title="Delete" onClick={() => void remove(s.id, s.name)}>
                      <Trash2 size={11} strokeWidth={2} />
                    </CardBtn>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </main>
      </div>
      <Toasts toasts={toasts} />
    </div>
  )
}

function ActionCard({ icon, title, sub, onClick }: { icon: React.ReactNode; title: string; sub: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl border border-white/10 bg-ink-850 px-4 py-4 text-left transition-all hover:border-white/25 hover:bg-ink-800"
    >
      {icon}
      <span>
        <span className="block text-[12.5px] font-medium text-neutral-100">{title}</span>
        <span className="mt-0.5 block text-[10.5px] text-neutral-500">{sub}</span>
      </span>
    </button>
  )
}

function CardBtn({ children, title, onClick }: { children: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button
      title={title}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="flex h-6 w-6 items-center justify-center rounded-md border border-white/10 bg-ink-925/90 text-neutral-400 backdrop-blur transition-colors hover:bg-white/10 hover:text-neutral-100"
    >
      {children}
    </button>
  )
}

/** Renders the document's first scene as the card thumbnail. */
function DocThumb({ id }: { id: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let cancelled = false
    void getDocument(id)
      .then((doc) => {
        if (cancelled) return
        const scene: Scene | undefined = doc.scenes.find((s) => s.id === doc.selectedSceneId) ?? doc.scenes[0]
        const canvas = canvasRef.current
        if (!canvas || !scene) return
        const w = 420
        const h = 300
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.fillStyle = '#161616'
        ctx.fillRect(0, 0, w, h)
        const pad = 16
        const scale = Math.min((w - pad * 2) / scene.width, (h - pad * 2) / scene.height)
        ctx.translate((w - scene.width * scale) / 2, (h - scene.height * scale) / 2)
        ctx.scale(scale, scale)
        drawScene(ctx, scene)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [id])

  return <canvas ref={canvasRef} className="aspect-[4/3] w-full" />
}

function relTime(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const s = Math.max(0, (Date.now() - t) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`
  return new Date(t).toLocaleDateString()
}
