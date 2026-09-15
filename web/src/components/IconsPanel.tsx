import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import type { IconDef } from '../icons/library'

const SET_LABEL: Record<string, string> = {
  all: 'All',
  lucide: 'Lucide',
  'heroicons-outline': 'Heroicons',
  'heroicons-solid': 'Heroicons · solid',
}

const PAGE = 360

/**
 * The icon library: every glyph ships with the app (Lucide + Heroicons),
 * searchable, one click drops the icon onto the canvas as a tintable
 * vector object.
 */
export function IconsPanel({ onInsert }: { onInsert: (icon: IconDef) => void }) {
  const [query, setQuery] = useState('')
  const [set, setSet] = useState<string>('all')
  const [limit, setLimit] = useState(PAGE)
  // the library ships in its own chunk and loads when this tab opens
  const [icons, setIcons] = useState<IconDef[] | null>(null)

  useEffect(() => {
    let cancelled = false
    void import('../icons/library').then((m) => {
      if (!cancelled) setIcons(m.ICONS)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const results = useMemo(() => {
    if (!icons) return []
    const q = query.trim().toLowerCase()
    return icons.filter((i) => {
      if (set !== 'all' && i.set !== set) return false
      if (!q) return true
      return i.name.includes(q) || i.set.includes(q)
    })
  }, [icons, query, set])

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-1.5 px-2.5 pb-2 pt-2.5">
        <div className="flex h-7 items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 transition-colors focus-within:border-white/30">
          <Search size={11} strokeWidth={2} className="shrink-0 text-neutral-500" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setLimit(PAGE)
            }}
            placeholder={icons ? `Search ${icons.length.toLocaleString()} icons` : "Loading icon library…"}
            spellCheck={false}
            className="w-full bg-transparent text-[11px] text-neutral-200 outline-none placeholder:text-neutral-600"
          />
        </div>
        <div className="flex gap-0.5 rounded-md border border-white/10 bg-white/5 p-0.5">
          {Object.entries(SET_LABEL).map(([id, label]) => (
            <button
              key={id}
              onClick={() => {
                setSet(id)
                setLimit(PAGE)
              }}
              className={`flex-1 rounded px-1 py-0.5 text-[9.5px] transition-colors ${
                set === id ? 'bg-white text-neutral-900' : 'text-neutral-500 hover:text-neutral-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid flex-1 auto-rows-min grid-cols-5 gap-1 overflow-y-auto px-2.5 pb-2">
        {results.slice(0, limit).map((i) => (
          <button
            key={`${i.set}/${i.name}`}
            title={`${i.name} · ${i.set}`}
            onClick={() => onInsert(i)}
            className="flex aspect-square items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-100"
          >
            <span
              className="pointer-events-none [&>svg]:h-[18px] [&>svg]:w-[18px]"
              dangerouslySetInnerHTML={{ __html: i.svg }}
            />
          </button>
        ))}
      </div>

      <div className="border-t border-white/5 px-2.5 py-1.5 text-center">
        {results.length > limit ? (
          <button
            onClick={() => setLimit((l) => l + PAGE)}
            className="text-[10px] text-neutral-500 transition-colors hover:text-neutral-200"
          >
            Show more ({results.length - limit} left)
          </button>
        ) : (
          <span className="text-[10px] text-neutral-600">
            {results.length === 0 ? 'No icons match' : `${results.length} icon${results.length === 1 ? '' : 's'}`}
          </span>
        )}
      </div>
    </div>
  )
}
