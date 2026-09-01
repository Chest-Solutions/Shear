import { AnimatePresence, motion } from 'framer-motion'

export interface ToastItem {
  id: number
  message: string
}

export function Toasts({ toasts }: { toasts: ToastItem[] }) {
  return (
    <div className="pointer-events-none fixed left-1/2 top-12 z-50 -translate-x-1/2">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, filter: 'blur(6px)', y: -8, scale: 0.96 }}
            animate={{ opacity: 1, filter: 'blur(0px)', y: 0, scale: 1 }}
            exit={{ opacity: 0, filter: 'blur(6px)', y: -6, scale: 0.97 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="mb-2 rounded-lg bg-neutral-100 px-3 py-1.5 text-[12px] font-medium text-neutral-900 shadow-panel"
          >
            {t.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
