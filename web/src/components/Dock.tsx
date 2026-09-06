import { useRef } from 'react'
import { PanelLeftClose, PanelRightClose } from 'lucide-react'

interface Props {
  side: 'left' | 'right'
  width: number
  min?: number
  max?: number
  onWidth: (w: number) => void
  onClose: () => void
  children: React.ReactNode
}

/** Resizable, closeable editor chrome (layers / inspector). */
export function Dock({ side, width, min = 72, max = 1600, onWidth, onClose, children }: Props) {
  const dragging = useRef(false)

  const onDown = (e: React.PointerEvent) => {
    e.preventDefault()
    dragging.current = true
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    const startX = e.clientX
    const startW = width
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      const next = side === 'left' ? startW + dx : startW - dx
      onWidth(Math.min(max, Math.max(min, next)))
    }
    const up = () => {
      dragging.current = false
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <aside
      className="relative flex shrink-0 flex-col border-white/5 bg-neutral-900/60 backdrop-blur-xl"
      style={{ width, borderRightWidth: side === 'left' ? 1 : 0, borderLeftWidth: side === 'right' ? 1 : 0 }}
    >
      <button
        title="Close panel"
        onClick={onClose}
        className="absolute right-1.5 top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded text-neutral-600 transition-colors hover:bg-white/10 hover:text-neutral-200"
      >
        {side === 'left' ? <PanelLeftClose size={12} /> : <PanelRightClose size={12} />}
      </button>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
      <div
        onPointerDown={onDown}
        className={`absolute top-0 z-20 h-full w-1.5 cursor-ew-resize ${side === 'left' ? 'right-0' : 'left-0'}`}
        title="Drag to resize"
      />
    </aside>
  )
}
