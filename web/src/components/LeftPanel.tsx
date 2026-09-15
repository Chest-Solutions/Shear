import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowUpRight,
  Box,
  Circle,
  Hexagon,
  Lock,
  LockOpen,
  Minus,
  Square,
  Star,
  Triangle,
  Type,
  Eye,
  EyeOff,
  Plus,
  Sparkles,
  Layers,
} from 'lucide-react'
import type { ColorVariable, Node, Scene } from '../types'
import type { IconDef } from '../icons/library'
import { IconsPanel } from './IconsPanel'
import { ColorsPanel } from './ColorsPanel'

function typeIcon(n: Node): React.ReactNode {
  switch (n.type) {
    case 'frame':
      return <Box size={12} strokeWidth={1.8} />
    case 'rect':
      return <Square size={12} strokeWidth={1.8} />
    case 'ellipse':
      return <Circle size={12} strokeWidth={1.8} />
    case 'line':
      return n.arrow ? <ArrowUpRight size={12} strokeWidth={1.8} /> : <Minus size={12} strokeWidth={1.8} />
    case 'poly':
      return n.poly?.kind === 'star' ? (
        <Star size={12} strokeWidth={1.8} />
      ) : n.poly?.kind === 'polygon' ? (
        <Hexagon size={12} strokeWidth={1.8} />
      ) : (
        <Triangle size={12} strokeWidth={1.8} />
      )
    case 'text':
      return <Type size={12} strokeWidth={1.8} />
    case 'icon':
      return <Sparkles size={12} strokeWidth={1.8} />
  }
}

export type LeftTab =
  | 'layers'
  | 'components'
  | 'styles'
  | 'variables'
  | 'icons'
  | 'photos'
  | 'illustrations'
  | 'templates'

type Tab = LeftTab

interface Props {
  tab: Tab
  onTab: (t: Tab) => void
  open: boolean
  onOpen: (v: boolean) => void
  scene: Scene
  selectedId: string | null
  onSelect: (id: string | null) => void
  onRenameNode: (id: string, name: string) => void
  onToggleVisible: (id: string) => void
  onToggleLock: (id: string) => void
  onReorder: (dragId: string, beforeId: string | null) => void
  scenes: Scene[]
  activeSceneId: string
  onSelectScene: (id: string) => void
  onAddScene: () => void
  onRenameScene: (id: string, name: string) => void
  onDeleteScene: (id: string) => void
  /** arms the cursor stamp — click the canvas to place the icon */
  onPickIcon: (icon: IconDef) => void
  stampArmed: boolean
  variables: ColorVariable[]
  onVariables: (v: ColorVariable[]) => void
  variableUsage: (id: string) => number
  onCreateVariable: (v: ColorVariable) => void
}

export function LeftPanel(props: Props) {
  const { scene } = props
  const [renaming, setRenaming] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropBefore, setDropBefore] = useState<string | null | 'end'>(null)
  const [query, setQuery] = useState('')

  // front-most first, like Lunacy: the top row renders above everything
  const displayNodes = [...scene.nodes].reverse().filter((n) => !query || n.name.toLowerCase().includes(query.toLowerCase()))

  // a visual "drop above X" means "in front of X" = after X in array order
  const visualBeforeToArrayBefore = (xId: string | null): string | null => {
    if (xId === 'end') return scene.nodes[0]?.id ?? null // bottom of list = back-most
    if (xId === null) return null
    const i = scene.nodes.findIndex((n) => n.id === xId)
    if (i === -1) return null
    return i + 1 < scene.nodes.length ? scene.nodes[i + 1].id : null
  }

  const layerRows = (nodes: Node[], depth: number) =>
    nodes.map((n) => (
      <div key={n.id}>
        <LayerRow
          node={n}
          depth={depth}
          selected={props.selectedId === n.id}
          renaming={renaming === n.id}
          onSelect={() => props.onSelect(n.id)}
          onStartRename={() => setRenaming(n.id)}
          onCommitRename={(name) => {
            props.onRenameNode(n.id, name)
            setRenaming(null)
          }}
          onToggleVisible={() => props.onToggleVisible(n.id)}
          onToggleLock={() => props.onToggleLock(n.id)}
          draggable={depth === 0}
          dragActive={dragId === n.id}
          dropBefore={dragId && dragId !== n.id ? dropBefore === n.id : false}
          onDragStart={() => setDragId(n.id)}
          onDragEnd={() => {
            setDragId(null)
            setDropBefore(null)
          }}
          onDragOver={(before) => {
            if (dragId && dragId !== n.id) setDropBefore(before ? n.id : null)
          }}
          onDrop={() => {
            if (dragId && dragId !== n.id) props.onReorder(dragId, visualBeforeToArrayBefore(n.id))
            setDragId(null)
            setDropBefore(null)
          }}
        />
        {n.children && <div>{layerRows(n.children, depth + 1)}</div>}
      </div>
    ))

  const clickTab = (t: Tab) => {
    if (props.open && props.tab === t) props.onOpen(false)
    else {
      props.onTab(t)
      props.onOpen(true)
    }
  }

  return (
    <>
      {/* icon rail — Lunacy's labelled content tabs */}
      <div className="absolute inset-y-0 left-0 z-10 flex w-[74px] flex-col items-stretch gap-1 border-r border-white/5 bg-ink-925 py-2">
        <TabBtn active={props.open && props.tab === 'layers'} onClick={() => clickTab('layers')} title="Layer list (Alt+1)" label="Layers">
          <Layers size={16} strokeWidth={1.6} />
        </TabBtn>
        <TabBtn active={props.open && props.tab === 'components'} onClick={() => clickTab('components')} title="Components" label="Components">
          <Box size={16} strokeWidth={1.6} />
        </TabBtn>
        <TabBtn active={props.open && props.tab === 'styles'} onClick={() => clickTab('styles')} title="Styles" label="Styles">
          <SwatchIcon />
        </TabBtn>
        <TabBtn active={props.open && props.tab === 'variables'} onClick={() => clickTab('variables')} title="Color variables" label="Variables">
          <XIcon />
        </TabBtn>
        <TabBtn active={props.open && props.tab === 'icons'} onClick={() => clickTab('icons')} title="Built-in icons (Alt+2)" label="Icons">
          <Sparkles size={16} strokeWidth={1.6} />
        </TabBtn>
        <TabBtn active={props.open && props.tab === 'photos'} onClick={() => clickTab('photos')} title="Photos" label="Photos">
          <ImageIcon />
        </TabBtn>
        <TabBtn active={props.open && props.tab === 'illustrations'} onClick={() => clickTab('illustrations')} title="Illustrations" label="Illustrations">
          <SmileIcon />
        </TabBtn>
        <TabBtn active={props.open && props.tab === 'templates'} onClick={() => clickTab('templates')} title="Templates" label="Templates">
          <GridIcon />
        </TabBtn>
      </div>

      {props.open && (
      <div className="absolute inset-y-0 left-[74px] z-10 flex w-60 flex-col border-r border-white/5 bg-ink-850">
        {props.tab === 'icons' ? (
          <div className="min-h-0 flex-1">
            <IconsPanel onInsert={props.onPickIcon} armed={props.stampArmed} />
          </div>
        ) : props.tab === 'variables' ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ColorsPanel variables={props.variables} onChange={props.onVariables} usage={props.variableUsage} />
          </div>
        ) : props.tab !== 'layers' ? (
          <EmptyTab label={props.tab} />
        ) : (
          <>
            {/* page selector on top, like Lunacy */}
            <div className="flex items-center gap-1 border-b border-white/5 px-2 py-2">
              <select
                value={props.activeSceneId}
                onChange={(e) => props.onSelectScene(e.target.value)}
                className="h-7 min-w-0 flex-1 rounded-md border border-white/10 bg-white/5 px-2 text-[11px] text-neutral-200 outline-none [&>option]:bg-ink-900"
              >
                {props.scenes.map((sc) => (
                  <option key={sc.id} value={sc.id}>{sc.name}</option>
                ))}
              </select>
              <button
                onClick={props.onAddScene}
                title="Add page"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-100"
              >
                <Plus size={13} strokeWidth={2} />
              </button>
            </div>

            <div className="flex items-center justify-between gap-2 px-3 pb-1 pt-3">
              <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-neutral-500">Layers</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search"
                className="h-6 w-24 rounded-md border border-white/10 bg-white/5 px-2 text-[10px] text-neutral-300 outline-none placeholder:text-neutral-600 focus:border-white/25"
              />
            </div>
            <div className="flex-1 overflow-y-auto px-1.5 pb-2">
              {scene.nodes.length === 0 ? (
                <p className="px-1.5 py-3 text-[11px] leading-relaxed text-neutral-600">
                  Pick a tool and draw on the canvas. Click an icon in the Icons tab to place it with your cursor.
                </p>
              ) : (
                <>{layerRows(displayNodes, 0)}</>
              )}
              {dragId && (
                <div
                  className="mx-1.5 mt-0.5 h-4 rounded"
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDropBefore('end')
                  }}
                  onDrop={() => {
                    if (dragId) props.onReorder(dragId, visualBeforeToArrayBefore('end'))
                    setDragId(null)
                    setDropBefore(null)
                  }}
                >
                  {dropBefore === 'end' && <div className="h-px w-full rounded bg-white/60" />}
                </div>
              )}
            </div>
          </>
        )}
      </div>
      )}
    </>
  )
}

function TabBtn({ active, onClick, title, label, children }: { active: boolean; onClick: () => void; title: string; label: string; children: React.ReactNode }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`mx-1.5 flex h-12 flex-col items-center justify-center gap-1 rounded-lg transition-colors ${
        active ? 'bg-sky-500/15 text-sky-400' : 'text-neutral-500 hover:text-neutral-300'
      }`}
    >
      {children}
      <span className={`text-[8px] leading-none ${active ? 'text-sky-400' : 'text-neutral-600'}`}>{label}</span>
    </button>
  )
}

function LayerRow(props: {
  node: Node
  depth: number
  selected: boolean
  renaming: boolean
  dragActive: boolean
  dropBefore: boolean
  draggable: boolean
  onSelect: () => void
  onStartRename: () => void
  onCommitRename: (name: string) => void
  onToggleVisible: () => void
  onToggleLock: () => void
  onDragStart: () => void
  onDragEnd: () => void
  onDragOver: (before: boolean) => void
  onDrop: () => void
}) {
  const n = props.node
  const [name, setName] = useState(n.name)

  return (
    <motion.div
      layout
      initial={false}
      className="group relative"
      draggable={props.draggable && !n.locked}
      onDragStart={props.onDragStart}
      onDragEnd={props.onDragEnd}
      onDragOver={(e) => {
        if (!props.draggable) return
        e.preventDefault()
        const rect = e.currentTarget.getBoundingClientRect()
        props.onDragOver(e.clientY < rect.top + rect.height / 2)
      }}
      onDrop={(e) => {
        e.preventDefault()
        props.onDrop()
      }}
    >
      {props.dropBefore && <div className="absolute -top-px left-2 right-2 h-px rounded bg-white/70" />}
      <div
        onClick={props.onSelect}
        onDoubleClick={props.onStartRename}
        className={`flex h-7 cursor-default items-center gap-1.5 rounded-md pr-1 transition-colors ${
          props.selected ? 'bg-white/10 text-neutral-100' : 'text-neutral-400 hover:bg-white/5 hover:text-neutral-200'
        } ${props.dragActive ? 'opacity-40' : ''}`}
        style={{ paddingLeft: 6 + props.depth * 12 }}
      >
        <span className={n.visible ? '' : 'opacity-40'}>{typeIcon(n)}</span>
        {props.renaming ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => props.onCommitRename(name.trim() || n.name)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') props.onCommitRename(name.trim() || n.name)
              if (e.key === 'Escape') props.onCommitRename(n.name)
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded bg-white/10 px-1 py-0.5 text-[12px] text-neutral-100 outline-none"
          />
        ) : (
          <span className={`truncate text-[12px] ${n.visible ? '' : 'opacity-40'}`}>{n.name}</span>
        )}
        <span className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <IconBtn
            title={n.visible ? 'Hide' : 'Show'}
            onClick={(e) => {
              e.stopPropagation()
              props.onToggleVisible()
            }}
          >
            {n.visible ? <Eye size={12} strokeWidth={1.8} /> : <EyeOff size={12} strokeWidth={1.8} />}
          </IconBtn>
          <IconBtn
            title={n.locked ? 'Unlock' : 'Lock'}
            onClick={(e) => {
              e.stopPropagation()
              props.onToggleLock()
            }}
          >
            {n.locked ? <Lock size={11} strokeWidth={1.8} /> : <LockOpen size={11} strokeWidth={1.8} />}
          </IconBtn>
        </span>
      </div>
    </motion.div>
  )
}

function IconBtn({ children, onClick, title }: { children: React.ReactNode; onClick: (e: React.MouseEvent) => void; title: string }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="flex h-5 w-5 items-center justify-center rounded text-neutral-500 transition-colors hover:bg-white/10 hover:text-neutral-100"
    >
      {children}
    </button>
  )
}

function EmptyTab({ label }: { label: string }) {
  const pretty = label.charAt(0).toUpperCase() + label.slice(1)
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
      <span className="text-[12px] font-medium text-neutral-400">{pretty}</span>
      <p className="text-[10.5px] leading-relaxed text-neutral-600">
        Nothing here yet — Shear ships Layers, Variables and Icons today; {pretty.toLowerCase()} land in a future
        release.
      </p>
    </div>
  )
}

function SwatchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M12 3l7 7-9 11-7-7z" />
      <path d="M10 6l4 4" />
    </svg>
  )
}
function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M6 4l12 16M18 4L6 20" />
    </svg>
  )
}
function ImageIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M4 18l6-6 4 4 3-3 3 3" />
    </svg>
  )
}
function SmileIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="9" />
      <path d="M9 10h.01M15 10h.01M8.5 14a4.5 4.5 0 0 0 7 0" />
    </svg>
  )
}
function GridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="4" y="4" width="7" height="7" rx="1" />
      <rect x="13" y="4" width="7" height="7" rx="1" />
      <rect x="4" y="13" width="7" height="7" rx="1" />
      <rect x="13" y="13" width="7" height="7" rx="1" />
    </svg>
  )
}
