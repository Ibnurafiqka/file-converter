/* core.js — logika gambar → PDF (pdf-lib). Murni, tanpa DOM, bisa dites di Node. */
const PL = typeof PDFLib !== 'undefined' ? PDFLib : require('../../vendor/pdf-lib/pdf-lib.min.js');
const MM = 72 / 25.4;
const PAPER = { a4: [595.28, 841.89], letter: [612, 792] };
const tick = () => new Promise(r => setTimeout(r, 0));

// Hitung ukuran halaman dan posisi gambar. o = { size: a4|letter|fit, orient: auto|portrait|landscape, marginMm }
function pageLayout(w, h, o) {
  const m = (o.marginMm || 0) * MM;
  let pw, ph;
  if (o.size === 'fit') { pw = w * 0.75 + 2 * m; ph = h * 0.75 + 2 * m; }
  else {
    [pw, ph] = PAPER[o.size] || PAPER.a4;
    const land = o.orient === 'landscape' || (o.orient === 'auto' && w > h);
    if (land) [pw, ph] = [ph, pw];
  }
  const sc = Math.min((pw - 2 * m) / w, (ph - 2 * m) / h);
  const dw = w * sc, dh = h * sc;
  return { pw, ph, x: (pw - dw) / 2, y: (ph - dh) / 2, dw, dh };
}

// getImage(i) → Promise<{ bytes: Uint8Array, kind: 'jpg'|'png', w, h }>
async function buildImagePdf(count, getImage, o, onProgress) {
  const doc = await PL.PDFDocument.create();
  for (let i = 0; i < count; i++) {
    if (onProgress) { onProgress(i + 1, count); await tick(); }
    const im = await getImage(i);
    const emb = im.kind === 'png' ? await doc.embedPng(im.bytes) : await doc.embedJpg(im.bytes);
    const L = pageLayout(im.w, im.h, o);
    doc.addPage([L.pw, L.ph]).drawImage(emb, { x: L.x, y: L.y, width: L.dw, height: L.dh });
  }
  return doc.save();
}

if (typeof module !== 'undefined') module.exports = { pageLayout, buildImagePdf };
