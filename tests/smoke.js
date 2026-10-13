/* Tes cepat logika inti (tanpa browser). Jalankan: npm install && npm test */
const assert = require('assert');
const { PDFDocument, StandardFonts } = require('../vendor/pdf-lib/pdf-lib.min.js');
const fflate = require('../vendor/fflate/fflate.js');
const img = require('../tools/image-to-pdf/core.js');
const mrg = require('../tools/merge-pdf/core.js');
const csv = require('../tools/csv-to-excel/worker.js');
const T = require('../tools/pdf-to-excel/table.js');
const { buildXlsx } = require('../shared/js/xlsx-lite.js');
const { pageGraphics, pageTextColors, colorItems } = require('../tools/pdf-to-excel/graphics.js');
const { buildLayoutSheet } = require('../tools/pdf-to-excel/sheet-layout.js');
const cmp = require('../tools/compress-file/core.js');
const { createCanvas, loadImage, ImageData } = require('@napi-rs/canvas');

const PNG = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACgAAAAeCAIAAADRv8uKAAAALElEQVR4nO3NMQEAAAQAMETSP4BYKvg8W4HldMeHelnFYrFYLBaLxWKxWHyyVMYBaNceIy8AAAAASUVORK5CYII=', 'base64'));
const JPG = new Uint8Array(Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAA8AB4DASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDgqKKK/QzkCiiigAooooAKKKKACiiigAooooAKKKKACiiigD//2Q==', 'base64'));
const sheetXml = bytes => Buffer.from(fflate.unzipSync(bytes)['xl/worksheets/sheet1.xml']).toString();
let n = 0;
const ok = name => console.log('  ok', ++n, name);

(async () => {
  // gambar → PDF
  const L = img.pageLayout(4000, 3000, { size: 'a4', orient: 'auto', marginMm: 10 });
  assert(L.pw > L.ph); ok('layout landscape otomatis');
  const imgs = [{ bytes: PNG, kind: 'png', w: 40, h: 30 }, { bytes: JPG, kind: 'jpg', w: 30, h: 60 }];
  const pdf = await PDFDocument.load(await img.buildImagePdf(2, async i => imgs[i], { size: 'a4', orient: 'auto', marginMm: 10 }));
  assert.strictEqual(pdf.getPageCount(), 2); ok('gambar → PDF 2 halaman');

  // gabung PDF
  const mk = async k => { const d = await PDFDocument.create(); const f = await d.embedFont(StandardFonts.Helvetica); for (let i = 0; i < k; i++) d.addPage([300, 300]).drawText('x' + i, { x: 20, y: 150, font: f }); return d.save(); };
  const a = await mk(2), b = await mk(3);
  const merged = await PDFDocument.load(await mrg.mergePdfs(2, async i => ({ name: 'f' + i, buffer: [a, b][i] })));
  assert.strictEqual(merged.getPageCount(), 5); ok('gabung PDF 2+3 = 5 halaman');
  await assert.rejects(mrg.mergePdfs(1, async () => ({ name: 'rusak.pdf', buffer: new Uint8Array([1, 2, 3]) })), /rusak\.pdf/); ok('PDF rusak ditolak dengan nama file');

  // CSV → XLSX (streaming)
  const text = 'id,kode,catatan\n1,00123,"a, ""b""\nbaris2"\n2,00456,biasa & <tag>\n';
  const r = await csv.convertStream(new Blob([text]).stream(), text.length, { asText: true }, null);
  const xml = sheetXml(Buffer.concat(r.parts));
  assert.strictEqual(r.rows, 3); assert(xml.includes('00123') && xml.includes('&amp; &lt;tag&gt;') && xml.includes('<row r="3">')); ok('CSV → XLSX: baris, nol di depan, escape XML');

  // PDF → Excel (tabel)
  const d = await PDFDocument.create(); const f = await d.embedFont(StandardFonts.Helvetica);
  const rows = [['No', 'Nama Barang', 'Qty', 'Harga'], ['1', 'Pensil 2B', '10', '1.500,50'], ['2', 'Buku tulis besar', '125', '12.000'], ['004', 'Map', '1', '2.000']];
  const xs = [50, 90, 300, 400], right = [false, false, true, true];
  const p = d.addPage([595, 842]);
  rows.forEach((row, ri) => row.forEach((v, ci) => p.drawText(v, { x: right[ci] ? xs[ci] + 60 - f.widthOfTextAtSize(v, 10) : xs[ci], y: 760 - ri * 16, size: 10, font: f })));
  const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await d.save()), useSystemFonts: true }).promise;
  const pages = [T.pageItems(await (await doc.getPage(1)).getTextContent())];
  const sheets = T.applyNumbers(T.extractSheets(pages, { gapMul: 0.8, mode: 'all' }), 'id');
  assert.deepStrictEqual(sheets[0].rows[1], [1, 'Pensil 2B', 10, 1500.5]);
  assert.deepStrictEqual(sheets[0].rows[3], ['004', 'Map', 1, 2000]); ok('PDF → tabel: kolom, angka Indonesia, nol di depan');
  const x2 = sheetXml(buildXlsx(sheets));
  assert(x2.includes('<v>1500.5</v>')); ok('tabel → XLSX');

  // PDF → Excel mengikuti tampilan: warna latar, sel gabungan, tebal, border
  {
    const { rgb } = require('../vendor/pdf-lib/pdf-lib.min.js');
    const d2 = await PDFDocument.create(); const reg = await d2.embedFont(StandardFonts.Helvetica), bold = await d2.embedFont(StandardFonts.HelveticaBold);
    const pg = d2.addPage([595, 842]), X = [50, 90, 300, 400, 500], blk = rgb(0, 0, 0);
    pg.drawRectangle({ x: 50, y: 780, width: 450, height: 24, color: rgb(0.1, 0.3, 0.6) });
    pg.drawText('LAPORAN', { x: 230, y: 788, size: 12, font: bold, color: rgb(1, 1, 1) });
    ['No', 'Nama', 'Qty', 'Harga'].forEach((t, c) => { pg.drawRectangle({ x: X[c], y: 756, width: X[c + 1] - X[c], height: 24, color: rgb(0.85, 0.85, 0.85), borderColor: blk, borderWidth: 0.5 }); pg.drawText(t, { x: X[c] + 4, y: 764, size: 10, font: bold }); });
    [['1', 'Pensil', '10', '1.500,50'], ['2', 'Buku', '125', '12.000']].forEach((r, ri) => r.forEach((v, c) => {
      pg.drawRectangle({ x: X[c], y: 732 - ri * 24, width: X[c + 1] - X[c], height: 24, borderColor: blk, borderWidth: 0.5 });
      pg.drawText(v, { x: c >= 2 ? X[c + 1] - 4 - reg.widthOfTextAtSize(v, 10) : X[c] + 4, y: 740 - ri * 24, size: 10, font: reg });
    }));
    pg.drawRectangle({ x: 50, y: 660, width: 40, height: 48, color: rgb(1, 1, 0.6), borderColor: blk, borderWidth: 0.5 });
    pg.drawText('Grup', { x: 56, y: 680, size: 10, font: bold });
    ['Item A', 'Item B'].forEach((t, i) => { pg.drawRectangle({ x: 90, y: 684 - i * 24, width: 210, height: 24, borderColor: blk, borderWidth: 0.5 }); });
    const doc3 = await pdfjs.getDocument({ data: new Uint8Array(await d2.save()), useSystemFonts: true }).promise;
    const page3 = await doc3.getPage(1), ol = await page3.getOperatorList();
    const isBold = id => { try { return !!page3.commonObjs.get(id).bold; } catch (e) { return false; } };
    const sh = buildLayoutSheet(T.pageItems(await page3.getTextContent(), isBold), pageGraphics(ol, pdfjs.OPS, page3.view), { gapMul: 0.8, num: 'id' });
    assert.strictEqual(sh.colWidths.length, 4);
    assert(sh.merges.some(m => m.r0 === 0 && m.c0 === 0 && m.r1 === 0 && m.c1 === 3), 'judul digabung A1:D1');
    assert.strictEqual(sh.rows[0][0].st.bg, '1A4C99'); assert(sh.rows[0][0].st.b); assert.strictEqual(sh.rows[0][0].st.fc, 'FFFFFF');
    assert.strictEqual(sh.rows[1][0].st.bg, 'D9D9D9'); assert(sh.rows[1][1].st.bl, 'border kiri');
    assert(sh.merges.some(m => m.c0 === 0 && m.c1 === 0 && m.r1 - m.r0 === 1), 'Grup digabung vertikal 2 baris');
    assert.strictEqual(sh.rows[2][3].v, 1500.5); assert.strictEqual(sh.rows[2][3].st.al, 'right');
    ok('PDF → Excel tampilan: warna, merge, tebal, border, rata kanan');
    const xx = Buffer.from(fflate.unzipSync(buildXlsx([Object.assign({ name: 'Hal 1' }, sh)]))['xl/worksheets/sheet1.xml']).toString();
    assert(xx.includes('<mergeCell ref="A1:D1"/>') && xx.includes('<cols>')); ok('XLSX memuat mergeCells dan lebar kolom');
  }

  // Kompres PDF (gambar di dalam PDF) dengan encoder canvas Node
  {
    const noisy = (w, h, seed) => { const c = createCanvas(w, h), g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#264'); gr.addColorStop(1, '#c84'); g.fillStyle = gr; g.fillRect(0, 0, w, h); let z = seed; const r = () => (z = (z * 1664525 + 1013904223) >>> 0) / 4294967296; for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(${r() * 255 | 0},${r() * 255 | 0},${r() * 255 | 0},0.5)`; g.fillRect(r() * w, r() * h, 30 + r() * 80, 30 + r() * 80); } return c; };
    const recode = async (src, maxSide, q) => {
      let img, w, h;
      if (src.kind === 'jpeg') { img = await loadImage(Buffer.from(src.bytes)); w = img.width; h = img.height; }
      else { w = src.w; h = src.h; const px = new Uint8ClampedArray(w * h * 4); for (let i = 0, j = 0; i < w * h; i++, j += 4) { px[j] = src.data[i * src.channels]; px[j + 1] = src.data[i * src.channels + (src.channels === 3 ? 1 : 0)]; px[j + 2] = src.data[i * src.channels + (src.channels === 3 ? 2 : 0)]; px[j + 3] = 255; } img = createCanvas(w, h); img.getContext('2d').putImageData(new ImageData(px, w, h), 0, 0); }
      const sc = Math.min(1, maxSide / Math.max(w, h)), dw = Math.round(w * sc), dh = Math.round(h * sc), c = createCanvas(dw, dh), g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, dw, dh); g.drawImage(img, 0, 0, dw, dh);
      return { bytes: new Uint8Array(c.toBuffer('image/jpeg', Math.round(q * 100))), w: dw, h: dh };
    };
    const d4 = await PDFDocument.create();
    const ij = await d4.embedJpg(noisy(3000, 2000, 1).toBuffer('image/jpeg', 95)), ip = await d4.embedPng(noisy(1600, 1200, 2).toBuffer('image/png'));
    d4.addPage([595, 842]).drawImage(ij, { x: 20, y: 400, width: 555, height: 370 });
    d4.addPage([595, 842]).drawImage(ip, { x: 20, y: 400, width: 555, height: 416 });
    const orig = await d4.save();
    const res = await cmp.compressImages(orig, cmp.LEVELS.recommended, recode);
    assert.strictEqual(res.replaced, 2); assert(res.bytes.length < orig.length * 0.5, 'ukuran turun > 50%');
    assert.strictEqual((await PDFDocument.load(res.bytes)).getPageCount(), 2); ok('Kompres PDF: JPEG + PNG diperkecil, halaman tetap');
    const small = await cmp.compressImages(res.bytes, cmp.LEVELS.recommended, recode);
    assert.strictEqual(small.replaced, 0); ok('Kompres ulang file yang sudah kecil tidak mengubah apa pun');
    const jb = new Uint8Array(noisy(400, 560, 3).toBuffer('image/jpeg', 70));
    const rp = await PDFDocument.load(await cmp.buildRasterPdf(2, async () => ({ bytes: jb, ptW: 595, ptH: 842 })));
    assert.strictEqual(rp.getPageCount(), 2); assert.strictEqual(Math.round(rp.getPage(0).getSize().width), 595); ok('Rakit PDF dari gambar halaman (ukuran halaman asli)');
  }

  // Regresi pada PDF hasil ekspor LibreOffice (Excel-style dan Word): tests/fixtures/*.pdf — tambahkan PDF masalahmu di sini
  {
    const layoutOf = async file => {
      const doc = await pdfjs.getDocument({ data: new Uint8Array(require('fs').readFileSync(file)), useSystemFonts: true }).promise;
      const page = await doc.getPage(1), ol = await page.getOperatorList(), content = await page.getTextContent();
      const style = id => { try { const f = page.commonObjs.get(id), n = f.name || ''; return { b: !!(f.bold || /bold|black|heavy|semibold|demi/i.test(n)), i: !!(f.italic || /italic|oblique/i.test(n)) }; } catch (e) { return null; } };
      const items = T.pageItems(content, style, colorItems(content.items, pageTextColors(ol, pdfjs.OPS)));
      return buildLayoutSheet(items, pageGraphics(ol, pdfjs.OPS, page.view), { gapMul: 0.8, num: 'en' });
    };
    const find = (sh, text) => { for (const r of sh.rows) for (const c of r) if (c && c.v === text) return c; return null; };
    const mg = (sh, f) => sh.merges.some(f);
    const lap = await layoutOf(__dirname + '/fixtures/laporan.pdf');
    assert.strictEqual(lap.colWidths.length, 6, '6 kolom (header rata tengah ≠ kolom baru)');
    assert(mg(lap, m => m.r0 === 0 && m.c0 === 0 && m.c1 === 5), 'judul digabung A:F');
    assert(mg(lap, m => m.r0 === 1 && m.c0 === 0 && m.c1 === 5), 'subjudul rata tengah digabung A:F');
    assert(mg(lap, m => m.c0 === 0 && m.c1 === 0 && m.r1 - m.r0 === 2), 'Status digabung vertikal 3 baris');
    assert(mg(lap, m => m.c0 === 0 && m.c1 === 4 && m.r0 === m.r1), 'baris TOTAL digabung A:E (hanya digambar dengan garis)');
    assert.strictEqual(lap.merges.filter(m => m.c0 === 1 && m.c1 === 3 && m.r0 === m.r1).length, 3, '3 baris Status digabung B:D');
    assert.strictEqual(lap.merges.length, 7, 'jumlah merge = sumber (tidak ada merge palsu)');
    assert.strictEqual(find(lap, 'LAPORAN PENJUALAN TRIWULAN I').st.fc, 'FFFFFF');
    assert.strictEqual(find(lap, 'Status').st.bg, 'C6E0B4'); assert(find(lap, 'Status').st.b);
    assert(find(lap, 'PT Contoh Sejahtera - Surabaya').st.i, 'huruf miring');
    assert(find(lap, 'Spidol Warna Hitam Permanen\nBesar'), 'teks bungkus dua baris tetap satu sel');
    assert.strictEqual(find(lap, 120).st.al, 'right'); assert.strictEqual(find(lap, 180000).st.nf, '#,##0');
    ok('Regresi laporan.pdf (Excel-style): kolom, merge, warna, miring, bungkus, format angka');
    const inv = await layoutOf(__dirname + '/fixtures/inventaris.pdf');
    assert.strictEqual(find(inv, 'Kode').st.bg, 'C00000'); assert.strictEqual(find(inv, 'Kode').st.fc, 'FFFFFF');
    const jd = find(inv, 'Daftar Inventaris'); assert(jd.st.fc && jd.st.fc !== '000000', 'judul berwarna');
    assert(mg(inv, m => m.c0 === 0 && m.c1 === 3), 'baris total digabung');
    ok('Regresi inventaris.pdf (Word): header merah, judul berwarna, baris total digabung');
  }
  console.log('semua tes lolos (' + n + ')');
})().catch(e => { console.error('GAGAL:', e.message); process.exit(1); });
