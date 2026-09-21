// One-time script: generate PWA PNG icons.
// Run: node scripts/gen-icons.mjs
import { writeFileSync, mkdirSync } from 'fs'
import { deflateSync } from 'zlib'

// CRC32 table
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let crc = 0xffffffff
  for (const b of buf) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const lenBuf = Buffer.alloc(4); lenBuf.writeUInt32BE(data.length)
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf])
}

// Draw a simple ERP icon: dark bg + white chart bars
function makePNG(size) {
  const sig = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8]=8; ihdr[9]=6 // RGBA

  const rows = []
  const s = size
  for (let y = 0; y < s; y++) {
    const row = Buffer.alloc(1 + s * 4)
    row[0] = 0 // no filter
    for (let x = 0; x < s; x++) {
      const off = 1 + x * 4
      // Background: indigo #6366f1 = 99,102,241
      let r=99,g=102,b=241,a=255
      // Rounded corner mask
      const cx = x - s/2, cy = y - s/2, rad = s*0.45
      if (cx*cx+cy*cy > rad*rad) { a=0 }
      else {
        // Chart bars (white): 3 bars in lower 60% of circle
        const margin = s*0.18
        const barW = (s - margin*2) / 5
        const barH = [0.55, 0.75, 0.40]
        const base = s * 0.78
        for (let i=0; i<3; i++) {
          const bx = margin + i*barW*1.5
          const bh = s * barH[i]
          const by = base - bh
          if (x >= bx && x < bx+barW*1.1 && y >= by && y <= base) {
            r=255; g=255; b=255
          }
        }
      }
      row[off]=r; row[off+1]=g; row[off+2]=b; row[off+3]=a
    }
    rows.push(row)
  }
  const idat = chunk('IDAT', deflateSync(Buffer.concat(rows)))
  return Buffer.concat([sig, chunk('IHDR', ihdr), idat, chunk('IEND', Buffer.alloc(0))])
}

mkdirSync('public', { recursive: true })
writeFileSync('public/icon-192.png', makePNG(192))
writeFileSync('public/icon-512.png', makePNG(512))
writeFileSync('public/apple-touch-icon.png', makePNG(180))
console.log('Icons generated: public/icon-192.png, icon-512.png, apple-touch-icon.png')
