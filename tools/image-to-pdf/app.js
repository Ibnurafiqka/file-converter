const list = createFileList($('list'), items => { $('go').disabled = !items.length; });
setupDrop($('drop'), $('file'), files => list.add(files.filter(f => f.type.startsWith('image/'))));

// [sisi terpanjang maks (px), kualitas JPEG]
const QUALITY = { tinggi: [4000, 0.92], sedang: [2500, 0.85], kecil: [1600, 0.75] };

// Selalu lewat canvas: orientasi EXIF foto HP ikut benar, dan semua format (WebP, GIF, BMP, …) jadi JPEG
async function renderJpeg(file, [maxSide, q]) {
  let bmp;
  try { bmp = await createImageBitmap(file); }
  catch (e) { throw new Error(`"${file.name}": gambar tidak bisa dibaca.`); }
  const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * s)), h = Math.max(1, Math.round(bmp.height * s));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);   // latar putih untuk PNG transparan
  g.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', q));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), kind: 'jpg', w, h };
}

$('go').onclick = async () => {
  const items = list.items.slice();
  $('go').disabled = true;
  const o = { size: $('size').value, orient: $('orient').value, marginMm: Math.min(40, Math.max(0, +$('margin').value || 0)) };
  const q = QUALITY[$('quality').value];
  try {
    const bytes = await buildImagePdf(items.length, i => renderJpeg(items[i].file, q), o, (i, n) => msg(`Memproses gambar ${i}/${n}…`));
    const name = items.length === 1 ? items[0].file.name.replace(/\.[^.]+$/, '') + '.pdf' : 'gambar-gabungan.pdf';
    download(new Blob([bytes], { type: 'application/pdf' }), name);
    msg(`Selesai: ${items.length} halaman, ${fmtSize(bytes.length)}.`);
  } catch (e) { msg('Gagal: ' + e.message, true); }
  $('go').disabled = !list.items.length;
};
