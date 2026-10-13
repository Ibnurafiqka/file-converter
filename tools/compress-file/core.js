/* core.js — kompres PDF (pdf-lib). Murni, tanpa DOM. Encoder gambar (recode) disuntikkan agar bisa dites di Node. */
const PL = typeof PDFLib !== 'undefined' ? PDFLib : require('../../vendor/pdf-lib/pdf-lib.min.js');
const CFF = typeof fflate !== 'undefined' ? fflate : require('../../vendor/fflate/fflate.js');
const tick = () => new Promise(r => setTimeout(r, 0));
const PN = s => PL.PDFName.of(s);
const MIN_IMAGE_BYTES = 20 * 1024;      // gambar yang lebih kecil dari ini tidak dikompres

// maxSide: sisi terpanjang maksimum gambar (px) · q: kualitas JPEG · dpi: resolusi saat halaman dijadikan gambar
//   low         = kualitas rendah,  ukuran terkecil
//   recommended = kualitas tinggi,  ukuran kecil (seimbang)
//   high        = kualitas tertinggi, ukuran turun sedikit
const LEVELS = {
  low:         { maxSide: 1240, q: 0.50, dpi: 90 },
  recommended: { maxSide: 1754, q: 0.70, dpi: 120 },
  high:        { maxSide: 2480, q: 0.85, dpi: 150 }
};

// Balikkan filter PNG predictor (PDF /Predictor ≥ 10) → piksel mentah
function pngUnpredict(data, rowLen, bpp, h) {
  const out = new Uint8Array(rowLen * h);
  for (let y = 0; y < h; y++) {
    const ft = data[y * (rowLen + 1)], src = y * (rowLen + 1) + 1, dst = y * rowLen, prev = dst - rowLen;
    for (let x = 0; x < rowLen; x++) {
      const raw = data[src + x];
      const a = x >= bpp ? out[dst + x - bpp] : 0, b = y ? out[prev + x] : 0, c = y && x >= bpp ? out[prev + x - bpp] : 0;
      let v;
      if (ft === 0) v = raw;
      else if (ft === 1) v = raw + a;
      else if (ft === 2) v = raw + b;
      else if (ft === 3) v = raw + ((a + b) >> 1);
      else if (ft === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v = raw + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      else throw new Error('filter predictor tidak dikenal');
      out[dst + x] = v & 255;
    }
  }
  return out;
}

// Ambil info gambar yang aman diproses ulang; null = lewati (mask, CMYK, palette, bit ≠ 8, filter lain)
function describeImage(ctx, st) {
  const d = st.dict, get = k => ctx.lookup(d.get(PN(k)));
  const num = v => v instanceof PL.PDFNumber ? v.asNumber() : null;
  const name = v => v instanceof PL.PDFName ? v.toString() : null;
  const im = get('ImageMask');
  if ((im && im.value === true) || d.get(PN('Mask')) || d.get(PN('Decode'))) return null;
  const w = num(get('Width')), h = num(get('Height')), bpc = num(get('BitsPerComponent'));
  if (!w || !h || bpc !== 8) return null;
  const cs = get('ColorSpace');
  let channels = null;
  if (cs instanceof PL.PDFName) channels = { '/DeviceRGB': 3, '/DeviceGray': 1 }[cs.toString()] || null;
  else if (cs instanceof PL.PDFArray) {
    const a = cs.asArray();
    if (name(ctx.lookup(a[0])) === '/ICCBased') { const prof = ctx.lookup(a[1]); const n = prof && prof.dict ? num(ctx.lookup(prof.dict.get(PN('N')))) : null; channels = n === 1 || n === 3 ? n : null; }
  }
  if (!channels) return null;
  const f = get('Filter');
  const list = f instanceof PL.PDFName ? [f] : f instanceof PL.PDFArray ? f.asArray().map(x => ctx.lookup(x)) : [];
  if (list.length !== 1) return null;
  let predictor = 1;
  let dp = get('DecodeParms');
  if (dp instanceof PL.PDFArray) dp = ctx.lookup(dp.asArray()[0]);
  if (dp instanceof PL.PDFDict) { predictor = num(ctx.lookup(dp.get(PN('Predictor')))) || 1; const col = num(ctx.lookup(dp.get(PN('Columns')))); if (col && col !== w) return null; }
  return { w, h, channels, filter: name(list[0]), predictor };
}

// Kompres gambar di dalam PDF; teks dan vektor tidak berubah.
// recode(src, maxSide, q) → { bytes (JPEG), w, h } | null ; src = { kind:'jpeg', bytes } | { kind:'raw', data, w, h, channels }
async function compressImages(buffer, level, recode, onProgress) {
  const doc = await PL.PDFDocument.load(buffer, { updateMetadata: false });
  const ctx = doc.context, imgs = [];
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (!(obj instanceof PL.PDFRawStream)) continue;
    const st = obj.dict.get(PN('Subtype'));
    if (st && st.toString() === '/Image') imgs.push([ref, obj]);
  }
  let done = 0, replaced = 0;
  for (const [ref, obj] of imgs) {
    if (onProgress) { onProgress(++done, imgs.length); await tick(); }
    if (obj.contents.length < MIN_IMAGE_BYTES) continue;
    const info = describeImage(ctx, obj);
    if (!info) continue;
    let src = null;
    try {
      if (info.filter === '/DCTDecode') src = { kind: 'jpeg', bytes: obj.contents };
      else if (info.filter === '/FlateDecode') {
        let data = CFF.unzlibSync(obj.contents);
        const rowLen = info.w * info.channels;
        if (info.predictor >= 10) data = pngUnpredict(data, rowLen, info.channels, info.h);
        else if (info.predictor !== 1) continue;
        if (data.length < rowLen * info.h) continue;
        src = { kind: 'raw', data, w: info.w, h: info.h, channels: info.channels };
      } else continue;
    } catch (e) { continue; }
    let out = null;
    try { out = await recode(src, level.maxSide, level.q); } catch (e) { out = null; }
    if (!out || out.bytes.length >= obj.contents.length * 0.95) continue;       // tidak lebih kecil: biarkan
    const sm = obj.dict.get(PN('SMask'));
    const dict = ctx.obj(Object.assign({ Type: 'XObject', Subtype: 'Image', Width: out.w, Height: out.h, ColorSpace: 'DeviceRGB', BitsPerComponent: 8, Filter: 'DCTDecode' }, sm ? { SMask: sm } : {}));
    ctx.assign(ref, PL.PDFRawStream.of(dict, out.bytes));
    replaced++;
  }
  const bytes = await doc.save({ useObjectStreams: true });
  return { bytes, images: imgs.length, replaced };
}

// Susun PDF baru dari gambar halaman. getPage(i) → { bytes (JPEG), ptW, ptH } (ukuran halaman asli dalam pt)
async function buildRasterPdf(count, getPage, onProgress) {
  const doc = await PL.PDFDocument.create();
  for (let i = 0; i < count; i++) {
    if (onProgress) { onProgress(i + 1, count); await tick(); }
    const p = await getPage(i);
    const img = await doc.embedJpg(p.bytes);
    doc.addPage([p.ptW, p.ptH]).drawImage(img, { x: 0, y: 0, width: p.ptW, height: p.ptH });
  }
  return doc.save();
}

if (typeof module !== 'undefined') module.exports = { LEVELS, compressImages, buildRasterPdf, pngUnpredict };
