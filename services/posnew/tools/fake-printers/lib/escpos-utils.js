/**
 * Best-effort ESC/POS → readable text for terminal previews (Epson-style commands).
 * Not a full parser; sufficient for tickets emitted by node-thermal-printer.
 */

/**
 * @param {Buffer|Uint8Array|string} buf
 * @returns {string}
 */
function escPosToReadable(buf) {
  if (!buf || !buf.length) return "";
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  const out = [];
  let i = 0;
  while (i < b.length) {
    const c = b[i];
    if (c === 0x1b) {
      i += 1;
      if (i >= b.length) break;
      const x = b[i++];
      if (x === 0x40) continue;
      if (x === 0x28) {
        if (i + 2 < b.length) {
          i += 1;
          const n1 = b[i++];
          const n2 = b[i++];
          const len = n1 + n2 * 256;
          const take = Math.min(len, b.length - i);
          i += take;
        }
        continue;
      }
      if (x === 0x2a) {
        if (i + 2 < b.length) {
          i += 2;
          if (i + 1 < b.length) {
            const w = b[i] + b[i + 1] * 256;
            i += 2 + w;
          }
        }
        continue;
      }
      if (i < b.length && [0x61, 0x45, 0x21, 0x2d, 0x33, 0x64, 0x74, 0x7b, 0x44].includes(x)) {
        i += 1;
        continue;
      }
      continue;
    }
    if (c === 0x1d) {
      i += 1;
      if (i >= b.length) break;
      const gs = b[i++];
      if (gs === 0x56) {
        if (i < b.length) i += 1;
        if (i < b.length) i += 1;
        continue;
      }
      if (gs === 0x21 && i < b.length) {
        i += 1;
        continue;
      }
      if (gs === 0x28 && i + 2 < b.length) {
        i += 2;
        const n1 = b[i++];
        const n2 = b[i++];
        const len = n1 + n2 * 256;
        i += Math.min(len, b.length - i);
        continue;
      }
      if (gs === 0x1b) {
        i -= 1;
        continue;
      }
      if (i < b.length) i += 1;
      continue;
    }
    if (c === 0x0a || c === 0x0d) {
      out.push(c);
      i += 1;
      continue;
    }
    if (c >= 0x20 && c <= 0x7e) {
      out.push(c);
      i += 1;
      continue;
    }
    i += 1;
  }
  return Buffer.from(out).toString("utf8");
}

/**
 * Wrap text in a light unicode box for terminal display.
 * @param {string} title
 * @param {string} body
 */
function formatPreviewBox(title, body) {
  const lines = body.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const innerW = Math.max(
    title.length,
    ...lines.map((l) => l.length),
    12,
  );
  const top = `╔${"═".repeat(innerW + 2)}╗`;
  const mid = `║ ${title.padEnd(innerW)} ║`;
  const sep = `╠${"═".repeat(innerW + 2)}╣`;
  const bot = `╚${"═".repeat(innerW + 2)}╝`;
  const bodyRows = lines
    .filter((l, idx) => l.length > 0 || idx < lines.length - 1)
    .map((l) => `║ ${l.padEnd(innerW)} ║`);
  return [top, mid, sep, ...bodyRows, bot].join("\n");
}

/**
 * Rough count of "N x Name" kitchen lines in readable ticket text.
 * @param {string} readable
 */
function countQtyLines(readable) {
  const re = /(\d+)\s+x\s+[^\n]+/gi;
  let m;
  let n = 0;
  while ((m = re.exec(readable)) !== null) n += 1;
  return n;
}

module.exports = {
  escPosToReadable,
  formatPreviewBox,
  countQtyLines,
};
