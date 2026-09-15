/** Minimal ZIP writer (store method) — enough to hand out a project folder. */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export interface ZipEntry {
  path: string
  data: string | Uint8Array
}

export function zipStore(entries: ZipEntry[]): Blob {
  const enc = new TextEncoder()
  const chunks: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0

  const u16 = (v: number) => new Uint8Array([v & 255, (v >> 8) & 255])
  const u32 = (v: number) => new Uint8Array([v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255])
  const cat = (parts: Uint8Array[]) => {
    const len = parts.reduce((a, p) => a + p.length, 0)
    const out = new Uint8Array(len)
    let o = 0
    for (const p of parts) {
      out.set(p, o)
      o += p.length
    }
    return out
  }

  for (const e of entries) {
    const data = typeof e.data === 'string' ? enc.encode(e.data) : e.data
    const name = enc.encode(e.path)
    const crc = crc32(data)
    const local = cat([
      u32(0x04034b50),
      u16(20), // version
      u16(0), // flags
      u16(0), // method: store
      u16(0), // time
      u16(0), // date
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      name,
      data,
    ])
    chunks.push(local)
    central.push(
      cat([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(crc),
        u32(data.length),
        u32(data.length),
        u16(name.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        name,
      ]),
    )
    offset += local.length
  }

  const centralBlob = cat(central)
  const end = cat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralBlob.length),
    u32(offset),
    u16(0),
  ])
  const all = cat([...chunks, centralBlob, end])
  return new Blob([all.buffer as ArrayBuffer], { type: 'application/zip' })
}
