/** Tiny TSX syntax highlighter for the Code tab — no dependencies. */

const TOKEN =
  /(\/\/[^\n]*)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)|\b(import|from|export|default|function|return|const|let|var|new|true|false|null|undefined|Infinity|if|else|for|of|type|interface)\b|(\b\d+(?:\.\d+)?\b)|(<\/?[A-Za-z][\w.]*)/g

const COLORS = [
  'text-neutral-500 italic', // comment
  'text-emerald-300', // string
  'text-sky-300', // keyword
  'text-amber-300', // number
  'text-fuchsia-300', // jsx tag
]

export function highlightTSX(code: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  let last = 0
  let key = 0
  let m: RegExpExecArray | null
  TOKEN.lastIndex = 0
  while ((m = TOKEN.exec(code))) {
    if (m.index > last) out.push(<span key={key++} className="text-neutral-300">{code.slice(last, m.index)}</span>)
    const gi = m.slice(1).findIndex((g) => g !== undefined)
    out.push(
      <span key={key++} className={COLORS[gi]}>
        {m[0]}
      </span>,
    )
    last = m.index + m[0].length
  }
  if (last < code.length) out.push(<span key={key++} className="text-neutral-300">{code.slice(last)}</span>)
  return out
}
