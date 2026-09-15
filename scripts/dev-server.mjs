#!/usr/bin/env node
/**
 * Local mirror of the Go backend used ONLY for frontend development and
 * preview environments where the Go toolchain isn't available. It
 * implements the same routes with the same semantics:
 *
 *   - document CRUD (persisted as JSON on disk)
 *   - live sessions: one SSE stream per peer + JSON posts
 *   - SPA static hosting of web/dist with the /join/<id> fallback
 *
 * Scene rendering lives in Go, so /api/export/* answers 501 here and the
 * editor's client-side exporters take over.
 */
import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, readdir, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(import.meta.url), '..', '..')
const distDir = process.env.SHEAR_DIST ?? join(root, 'web', 'dist')
const dataDir = process.env.SHEAR_DATA ?? join(root, 'data')
const addr = process.env.SHEAR_ADDR ?? '0.0.0.0:8080'
const [host, port] = addr.split(':')

mkdirSync(dataDir, { recursive: true })

const id = (p) => p + '_' + randomBytes(6).toString('hex')

// ---------------------------------------------------------------- store
const docs = new Map()
for (const f of readdirSync(dataDir)) {
  if (!f.endsWith('.json')) continue
  try {
    const d = JSON.parse(readFileSync(join(dataDir, f), 'utf8'))
    if (d.id) docs.set(d.id, d)
  } catch {
    /* skip corrupt */
  }
}
function putDoc(d) {
  d.updatedAt = new Date().toISOString()
  docs.set(d.id, d)
  const tmp = join(dataDir, d.id + '.json.tmp')
  writeFileSync(tmp, JSON.stringify(d, null, 2))
  renameSync(tmp, join(dataDir, d.id + '.json'))
}

// ---------------------------------------------------------------- hub
/** @type {Map<string, {id:string,name:string,doc:any,peers:Map<string,any>,rev:number,createdAt:number}>} */
const sessions = new Map()

function json(res, status, body) {
  const b = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(b)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let out = ''
    req.on('data', (c) => {
      out += c
      if (out.length > 20 * 1024 * 1024) reject(new Error('body too large'))
    })
    req.on('end', () => resolve(out))
    req.on('error', reject)
  })
}

function broadcast(sess, except, event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const [pid, p] of sess.peers) {
    if (pid === except) continue
    try {
      p.res.write(payload)
    } catch {
      /* gone */
    }
  }
}

// drop peers we haven't heard from in 45s, rooms empty for 2min
setInterval(() => {
  const now = Date.now()
  for (const [sid, s] of sessions) {
    for (const [pid, p] of s.peers) {
      if (now - p.seenAt > 45000) {
        try {
          p.res.end()
        } catch {
          /* gone */
        }
        s.peers.delete(pid)
      }
    }
    if (s.peers.size === 0 && now - s.createdAt > 120000) sessions.delete(sid)
  }
}, 30000).unref()

// ---------------------------------------------------------------- http
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  const p = url.pathname

  try {
    // ---- api ----
    if (p === '/api/health') return json(res, 200, { ok: true, app: 'shear-dev', version: 1 })

    if (p === '/api/documents' && req.method === 'GET') {
      const list = [...docs.values()]
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
        .map((d) => ({ id: d.id, name: d.name, updatedAt: d.updatedAt, scenes: d.scenes?.length ?? 0 }))
      return json(res, 200, list)
    }

    let m = p.match(/^\/api\/documents\/([\w-]+)$/)
    if (m) {
      const did = m[1]
      if (req.method === 'GET') {
        const d = docs.get(did)
        return d ? json(res, 200, d) : json(res, 404, { error: 'document not found' })
      }
      if (req.method === 'PUT') {
        const d = JSON.parse(await readBody(req))
        if (!d.scenes?.length) return json(res, 400, { error: 'document has no scenes' })
        d.id = did
        d.version = 1
        d.app = 'shear'
        putDoc(d)
        return json(res, 200, { ok: true, id: did, updatedAt: d.updatedAt })
      }
      if (req.method === 'DELETE') {
        if (!docs.has(did)) return json(res, 404, { error: 'document not found' })
        docs.delete(did)
        try {
          rmSync(join(dataDir, did + '.json'))
        } catch {
          /* fine */
        }
        return json(res, 200, { ok: true })
      }
    }

    if (p.startsWith('/api/export/')) {
      // rendering lives in the Go backend; the editor falls back to its
      // own exporters on 501
      return json(res, 501, { error: 'export rendering is unavailable in the dev mirror' })
    }

    if (p === '/api/sessions' && req.method === 'POST') {
      const reqBody = JSON.parse(await readBody(req))
      const doc = reqBody.document
      if (!doc?.scenes?.length) return json(res, 400, { error: 'document has no scenes' })
      const sess = { id: id('s'), name: doc.name, doc, peers: new Map(), rev: 0, createdAt: Date.now() }
      sessions.set(sess.id, sess)
      return json(res, 200, { id: sess.id, url: `/join/${sess.id}`, name: sess.name })
    }

    m = p.match(/^\/api\/sessions\/([\w-]+)$/)
    if (m && req.method === 'GET') {
      const s = sessions.get(m[1])
      return s ? json(res, 200, { id: s.id, name: s.doc.name, peers: s.peers.size }) : json(res, 404, { error: 'session not found or ended' })
    }

    m = p.match(/^\/api\/sessions\/([\w-]+)\/events$/)
    if (m && req.method === 'GET') {
      const s = sessions.get(m[1])
      if (!s) return json(res, 404, { error: 'session not found or ended' })
      const pid = url.searchParams.get('peer') || id('p')
      const name = (url.searchParams.get('name') || '').trim() || 'Designer'
      const old = s.peers.get(pid)
      const peer = {
        id: pid,
        name: old && (!name || name.startsWith('Designer')) ? old.name : name,
        color: old?.color ?? peerColor(s.peers.size),
        x: 0,
        y: 0,
        sceneId: url.searchParams.get('scene') ?? '',
        selection: '',
        active: true,
        res,
        seenAt: Date.now(),
      }
      s.peers.set(pid, peer)

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      })
      const peerList = [...s.peers.values()].map(stripPeer)
      broadcast(s, pid, 'peers', peerList)
      res.write(`event: hello\ndata: ${JSON.stringify({ peer: stripPeer(peer), document: s.doc, rev: s.rev, peers: peerList })}\n\n`)

      const ping = setInterval(() => {
        try {
          res.write(': ping\n\n')
        } catch {
          /* gone */
        }
      }, 15000)
      req.on('close', () => {
        clearInterval(ping)
        if (s.peers.get(pid) === peer) {
          s.peers.delete(pid)
          broadcast(s, pid, 'peers', [...s.peers.values()].map(stripPeer))
        }
      })
      return
    }

    m = p.match(/^\/api\/sessions\/([\w-]+)\/presence$/)
    if (m && req.method === 'POST') {
      const s = sessions.get(m[1])
      if (!s) return json(res, 404, { error: 'session not found or ended' })
      const b = JSON.parse(await readBody(req))
      const peer = s.peers.get(b.peer)
      if (!peer) return json(res, 409, { error: 'unknown peer — reconnect' })
      if (b.x >= 0 || b.y >= 0) {
        peer.x = b.x
        peer.y = b.y
        peer.sceneId = b.sceneId
        peer.selection = b.selection
        peer.active = b.active
        broadcast(s, peer.id, 'presence', stripPeer(peer))
      }
      if (b.name) peer.name = b.name
      peer.seenAt = Date.now()
      res.writeHead(204)
      return res.end()
    }

    m = p.match(/^\/api\/sessions\/([\w-]+)\/document$/)
    if (m && req.method === 'POST') {
      const s = sessions.get(m[1])
      if (!s) return json(res, 404, { error: 'session not found or ended' })
      const b = JSON.parse(await readBody(req))
      if (!b.document?.scenes?.length) return json(res, 400, { error: 'document has no scenes' })
      s.doc = b.document
      s.rev++
      const peer = s.peers.get(b.peer)
      if (peer) peer.seenAt = Date.now()
      broadcast(s, b.peer, 'document', { document: s.doc, rev: s.rev, from: b.peer })
      return json(res, 200, { rev: s.rev })
    }

    if (p.startsWith('/api/')) return json(res, 404, { error: 'not found' })

    // ---- static + SPA fallback ----
    const full = join(distDir, normalize(p.replace(/^\/+/, '')))
    if (p !== '/' && existsSync(full) && statSync(full).isFile()) {
      res.writeHead(200, { 'Content-Type': MIME[extname(full)] ?? 'application/octet-stream' })
      return res.end(readFileSync(full))
    }
    if (!existsSync(join(distDir, 'index.html'))) {
      res.writeHead(503, { 'Content-Type': 'text/plain' })
      return res.end('frontend not built — run: cd web && npm run build')
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' })
    res.end(readFileSync(join(distDir, 'index.html')))
  } catch (e) {
    json(res, 400, { error: String(e?.message ?? e) })
  }
})

function stripPeer(p) {
  return { id: p.id, name: p.name, color: p.color, x: p.x, y: p.y, sceneId: p.sceneId, selection: p.selection, active: p.active }
}

const peerColors = ['#7AA2F7', '#F7768E', '#9ECE6A', '#E0AF68', '#BB9AF7', '#7DCFFF', '#F5A97F', '#A6DA95']
function peerColor(i) {
  return peerColors[i % peerColors.length]
}

server.listen(Number(port), host || '0.0.0.0', () => {
  console.log(`Shear dev mirror listening on ${host}:${port} — data: ${dataDir}, web: ${distDir}`)
})
