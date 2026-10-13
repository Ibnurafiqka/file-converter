/* sheet-layout.js — susun grid Excel yang mengikuti tampilan PDF: warna latar, border, sel gabungan,
   huruf tebal, rata teks, lebar kolom dan tinggi baris. Butuh table.js (groupRows, rowCells, detectColumns, parseNum). */
// fungsi dari table.js: global di browser, require di Node
const LT = typeof groupRows !== 'undefined' ? { groupRows, rowCells, detectColumns, parseNum } : require('./table.js');
const LY_TOL = 1.5;
const lyMin = a => a.reduce((m, v) => v < m ? v : m, Infinity);
const lyMax = a => a.reduce((m, v) => v > m ? v : m, -Infinity);

function lyCluster(vals, tol) {
  const a = vals.slice().sort((p, q) => p - q), out = [];
  let g = [];
  const flush = () => { if (g.length) out.push(g.reduce((s, v) => s + v, 0) / g.length); g = []; };
  for (const v of a) { if (g.length && v - g[g.length - 1] > tol) flush(); g.push(v); }
  flush();
  return out;
}

// kolom dengan overlap terbesar (cadangan: terdekat)
function lyCol(xs, c) {
  for (let j = 0; j + 1 < xs.length; j++) if (c.x0 >= xs[j] - 1 && c.x0 < xs[j + 1] - 0.5) return j;
  let best = -1, bo = 0, d = Infinity, near = 0;
  for (let j = 0; j + 1 < xs.length; j++) {
    const o = Math.min(c.x1, xs[j + 1]) - Math.max(c.x0, xs[j]);
    if (o > bo) { bo = o; best = j; }
    const dd = Math.min(Math.abs(c.x0 - xs[j]), Math.abs(c.x0 - xs[j + 1]));
    if (dd < d) { d = dd; near = j; }
  }
  return best >= 0 ? best : near;
}

// Format angka Excel dari tampilan asli: "1,500" → #,##0 ; "1.500,50" (id) → #,##0.00
function lyNumFmt(v, mode) {
  const dsep = mode === 'id' ? ',' : '.', gsep = mode === 'id' ? '.' : ',';
  const i = v.lastIndexOf(dsep), dec = i >= 0 ? v.length - i - 1 : 0, grouped = v.includes(gsep);
  return !grouped && !dec ? null : (grouped ? '#,##0' : '0') + (dec ? '.' + '0'.repeat(dec) : '');
}

function lyLum(hex) { return 0.299 * parseInt(hex.slice(0, 2), 16) + 0.587 * parseInt(hex.slice(2, 4), 16) + 0.114 * parseInt(hex.slice(4, 6), 16); }

// items: dari pageItems(); gfx: dari pageGraphics(); o = { gapMul, num: 'text'|'id'|'en' } → sheet atau null
function buildLayoutSheet(items, gfx, o) {
  const rects = gfx.rects, lines = gfx.lines;
  const cuts = lyCluster([].concat(...rects.map(r => [r.x0, r.x1]), lines.filter(l => l.v).map(l => l.x0)), LY_TOL);
  const tr = LT.groupRows(items).map(r => ({ y: r.y, h: r.h, cells: LT.rowCells(r, o.gapMul, cuts) }));   // atas → bawah
  const texts = [].concat(...tr.map(r => r.cells));
  if (!texts.length) return null;

  // ---------- sumbu X: batas kolom = tepi grafik ∪ celah antar kolom teks
  const tcols = LT.detectColumns(tr.map(r => r.cells)), hasT = tcols[0][0] > -1e8;
  let hx = cuts.slice();
  const hxAll = hx;
  const vlines = lines.filter(l => l.v);
  const cellRects = (lo, hi) => rects.filter(r => Math.abs(r.x0 - lo) < 2 * LY_TOL && Math.abs(r.x1 - hi) < 2 * LY_TOL).length;
  const ruled = x => tr.filter(t => vlines.some(l => Math.abs(l.x0 - x) < 2 * LY_TOL && t.y >= l.y0 - 1 && t.y <= l.y1 + 1)).length;
  if (hasT) hx = hx.filter(b => !tcols.some(c => b > c[0] + 0.5 && b < c[1] - 0.5));
  let xs = hx.slice();
  if (hasT) for (let i = 0; i + 1 < tcols.length; i++) {
    const a = tcols[i][1], b = tcols[i + 1][0], m = (a + b) / 2;
    if (hx.some(v => v >= a - 0.5 && v <= b + 0.5)) continue;
    // header rata kiri + angka rata kanan dalam satu sel bergambar → itu satu kolom, bukan dua
    const lo = lyMax(hxAll.filter(v => v <= m)), hi = lyMin(hxAll.filter(v => v > m));
    if (isFinite(lo) && isFinite(hi) && (cellRects(lo, hi) >= 2 || (ruled(lo) >= 2 && ruled(hi) >= 2))) continue;
    xs.push(m);
  }
  const minX = Math.min(lyMin(texts.map(c => c.x0)), lyMin(rects.map(r => r.x0)), lyMin(lines.map(l => l.x0)));
  const maxX = Math.max(lyMax(texts.map(c => c.x1)), lyMax(rects.map(r => r.x1)), lyMax(lines.map(l => l.x1)));
  xs = lyCluster(xs, LY_TOL);
  if (!xs.length || minX < xs[0] - LY_TOL) xs.unshift(minX);
  if (maxX > xs[xs.length - 1] + LY_TOL) xs.push(maxX);
  if (xs.length < 2) xs = [minX, maxX + 1];
  const nC = xs.length - 1;

  // ---------- sumbu Y: pita (band) dari garis/kotak; teks di dalam pita dipecah jadi baris bila perlu
  const hy = lyCluster([].concat(...rects.map(r => [r.y0, r.y1]), lines.filter(l => !l.v).map(l => l.y0)), LY_TOL);
  const yTop = Math.max(lyMax(tr.map(r => r.y + 0.8 * r.h)), lyMax(rects.map(r => r.y1)), lyMax(lines.map(l => l.y1)));
  const yBot = Math.min(lyMin(tr.map(r => r.y - 0.25 * r.h)), lyMin(rects.map(r => r.y0)), lyMin(lines.map(l => l.y0)));
  const bnd = hy.map(y => ({ y, hard: true }));
  if (!bnd.length || yTop > bnd[bnd.length - 1].y + LY_TOL) bnd.push({ y: yTop, hard: false });
  if (yBot < bnd[0].y - LY_TOL) bnd.unshift({ y: yBot, hard: false });
  bnd.reverse();                                                   // atas → bawah
  const bands = [];
  for (let i = 0; i + 1 < bnd.length; i++) bands.push({ top: bnd[i].y, bot: bnd[i + 1].y, bounded: bnd[i].hard && bnd[i + 1].hard, tr: [] });
  if (!bands.length) bands.push({ top: yTop, bot: yBot - 1, bounded: false, tr: [] });
  let bi = 0;
  for (const t of tr) {
    const cy = t.y + 0.3 * t.h;
    while (bi + 1 < bands.length && cy < bands[bi].bot - 0.01) bi++;
    bands[bi].tr.push(t);
  }
  const rows = [];                                                 // { top, bot, lines: [textRow] }
  for (const b of bands) {
    const T = b.tr, multi = T.filter(t => t.cells.length >= 2).length;
    if (T.length <= 1 || (b.bounded && multi <= 1 && T.length <= 6)) rows.push({ top: b.top, bot: b.bot, lines: T });
    else T.forEach((t, i) => {
      const top = i ? ((T[i - 1].y - 0.25 * T[i - 1].h) + (t.y + 0.8 * t.h)) / 2 : b.top;
      const bot = i + 1 < T.length ? ((t.y - 0.25 * t.h) + (T[i + 1].y + 0.8 * T[i + 1].h)) / 2 : b.bot;
      rows.push({ top, bot, lines: [t] });
    });
  }
  const nR = rows.length, ys = rows.map(r => r.top).concat(rows[nR - 1].bot);   // menurun
  const cx = c => (xs[c] + xs[c + 1]) / 2, cyr = r => (ys[r] + ys[r + 1]) / 2;

  // ---------- isi teks
  const g = Array.from({ length: nR }, () => Array.from({ length: nC }, () => ({ parts: [], bg: null, bd: {} })));
  rows.forEach((row, ri) => row.lines.forEach((ln, li) => ln.cells.forEach(c => g[ri][lyCol(xs, c)].parts.push({ c, li }))));

  // ---------- rentang sel yang tertutup sebuah kotak
  const range = rc => {
    let r0 = -1, r1 = -1, c0 = -1, c1 = -1;
    for (let c = 0; c < nC; c++) { const m = cx(c); if (m >= rc.x0 && m <= rc.x1) { if (c0 < 0) c0 = c; c1 = c; } }
    for (let r = 0; r < nR; r++) { const m = cyr(r); if (m >= rc.y0 && m <= rc.y1) { if (r0 < 0) r0 = r; r1 = r; } }
    return r0 < 0 || c0 < 0 ? null : { r0, r1, c0, c1 };
  };

  // ---------- warna latar (urutan gambar: yang terakhir menimpa)
  const ranges = rects.map(range);
  rects.forEach((rc, i) => { const q = ranges[i]; if (q && rc.fill) for (let r = q.r0; r <= q.r1; r++) for (let c = q.c0; c <= q.c1; c++) g[r][c].bg = rc.fill; });

  // ---------- border: tiap garis ditempelkan ke sisi sel yang dilaluinya
  const snap = (arr, v) => { let b = -1, d = 2.5; arr.forEach((a, k) => { if (Math.abs(a - v) < d) { d = Math.abs(a - v); b = k; } }); return b; };
  for (const l of lines) {
    if (l.v) {
      const k = snap(xs, l.x0);
      if (k < 0) continue;
      for (let r = 0; r < nR; r++) { const m = cyr(r); if (m >= l.y0 - LY_TOL && m <= l.y1 + LY_TOL) { if (k < nC) g[r][k].bd.l = l.color; if (k > 0) g[r][k - 1].bd.r = l.color; } }
    } else {
      const k = snap(ys, l.y0);
      if (k < 0) continue;
      for (let c = 0; c < nC; c++) { const m = cx(c); if (m >= l.x0 - LY_TOL && m <= l.x1 + LY_TOL) { if (k < nR) g[k][c].bd.t = l.color; if (k > 0) g[k - 1][c].bd.b = l.color; } }
    }
  }

  // ---------- sel gabungan: satu kotak yang menutup ≥ 2 sel dan berisi ≤ 1 teks (bukan pita latar)
  const own = Array.from({ length: nR }, () => new Array(nC).fill(false)), merges = [];
  const txt = (r, c) => g[r][c].parts.length > 0;
  rects.forEach((rc, i) => {
    const q = ranges[i];
    if (!q) return;
    const cnt = (q.r1 - q.r0 + 1) * (q.c1 - q.c0 + 1);
    if (cnt < 2 || cnt >= 0.9 * nR * nC) return;
    let nt = 0, used = false;
    for (let r = q.r0; r <= q.r1; r++) for (let c = q.c0; c <= q.c1; c++) { if (txt(r, c)) nt++; if (own[r][c]) used = true; }
    if (nt > 1 || used) return;
    for (let r = q.r0; r <= q.r1; r++) for (let c = q.c0; c <= q.c1; c++) {
      own[r][c] = true;
      if ((r !== q.r0 || c !== q.c0) && txt(r, c)) { g[q.r0][q.c0].parts = g[r][c].parts; g[r][c].parts = []; }
    }
    merges.push({ r0: q.r0, c0: q.c0, r1: q.r1, c1: q.c1 });
  });

  // ---------- sel gabungan dari garis (tanpa kotak): sel yang tak dipisah garis membentuk satu wilayah;
  // diterima hanya jika wilayahnya persegi dan KELILINGNYA bergaris penuh (area tanpa garis tidak pernah tergabung)
  {
    const par = Array.from({ length: nR * nC }, (_, i) => i), id = (r, c) => r * nC + c;
    const find = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
    const union = (x, y) => { par[find(x)] = find(y); };
    for (let r = 0; r < nR; r++) for (let c = 0; c < nC; c++) {
      if (c + 1 < nC && !g[r][c].bd.r && !g[r][c + 1].bd.l) union(id(r, c), id(r, c + 1));
      if (r + 1 < nR && !g[r][c].bd.b && !g[r + 1][c].bd.t) union(id(r, c), id(r + 1, c));
    }
    const regs = new Map();
    for (let r = 0; r < nR; r++) for (let c = 0; c < nC; c++) {
      const k = find(id(r, c)), q = regs.get(k);
      if (!q) regs.set(k, { r0: r, r1: r, c0: c, c1: c, n: 1 });
      else { q.r1 = r; q.c0 = Math.min(q.c0, c); q.c1 = Math.max(q.c1, c); q.n++; }
    }
    for (const q of regs.values()) {
      const w = q.c1 - q.c0 + 1, h = q.r1 - q.r0 + 1;
      if (w * h < 2 || q.n !== w * h) continue;
      let top = 0, bot = 0, lef = 0, rig = 0, used = false, bad = false, rowsT = 0;
      for (let c = q.c0; c <= q.c1; c++) { if (g[q.r0][c].bd.t) top++; if (g[q.r1][c].bd.b) bot++; }
      for (let r = q.r0; r <= q.r1; r++) { if (g[r][q.c0].bd.l) lef++; if (g[r][q.c1].bd.r) rig++; }
      if (top < 0.9 * w || bot < 0.9 * w || lef < 0.9 * h || rig < 0.9 * h) continue;
      for (let r = q.r0; r <= q.r1; r++) {
        let k = 0;
        for (let c = q.c0; c <= q.c1; c++) { if (own[r][c]) used = true; if (g[r][c].parts.length) k++; }
        if (k > 1) bad = true;
        if (k) rowsT++;
      }
      if (used || bad || rowsT > 10) continue;                      // ≥ 2 teks sebaris = kolom terpisah, bukan satu sel
      for (let r = q.r0; r <= q.r1; r++) for (let c = q.c0; c <= q.c1; c++) {
        own[r][c] = true;
        if (r !== q.r0 || c !== q.c0) { for (const p of g[r][c].parts) g[q.r0][q.c0].parts.push({ c: p.c, li: p.li + (r - q.r0) * 100 }); g[r][c].parts = []; }
      }
      merges.push({ r0: q.r0, c0: q.c0, r1: q.r1, c1: q.c1 });
    }
  }

  // ---------- teks rata tengah yang melebar ke kolom kosong (mis. subjudul tanpa kotak) → gabungkan
  for (let r = 0; r < nR; r++) for (let c = 0; c < nC; c++) {
    const cell = g[r][c];
    if (own[r][c] || cell.parts.length !== 1) continue;
    const t = cell.parts[0].c;
    let e0 = c;
    while (e0 + 1 < nC && t.x1 > xs[e0 + 1] + 1) e0++;
    if (e0 === c && t.x0 >= xs[c] - 1) continue;                      // tidak melebar dari kolomnya
    let free = true;
    for (let k = c + 1; k <= e0; k++) if (own[r][k] || g[r][k].parts.length) free = false;
    if (!free) continue;
    let best = null;
    for (let a = c; a >= 0; a--) {
      if (a < c && (own[r][a] || g[r][a].parts.length)) break;
      for (let e = e0; e < nC; e++) {
        if (e > e0 && (own[r][e] || g[r][e].parts.length)) break;
        const lm = t.x0 - xs[a], rm = xs[e + 1] - t.x1, diff = Math.abs(lm - rm);
        if (lm < 6 || rm < 6 || diff > Math.max(3, 0.03 * (xs[e + 1] - xs[a]))) continue;
        if (!best || diff < best.diff - 0.5 || (Math.abs(diff - best.diff) <= 0.5 && e - a > best.e - best.a)) best = { a, e, diff };
      }
    }
    if (!best) continue;
    for (let k = best.a; k <= best.e; k++) own[r][k] = true;
    if (best.a !== c) { g[r][best.a].parts = cell.parts; cell.parts = []; }
    merges.push({ r0: r, c0: best.a, r1: r, c1: best.e });
  }

  // ---------- hasil: nilai + style per sel
  const mAt = {};
  merges.forEach(m => { mAt[m.r0 + ',' + m.c0] = m; });
  const sheetRows = [], rowHeights = [];
  for (let r = 0; r < nR; r++) {
    const out = [];
    let busy = false;
    for (let c = 0; c < nC; c++) {
      const cell = g[r][c], st = {};
      if (cell.bg) st.bg = cell.bg;
      if (cell.bd.l) st.bl = cell.bd.l; if (cell.bd.r) st.br = cell.bd.r; if (cell.bd.t) st.bt = cell.bd.t; if (cell.bd.b) st.bb = cell.bd.b;
      let v = '';
      if (cell.parts.length) {
        const byLine = {};
        cell.parts.forEach(p => { (byLine[p.li] = byLine[p.li] || []).push(p.c.s); });
        v = Object.keys(byLine).sort((a, b) => a - b).map(k => byLine[k].join(' ').replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
        const cs = cell.parts.map(p => p.c), m = mAt[r + ',' + c];
        if (cs[0].b) st.b = true;
        if (cs[0].i) st.i = true;
        st.sz = Math.max(6, Math.min(36, Math.round(lyMax(cs.map(t => t.h)))));
        if (v.includes('\n')) st.wrap = true;
        const X0 = xs[c], X1 = xs[m ? m.c1 + 1 : c + 1], lm = lyMin(cs.map(t => t.x0)) - X0, rm = X1 - lyMax(cs.map(t => t.x1));
        if (cs.length === 1 && !st.wrap) {
          if (Math.abs(lm - rm) <= Math.max(3, 0.06 * (X1 - X0)) && lm > 6) st.al = 'center';
          else if (rm < lm * 0.5 && rm < 12) st.al = 'right';
        }
        if (cs[0].fc && cs[0].fc !== '000000') st.fc = cs[0].fc;
        else if (!cs[0].fc && cell.bg && lyLum(cell.bg) < 128) st.fc = 'FFFFFF';
        if (o.num && o.num !== 'text' && !st.wrap) { const n = LT.parseNum(v, o.num); if (n !== null) { const nf = lyNumFmt(v, o.num); if (nf) st.nf = nf; v = n; if (!st.al) st.al = 'left'; } }
      }
      if (v !== '' || Object.keys(st).length) busy = true;
      out.push(v === '' && !Object.keys(st).length ? '' : { v, st });
    }
    sheetRows.push(out);
    const h = ys[r] - ys[r + 1];
    rowHeights.push(Math.max(6, Math.min(400, busy ? h : Math.min(h, 12))));
  }
  const colWidths = xs.slice(1).map((x, c) => Math.max(1, Math.min(255, (x - xs[c]) * 0.19 - 0.5)));
  return { rows: sheetRows, merges, colWidths, rowHeights };
}

if (typeof module !== 'undefined') module.exports = { buildLayoutSheet };
