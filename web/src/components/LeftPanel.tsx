import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Box, Circle, Lock, LockOpen, Minus, Square, Type, Eye, EyeOff, Plus, X } from 'lucide-react'
import type { Node, Scene } from '../types'

const TYPE_ICON: Record<Node['type'], React.ReactNode> = {
  frame: <Box size={12} strokeWidth={1.8} />,
  rect: <Square size={12} strokeWidth={1.8} />,
  ellipse: <Circle size={12} strokeWidth={1.8} />,
  line: <Minus size={12} strokeWidth={1.8} />,
  text: <Type size={12} strokeWidth={1.8} />,
}

interface Props {
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
}

export function LeftPanel(props: Props) {
  const { scene } = props
  const [renaming, setRenaming] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropBefore, setDropBefore] = useState<string | null | 'end'>(null)

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
            if (dragId && dragId !== n.id) props.onReorder(dragId, n.id)
            setDragId(null)
            setDropBefore(null)
          }}
        />
        {n.children && (
          <div>{layerRows(n.children, depth + 1)}</div>
        )}
      </div>
    ))

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-white/5 bg-neutral-900/60 backdrop-blur-xl">
      <div className="flex items-center justify-between px-3 pb-1 pt-3">
        <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-neutral-500">Layers</span>
      </div>
      <div className="flex-1 overflow-y-auto px-1.5 pb-2">
        {scene.nodes.length === 0 ? (
          <p className="px-1.5 py-3 text-[11px] leading-relaxed text-neutral-600">
            Pick a tool and draw on the canvas.
          </p>
        ) : (
          <>{layerRows(scene.nodes, 0)}</>
        )}
        {dragId && (
          <div
            className="mx-1.5 mt-0.5 h-4 rounded"
            onDragOver={(e) => {
              e.preventDefault()
              setDropBefore('end')
            }}
            onDrop={() => {
              if (dragId) props.onReorder(dragId, null)
              setDragId(null)
              setDropBefore(null)
            }}
          >
            {dropBefore === 'end' && <div className="h-px w-full rounded bg-white/60" />}
          </div>
        )}
      </div>

      <div className="border-t border-white/5">
        <div className="flex items-center justify-between px-3 pb-1 pt-3">
          <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-neutral-500">Scenes</span>
          <button
            onClick={props.onAddScene}
            title="Add scene"
            className="flex h-5 w-5 items-center justify-center rounded text-neutral-500 transition-colors hover:bg-white/10 hover:text-neutral-100"
          >
            <Plus size={12} strokeWidth={2} />
          </button>
        </div>
        <div className="max-h-40 overflow-y-auto px-1.5 pb-2">
          <AnimatePresence initial={false}>
            {props.scenes.map((s) => (
              <SceneRow
                key={s.id}
                scene={s}
                active={s.id === props.activeSceneId}
                canDelete={props.scenes.length > 1}
                renaming={renaming === `scene:${s.id}`}
                onSelect={() => props.onSelectScene(s.id)}
                onStartRename={() => setRenaming(`scene:${s.id}`)}
                onCommitRename={(name) => {
                  props.onRenameScene(s.id, name)
                  setRenaming(null)
                }}
                onDelete={() => props.onDeleteScene(s.id)}
              />
            ))}
          </AnimatePresence>
        </div>
      </div>
    </aside>
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
        <span className={n.visible ? '' : 'opacity-40'}>{TYPE_ICON[n.type]}</span>
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

function SceneRow(props: {
  scene: Scene
  active: boolean
  canDelete: boolean
  renaming: boolean
  onSelect: () => void
  onStartRename: () => void
  onCommitRename: (name: string) => void
  onDelete: () => void
}) {
  const [name, setName] = useState(props.scene.name)
  return (
    <motion.div layout initial={false} className="relative">
      <div
        onClick={props.onSelect}
        onDoubleClick={props.onStartRename}
        className={`group flex h-7 cursor-default items-center gap-2 rounded-md px-2 transition-colors ${
          props.active ? 'bg-white/10 text-neutral-100' : 'text-neutral-400 hover:bg-white/5 hover:text-neutral-200'
        }`}
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${props.active ? 'bg-white' : 'bg-neutral-600'}`} />
        {props.renaming ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => props.onCommitRename(name.trim() || props.scene.name)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') props.onCommitRename(name.trim() || props.scene.name)
              if (e.key === 'Escape') props.onCommitRename(props.scene.name)
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded bg-white/10 px-1 py-0.5 text-[12px] text-neutral-100 outline-none"
          />
        ) : (
          <span className="truncate text-[12px]">{props.scene.name}</span>
        )}
        {props.canDelete && !props.renaming && (
          <button
            title="Delete scene"
            onClick={(e) => {
              e.stopPropagation()
              props.onDelete()
            }}
            className="ml-auto flex h-5 w-5 items-center justify-center rounded text-neutral-600 opacity-0 transition-all hover:bg-white/10 hover:text-neutral-200 group-hover:opacity-100"
          >
            <X size={11} strokeWidth={2} />
          </button>
        )}
      </div>
    </motion.div>
  )
}
