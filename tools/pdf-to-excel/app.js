pdfjsLib.GlobalWorkerOptions.workerSrc = '../../vendor/pdfjs/pdf.worker.min.js';
let file = null, pages = null, gfxs = null, sheets = null;

setupDrop($('drop'), $('file'), files => { const f = files.find(x => x.type === 'application/pdf' || /\.pdf$/i.test(x.name)); if (f) load(f); });

// Mode layout butuh graphics.js + sheet-layout.js; kalau salah satu tidak termuat (404), pakai mode teks dan beri tahu
const MISSING = ['pageGraphics', 'pageTextColors', 'colorItems', 'buildLayoutSheet'].filter(n => typeof window[n] !== 'function');
if (MISSING.length) {
  $('view').value = 'plain'; $('view').disabled = true;
  msg('Mode "ikuti tampilan PDF" nonaktif: ' + MISSING.join(', ') + ' tidak ditemukan. Pastikan graphics.js dan sheet-layout.js ada di folder tools/pdf-to-excel/ dan dimuat di index.html (cek tab Network di DevTools untuk 404).', true);
}

function fontStyle(page, id) {
  try {
    const f = page.commonObjs.get(id), n = (f && f.name) || '';
    return f ? { b: !!(f.bold || /bold|black|heavy|semibold|demi/i.test(n)), i: !!(f.italic || /italic|oblique/i.test(n)) } : null;
  } catch (e) { return null; }
}

async function load(f) {
  file = f; pages = null; gfxs = null; sheets = null;
  $('dl').disabled = true; $('preview').innerHTML = '';
  try {
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
    const outP = [], outG = []; let n = 0;
    for (let p = 1; p <= pdf.numPages; p++) {
      msg(`Membaca halaman ${p}/${pdf.numPages}…`);
      const page = await pdf.getPage(p);
      const ol = await page.getOperatorList();                 // memuat font + data grafik (warna, garis)
      const content = await page.getTextContent();
      const colors = MISSING.length ? null : colorItems(content.items, pageTextColors(ol, pdfjsLib.OPS));
      const items = pageItems(content, id => fontStyle(page, id), colors);
      let gfx = MISSING.length ? { rects: [], lines: [] } : pageGraphics(ol, pdfjsLib.OPS, page.view);
      if (gfx.rects.length + gfx.lines.length > 30000) gfx = { rects: [], lines: [] };   // terlalu rumit: pakai teks saja
      n += items.length; outP.push(items); outG.push(gfx); page.cleanup();
    }
    await pdf.destroy();
    if (!n) throw new Error('PDF ini tidak punya teks (kemungkinan hasil scan/foto), jadi tidak ada yang bisa diekstrak. Butuh OCR.');
    pages = outP; gfxs = outG; refresh();
  } catch (e) { msg(e.name === 'PasswordException' ? 'PDF dilindungi password.' : e.message, true); }
}

function refresh() {
  if (!pages) return;
  const gapMul = +$('gap').value, num = $('num').value, layout = $('view').value === 'layout' && !MISSING.length;
  $('mode').disabled = layout;
  if (layout) {
    sheets = [];
    pages.forEach((items, i) => { const s = buildLayoutSheet(items, gfxs[i], { gapMul, num }); if (s) { s.name = 'Hal ' + (i + 1); sheets.push(s); } });
  } else sheets = applyNumbers(extractSheets(pages, { gapMul, mode: $('mode').value }), num);
  renderPreview(sheets[0]);
  const total = sheets.reduce((a, s) => a + s.rows.length, 0), mg = sheets.reduce((a, s) => a + (s.merges ? s.merges.length : 0), 0);
  msg(`${file.name} — ${pages.length} halaman, ${total} baris${mg ? `, ${mg} sel gabungan` : ''} (preview: 40 baris pertama dari sheet pertama).`);
  $('dl').disabled = !total;
}

function renderPreview(sheet) {
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  if (!sheet) { $('preview').innerHTML = ''; return; }
  const skip = new Set(), span = {};
  (sheet.merges || []).forEach(m => {
    span[m.r0 + ',' + m.c0] = m;
    for (let r = m.r0; r <= m.r1; r++) for (let c = m.c0; c <= m.c1; c++) if (r !== m.r0 || c !== m.c0) skip.add(r + ',' + c);
  });
  $('preview').innerHTML = sheet.rows.slice(0, 40).map((row, r) => '<tr>' + row.slice(0, 30).map((cell, c) => {
    if (skip.has(r + ',' + c)) return '';
    const o = cell !== null && typeof cell === 'object' ? cell : { v: cell }, st = o.st || {}, m = span[r + ',' + c];
    const css = (st.bg ? `background:#${st.bg};` : '') + (st.fc ? `color:#${st.fc};` : '') + (st.b ? 'font-weight:bold;' : '') + (st.al ? `text-align:${st.al};` : '');
    const attr = m ? ` colspan="${Math.min(m.c1, 29) - m.c0 + 1}" rowspan="${m.r1 - m.r0 + 1}"` : '';
    return `<td${attr} style="${css}">${esc(o.v)}</td>`;
  }).join('') + '</tr>').join('');
}

['gap', 'mode', 'num', 'view'].forEach(id => $(id).onchange = refresh);

$('dl').onclick = () => {
  const bytes = buildXlsx(sheets);
  download(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), file.name.replace(/\.[^.]+$/, '') + '.xlsx');
};
