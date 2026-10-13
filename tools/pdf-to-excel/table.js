/* pdf-table.js — heuristik mengubah teks PDF (pdf.js) menjadi tabel baris × kolom */

// content = hasil page.getTextContent() dari pdf.js
// styleOf(fontName) → true (tebal) | { b, i }; colors = warna per item dari pageTextColors()
function pageItems(content, styleOf, colors) {
  const out = [];
  content.items.forEach((it, k) => {
    if (typeof it.str !== 'string' || !it.str.trim()) return;
    const st = styleOf ? styleOf(it.fontName) : null;
    out.push({ s: it.str, x: it.transform[4], y: it.transform[5], w: it.width || 0, h: it.height || Math.abs(it.transform[3]) || 10, b: st === true || !!(st && st.b), i: !!(st && st.i), fc: colors ? colors[k] || null : null });
  });
  return out;
}

// Kelompokkan item yang sejajar secara vertikal menjadi baris (atas → bawah)
function groupRows(items) {
  const a = items.slice().sort((p, q) => q.y - p.y || p.x - q.x);
  const rows = []; let cur = null;
  for (const it of a) {
    if (cur && Math.abs(cur.y - it.y) <= Math.max(2, cur.h * 0.5)) cur.items.push(it);
    else rows.push(cur = { y: it.y, h: it.h, items: [it] });
  }
  return rows;
}

// Pecah satu baris jadi sel; jarak antar teks > gapMul × tinggi huruf = pindah kolom
// cuts: posisi x garis/tepi kotak; dua teks yang terpisah garis tidak pernah digabung jadi satu sel
function rowCells(row, gapMul, cuts) {
  const it = row.items.slice().sort((a, b) => a.x - b.x);
  const th = Math.max(row.h * gapMul, 3), cells = [];
  for (const t of it) {
    const c = cells[cells.length - 1];
    if (c && t.x - c.x1 < th && !(cuts && cuts.some(x => x >= c.x1 - 1 && x <= t.x + 1))) { c.s += (t.x - c.x1 > row.h * 0.12 ? ' ' : '') + t.s; c.x1 = Math.max(c.x1, t.x + t.w); }
    else cells.push({ s: t.s, x0: t.x, x1: t.x + t.w, y: row.y, h: t.h, b: t.b, i: t.i, fc: t.fc });
  }
  return cells;
}

// Kolom = rentang x yang terisi sel pada baris bertabel (≥ 2 sel); celah kosong = batas kolom
function detectColumns(rowsCells) {
  const iv = [];
  for (const cells of rowsCells) if (cells.length >= 2) for (const c of cells) iv.push([c.x0, c.x1]);
  if (!iv.length) return [[-1e9, 1e9]];
  iv.sort((a, b) => a[0] - b[0]);
  const cols = [iv[0].slice()];
  for (const [a, b] of iv.slice(1)) { const l = cols[cols.length - 1]; if (a <= l[1]) l[1] = Math.max(l[1], b); else cols.push([a, b]); }
  return cols;
}

function colIndex(cols, c) {
  let best = -1, bo = 0;
  cols.forEach((k, i) => { const o = Math.min(c.x1, k[1]) - Math.max(c.x0, k[0]); if (o > bo) { bo = o; best = i; } });
  if (best >= 0) return best;
  let d = Infinity;
  cols.forEach((k, i) => { const dd = Math.min(Math.abs(c.x0 - k[0]), Math.abs(c.x0 - k[1])); if (dd < d) { d = dd; best = i; } });
  return best;
}

function toGrid(rowsCells, cols) {
  const clean = s => s.replace(/\s+/g, ' ').trim();
  return rowsCells.map(cells => {
    const r = new Array(cols.length).fill('');
    for (const c of cells) { const i = colIndex(cols, c); r[i] = r[i] ? r[i] + ' ' + c.s : c.s; }
    return r.map(clean);
  }).filter(r => r.some(v => v !== ''));
}

// pages: array of items per halaman. o = { gapMul, mode: 'all'|'page' } → [{ name, rows }]
function extractSheets(pages, o) {
  const prep = pages.map(items => groupRows(items).map(r => rowCells(r, o.gapMul)));
  if (o.mode === 'page')
    return prep.map((rows, i) => ({ name: 'Hal ' + (i + 1), rows: toGrid(rows, detectColumns(rows)) })).filter(s => s.rows.length);
  const all = [].concat(...prep);
  return [{ name: 'Data', rows: toGrid(all, detectColumns(all)) }];
}

// mode: 'text' (tetap teks) | 'id' (1.234,56) | 'en' (1,234.56). Nol di depan dan angka > 15 digit tetap teks.
function parseNum(s, mode) {
  if (mode === 'id') { if (!/^-?(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$/.test(s)) return null; s = s.replace(/\./g, '').replace(',', '.'); }
  else if (mode === 'en') { if (!/^-?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/.test(s)) return null; s = s.replace(/,/g, ''); }
  else return null;
  if (/^-?0\d/.test(s) || s.replace(/[-.]/g, '').length > 15) return null;
  const n = Number(s);
  return isFinite(n) ? n : null;
}
function applyNumbers(sheets, mode) {
  if (mode === 'text') return sheets;
  return sheets.map(s => ({ name: s.name, rows: s.rows.map(r => r.map(v => { const n = parseNum(v, mode); return n === null ? v : n; })) }));
}

if (typeof module !== 'undefined') module.exports = { pageItems, extractSheets, applyNumbers, parseNum, groupRows, rowCells, detectColumns };
