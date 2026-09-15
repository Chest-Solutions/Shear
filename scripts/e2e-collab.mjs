#!/usr/bin/env node
/**
 * End-to-end "work together" check against a RUNNING Shear server.
 * Speaks the exact wire protocol the browser uses: one SSE stream per
 * peer plus JSON posts. Two simulated designers join the same room and
 * must see each other's edits and cursors; one of them drops and
 * reconnects mid-session.
 *
 *   SHEAR_BASE=http://127.0.0.1:8090 node scripts/e2e-collab.mjs
 *
 * Exits 0 when every step passes.
 */

const BASE = process.env.SHEAR_BASE ?? 'http://127.0.0.1:8080'

let failures = 0
function check(name, ok, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !extra ? '' : '  — ' + extra}`)
  if (!ok) failures++
}

async function api(path, opts = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
  const text = await res.text()
  let body = null
  try {
    body = JSON.parse(text)
  } catch {
    /* not json */
  }
  return { status: res.status, body, text, res }
}

/** Minimal SSE reader over fetch streaming. */
function sseConnect(url) {
  const events = []
  const waiters = []
  let closed = false
  const ctrl = new AbortController()

  ;(async () => {
    try {
      const res = await fetch(BASE + url, { signal: ctrl.signal, headers: { Accept: 'text/event-stream' } })
      if (!res.ok) throw new Error(`status ${res.status}`)
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      while (!closed) {
        const { value, done } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        let idx
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const raw = buf.slice(0, idx)
          buf = buf.slice(idx + 2)
          let name = 'message'
          let data = ''
          for (const line of raw.split('\n')) {
            if (line.startsWith('event: ')) name = line.slice(7)
            else if (line.startsWith('data: ')) data += line.slice(6)
          }
          if (!data) continue
          const ev = { name, data: JSON.parse(data) }
          events.push(ev)
          while (waiters.length && waiters[0].pred(ev)) waiters.shift().resolve(ev)
        }
      }
    } catch (e) {
      if (!closed) console.log(`  (sse ${url.split('?')[0]} ended: ${e.message})`)
    }
  })()

  return {
    /** resolve with the next event named `name` (or matching pred) */
    async until(name, timeoutMs = 5000) {
      const pred = typeof name === 'function' ? name : (ev) => ev.name === name
      const found = events.find(pred)
      if (found) return found
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`timeout waiting for SSE ${typeof name === 'string' ? name : 'event'}`)), timeoutMs)
        waiters.push({
          pred,
          resolve: (ev) => {
            clearTimeout(t)
            resolve(ev)
          },
        })
      })
    },
    close() {
      closed = true
      ctrl.abort()
    },
  }
}

const doc = {
  version: 1,
  app: 'shear',
  id: 'd_e2e',
  name: 'E2E',
  updatedAt: new Date().toISOString(),
  selectedSceneId: 's1',
  variables: [{ id: 'v1', name: 'Primary', color: '#fafafa' }],
  scenes: [
    {
      id: 's1',
      name: 'Scene 1',
      width: 640,
      height: 480,
      background: '#171717',
      nodes: [
        {
          id: 'n_ic',
          name: 'Star',
          type: 'icon',
          x: 10,
          y: 10,
          width: 24,
          height: 24,
          rotation: 0,
          opacity: 1,
          visible: true,
          locked: false,
          fill: null,
          stroke: null,
          icon: { color: '#ededed', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3 7h7l-6 4 2 8-6-5-6 5 2-8-6-4h7z"/></svg>' },
        },
      ],
    },
  ],
}

async function main() {
  // 0. health + static app
  const health = await api('/api/health')
  check('GET /api/health', health.status === 200 && health.body?.ok === true, health.text)

  const home = await fetch(BASE + '/')
  const homeText = await home.text()
  check('GET / serves the app', home.status === 200 && homeText.includes('id="root"'))

  const joinPage = await fetch(BASE + '/join/s_whatever')
  check('GET /join/<id> serves the SPA (no redirect loop)', joinPage.status === 200 && (await joinPage.text()).includes('id="root"'))

  // 1. documents round-trip with icon node + color variables
  const put = await api('/api/documents/d_e2e', { method: 'PUT', body: JSON.stringify(doc) })
  check('PUT /api/documents/{id}', put.status === 200, put.text)
  const got = await api('/api/documents/d_e2e')
  check('GET /api/documents/{id} returns icon + variables', got.status === 200 && got.body?.scenes?.[0]?.nodes?.[0]?.type === 'icon' && got.body?.variables?.length === 1, got.text)
  const list = await api('/api/documents')
  check('GET /api/documents lists it', list.status === 200 && Array.isArray(list.body) && list.body.some((d) => d.id === 'd_e2e'))

  // 2. exports understand icons (Go backend only; the dev mirror answers
  // 501 and the editor's client-side exporters take over)
  const scene = doc.scenes[0]
  if (process.env.SHEAR_E2E_SKIP_EXPORTS) {
    const svg = await api('/api/export/svg', { method: 'POST', body: JSON.stringify({ scene }) })
    check('dev mirror declines exports with 501 (client fallback kicks in)', svg.status === 501)
  } else {
    const svg = await api('/api/export/svg', { method: 'POST', body: JSON.stringify({ scene }) })
    check('SVG export embeds the icon', svg.status === 200 && svg.text.includes('M12 2l3 7') && !svg.text.includes('currentColor'))
    const html = await api('/api/export/html', { method: 'POST', body: JSON.stringify({ scene }) })
    check('HTML export embeds the icon', html.status === 200 && html.text.includes('<svg') && !html.text.includes('currentColor'))
    const pngRes = await fetch(BASE + '/api/export/png', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scene, scale: 1 }) })
    const pngBuf = Buffer.from(await pngRes.arrayBuffer())
    check('PNG export renders', pngRes.status === 200 && pngBuf.slice(1, 4).toString() === 'PNG')
  }

  // 3. open a room, two peers join
  const created = await api('/api/sessions', { method: 'POST', body: JSON.stringify({ document: doc }) })
  check('POST /api/sessions opens a room', created.status === 200 && !!created.body?.id, created.text)
  const sid = created.body.id
  check('share url points at /join/', typeof created.body.url === 'string' && created.body.url.includes('/join/' + sid), created.body.url)

  const ana = sseConnect(`/api/sessions/${sid}/events?name=Ana&peer=p_ana&scene=s1`)
  const helloA = await ana.until('hello')
  check('host peer joins (hello)', helloA.data.peer.id === 'p_ana' && helloA.data.document.name === 'E2E')

  const bea = sseConnect(`/api/sessions/${sid}/events?name=Bea&peer=p_bea&scene=s1`)
  const helloB = await bea.until('hello')
  check('second peer joins (hello)', helloB.data.peer.id === 'p_bea' && helloB.data.document.name === 'E2E')

  const peersAtA = await ana.until((ev) => ev.name === 'peers' && JSON.stringify(ev.data).includes('p_bea'))
  check('host sees the guest in the peer list', JSON.stringify(peersAtA.data).includes('Bea'))

  // 4. Ana edits → Bea sees it
  const renamed = { ...doc, name: 'Renamed live' }
  const docPost = await api(`/api/sessions/${sid}/document`, { method: 'POST', body: JSON.stringify({ peer: 'p_ana', document: renamed }) })
  check('document POST accepted', docPost.status === 200 && docPost.body.rev === 1, docPost.text)
  const docAtBea = await bea.until('document')
  check('guest receives the edit', docAtBea.data.document.name === 'Renamed live' && docAtBea.data.from === 'p_ana')

  // 5. Ana moves the cursor → Bea sees presence
  await api(`/api/sessions/${sid}/presence`, { method: 'POST', body: JSON.stringify({ peer: 'p_ana', x: 123.5, y: 45, sceneId: 's1', selection: 'n_ic', active: true }) })
  const presence = await bea.until('presence')
  check('guest receives the host cursor', presence.data.x === 123.5 && presence.data.name === 'Ana')

  // 6. heartbeat keeps the lease without moving the cursor
  await api(`/api/sessions/${sid}/presence`, { method: 'POST', body: JSON.stringify({ peer: 'p_ana', x: -1, y: -1, sceneId: '', selection: '', active: true }) })

  // 7. Ana drops and reconnects with the same peer id
  ana.close()
  await new Promise((r) => setTimeout(r, 300))
  const ana2 = sseConnect(`/api/sessions/${sid}/events?name=Ana&peer=p_ana&scene=s1`)
  const hello2 = await ana2.until('hello')
  check('reconnect gets the latest document', hello2.data.document.name === 'Renamed live')
  const peersAtBea = await bea.until((ev) => ev.name === 'peers' && JSON.stringify(ev.data).includes('p_ana'))
  const anaCount = JSON.stringify(peersAtBea.data).split('p_ana').length - 1
  check('peer list still has exactly one Ana after reconnect', anaCount === 1, `count=${anaCount}`)

  // 8. Bea edits → reconnected Ana sees it
  const renamed2 = { ...doc, name: 'Bea had a turn' }
  await api(`/api/sessions/${sid}/document`, { method: 'POST', body: JSON.stringify({ peer: 'p_bea', document: renamed2 }) })
  const docAtA = await ana2.until('document')
  check('reconnected host receives the guest edit', docAtA.data.document.name === 'Bea had a turn')

  ana2.close()
  bea.close()

  // 9. unknown sessions / peers are rejected cleanly
  const ghost = await fetch(BASE + '/api/sessions/s_nope/events?name=X')
  check('unknown session is a 404', ghost.status === 404)
  ghost.body?.cancel?.()
  const ghostPresence = await api(`/api/sessions/${sid}/presence`, { method: 'POST', body: JSON.stringify({ peer: 'p_ghost', x: 1, y: 1, sceneId: 's1', selection: '', active: true }) })
  check('ghost presence rejected (409)', ghostPresence.status === 409)

  // 10. cleanup
  const del = await api('/api/documents/d_e2e', { method: 'DELETE' })
  check('DELETE /api/documents/{id}', del.status === 200)

  console.log(failures === 0 ? '\nE2E: ALL CHECKS PASSED' : `\nE2E: ${failures} CHECK(S) FAILED`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('E2E crashed:', e)
  process.exit(1)
})
