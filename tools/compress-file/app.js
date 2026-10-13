pdfjsLib.GlobalWorkerOptions.workerSrc = '../../vendor/pdfjs/pdf.worker.min.js';
let file = null;

setupDrop($('drop'), $('file'), files => {
  const f = files.find(x => x.type === 'application/pdf' || /\.pdf$/i.test(x.name));
  if (!f) return;
  file = f; $('dl').disabled = false;
  msg(`${f.name} (${fmtSize(f.size)})`);
});

const canvasOf = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const toJpeg = (c, q) => new Promise(r => c.toBlob(r, 'image/jpeg', q)).then(b => b.arrayBuffer()).then(b => new Uint8Array(b));

// Encode ulang satu gambar: perkecil (maks sisi terpanjang) lalu simpan sebagai JPEG
async function recode(src, maxSide, q) {
  let source, w, h;
  if (src.kind === 'jpeg') {
    // orientasi 'none': PDF mengabaikan EXIF, jadi gambar tidak boleh diputar otomatis
    source = await createImageBitmap(new Blob([src.bytes], { type: 'image/jpeg' }), { imageOrientation: 'none' });
    w = source.width; h = source.height;
  } else {
    w = src.w; h = src.h;
    const rgba = new Uint8ClampedArray(w * h * 4), d = src.data;
    for (let i = 0, j = 0; i < w * h; i++, j += 4) {
      if (src.channels === 3) { rgba[j] = d[i * 3]; rgba[j + 1] = d[i * 3 + 1]; rgba[j + 2] = d[i * 3 + 2]; } else rgba[j] = rgba[j + 1] = rgba[j + 2] = d[i];
      rgba[j + 3] = 255;
    }
    source = canvasOf(w, h);
    source.getContext('2d').putImageData(new ImageData(rgba, w, h), 0, 0);
  }
  const s = Math.min(1, maxSide / Math.max(w, h)), dw = Math.max(1, Math.round(w * s)), dh = Math.max(1, Math.round(h * s));
  const c = canvasOf(dw, dh), g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, dw, dh);
  g.imageSmoothingQuality = 'high';
  g.drawImage(source, 0, 0, dw, dh);
  if (source.close) source.close();
  return { bytes: await toJpeg(c, q), w: dw, h: dh };
}

async function rasterize(buffer, L) {
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const bytes = await buildRasterPdf(pdf.numPages, async i => {
    const page = await pdf.getPage(i + 1);
    const base = page.getViewport({ scale: 1 });
    let scale = L.dpi / 72;
    scale = Math.min(scale, Math.sqrt(16e6 / (base.width * base.height)));       // batas ±16 juta piksel per halaman
    const vp = page.getViewport({ scale });
    const c = canvasOf(Math.ceil(vp.width), Math.ceil(vp.height)), g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: g, viewport: vp }).promise;
    page.cleanup();
    return { bytes: await toJpeg(c, L.q), ptW: base.width, ptH: base.height };
  }, (i, n) => msg(`Mengubah halaman ${i}/${n} jadi gambar…`));
  await pdf.destroy();
  return { bytes };
}

$('dl').onclick = async () => {
  $('dl').disabled = true;
  const L = LEVELS[$('level').value];
  try {
    const buffer = await file.arrayBuffer();
    msg('Memproses…');
    const r = $('mode').value === 'images'
      ? await compressImages(buffer, L, recode, (i, n) => msg(`Mengompres gambar ${i}/${n}…`))
      : await rasterize(buffer, L);
    const before = file.size, after = r.bytes.length;
    if (after >= before) {
      msg(`Tidak bisa dikecilkan (${fmtSize(before)} → ${fmtSize(after)}). ` + ($('mode').value === 'images'
        ? 'PDF ini kemungkinan tidak punya gambar besar; coba "Low compress" atau cara "Ubah halaman jadi gambar".'
        : 'Coba "Low compress".'), true);
    } else {
      download(new Blob([r.bytes], { type: 'application/pdf' }), file.name.replace(/\.pdf$/i, '') + '-kompres.pdf');
      msg(`Selesai: ${fmtSize(before)} → ${fmtSize(after)} (hemat ${Math.round((1 - after / before) * 100)}%)` + (r.images !== undefined ? `, ${r.replaced} dari ${r.images} gambar dikompres.` : '.'));
    }
  } catch (e) { msg(/encrypt|password/i.test(e.message + e.name) ? 'PDF dilindungi password.' : 'Gagal: ' + e.message, true); }
  $('dl').disabled = false;
};
