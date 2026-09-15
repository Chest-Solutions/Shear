import type { Document, Scene } from './types'
import { sceneToHTML, sceneToPNG, sceneToSVG } from './exporters'

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

export interface DocSummary {
  id: string
  name: string
  updatedAt: string
  createdAt: string
  scenes: number
}

export async function listDocuments(): Promise<DocSummary[]> {
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

export async function deleteDocument(id: string): Promise<void> {
  const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('could not delete the document')
}

/** Render a single scene to a PNG via the Go backend. */
export async function exportScenePNG(scene: Scene, scale = 2): Promise<Blob> {
  try {
    const res = await fetch('/api/export/png', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scene, scale }),
    })
    if (res.status === 501 || res.status === 404) throw new Error('fallback')
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
  } catch (e) {
    // The editor can rasterise the scene itself; use that when the
    // backend is unreachable (or a minimal dev server is serving us).
    if (e instanceof TypeError || (e as Error).message === 'fallback') return sceneToPNG(scene, scale)
    throw e
  }
}

/** Render a scene to a standalone SVG document (vector). */
export async function exportSceneSVG(scene: Scene): Promise<Blob> {
  try {
    const res = await fetch('/api/export/svg', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scene }),
    })
    if (res.status === 501 || res.status === 404) throw new Error('fallback')
    if (!res.ok) throw new Error('SVG export failed')
    return res.blob()
  } catch (e) {
    if (e instanceof TypeError || (e as Error).message === 'fallback') {
      return new Blob([sceneToSVG(scene)], { type: 'image/svg+xml' })
    }
    throw e
  }
}

/** Render a scene to a self-contained HTML page. */
export async function exportSceneHTML(scene: Scene): Promise<Blob> {
  try {
    const res = await fetch('/api/export/html', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scene }),
    })
    if (res.status === 501 || res.status === 404) throw new Error('fallback')
    if (!res.ok) throw new Error('HTML export failed')
    return res.blob()
  } catch (e) {
    if (e instanceof TypeError || (e as Error).message === 'fallback') {
      return new Blob([sceneToHTML(scene)], { type: 'text/html' })
    }
    throw e
  }
}
