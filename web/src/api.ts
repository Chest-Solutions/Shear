import type { Document, Scene } from './types'

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = res.statusText
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) msg = body.error
    } catch {
      /* ignore */
    }
    throw new Error(msg)
  }
  return (await res.json()) as T
}

export async function listDocuments(): Promise<{ id: string; name: string; updatedAt: string }[]> {
  const res = await fetch('/api/documents')
  return json(res)
}

export async function getDocument(id: string): Promise<Document> {
  const res = await fetch(`/api/documents/${id}`)
  return json(res)
}

export async function saveDocument(doc: Document): Promise<{ updatedAt: string }> {
  const res = await fetch(`/api/documents/${doc.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(doc),
  })
  return json(res)
}

/** Render a single scene to a PNG via the Go backend. */
export async function exportScenePNG(scene: Scene, scale = 2): Promise<Blob> {
  const res = await fetch('/api/export/png', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scene, scale }),
  })
  if (!res.ok) {
    let msg = 'export failed'
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) msg = body.error
    } catch {
      /* ignore */
    }
    throw new Error(msg)
  }
  return res.blob()
}

/** Render a scene to a standalone SVG document (vector, in Go). */
export async function exportSceneSVG(scene: Scene): Promise<Blob> {
  const res = await fetch('/api/export/svg', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scene }),
  })
  if (!res.ok) throw new Error('SVG export failed')
  return res.blob()
}

/** Render a scene to a self-contained HTML page, animations included. */
export async function exportSceneHTML(scene: Scene): Promise<Blob> {
  const res = await fetch('/api/export/html', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scene }),
  })
  if (!res.ok) throw new Error('HTML export failed')
  return res.blob()
}
