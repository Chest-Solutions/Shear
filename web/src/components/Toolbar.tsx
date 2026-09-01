import { motion } from 'framer-motion'
import { MousePointer2, Square, Circle, Minus, Type } from 'lucide-react'
import type { Tool } from '../types'

const TOOLS: { id: Tool; icon: React.ReactNode; label: string; key: string }[] = [
  { id: 'select', icon: <MousePointer2 size={15} strokeWidth={1.8} />, label: 'Select', key: 'V' },
  { id: 'rect', icon: <Square size={15} strokeWidth={1.8} />, label: 'Rectangle', key: 'R' },
  { id: 'ellipse', icon: <Circle size={15} strokeWidth={1.8} />, label: 'Ellipse', key: 'O' },
  { id: 'line', icon: <Minus size={15} strokeWidth={1.8} />, label: 'Line', key: 'L' },
  { id: 'text', icon: <Type size={15} strokeWidth={1.8} />, label: 'Text', key: 'T' },
]

export function Toolbar({ tool, onTool }: { tool: Tool; onTool: (t: Tool) => void }) {
  return (
    <div className="pointer-events-none absolute left-3 top-1/2 z-20 -translate-y-1/2">
      <div className="pointer-events-auto flex flex-col gap-1 rounded-xl border border-white/5 bg-neutral-900/70 p-1 shadow-panel backdrop-blur-xl">
        {TOOLS.map((t) => {
          const active = tool === t.id
          return (
            <motion.button
              key={t.id}
              title={`${t.label}  (${t.key})`}
              whileTap={{ scale: 0.9 }}
              onClick={() => onTool(t.id)}
              className={`relative flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                active ? 'text-neutral-900' : 'text-neutral-400 hover:bg-white/10 hover:text-neutral-100'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="tool-active"
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute inset-0 rounded-lg bg-white"
                />
              )}
              <span className="relative">{t.icon}</span>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
