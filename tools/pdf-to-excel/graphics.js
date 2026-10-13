/* graphics.js — baca kotak berwarna (latar sel) dan garis (border) dari operator list pdf.js.
   Hasil: { rects: [{x0,y0,x1,y1,fill|null,stroked}], lines: [{x0,y0,x1,y1,v,color}] } dalam koordinat halaman PDF (y ke atas). */
function pageGraphics(ol, OPS, view) {
  const pageArea = (view[2] - view[0]) * (view[3] - view[1]);
  const out = { rects: [], lines: [] }, seen = new Set(), stack = [];
  let ctm = [1, 0, 0, 1, 0, 0], fc = '000000', sc = '000000', sub = [], cur = null;

  const hex = a => [a[0], a[1], a[2]].map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
  const mul = (m, n) => [m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3], m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5]];
  const tf = (x, y) => [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]];
  const near = (a, b) => Math.abs(a - b) < 0.05;
  const r2 = v => Math.round(v * 2) / 2;

  function addLine(x0, y0, x1, y1, color) {
    if (color === 'FFFFFF') return;
    const v = Math.abs(x1 - x0) < Math.abs(y1 - y0);
    if (Math.hypot(x1 - x0, y1 - y0) < 2) return;
    const l = v ? { x0: (x0 + x1) / 2, x1: (x0 + x1) / 2, y0: Math.min(y0, y1), y1: Math.max(y0, y1), v, color }
                : { y0: (y0 + y1) / 2, y1: (y0 + y1) / 2, x0: Math.min(x0, x1), x1: Math.max(x0, x1), v, color };
    const k = 'l' + v + r2(l.x0) + ',' + r2(l.y0) + ',' + r2(l.x1) + ',' + r2(l.y1) + color;
    if (!seen.has(k)) { seen.add(k); out.lines.push(l); }
  }
  function addRect(x0, y0, x1, y1, fill, stroked) {
    if ((!fill && !stroked) || (x1 - x0) * (y1 - y0) > 0.9 * pageArea) return;
    const k = 'r' + r2(x0) + ',' + r2(y0) + ',' + r2(x1) + ',' + r2(y1) + (fill || '') + stroked;
    if (!seen.has(k)) { seen.add(k); out.rects.push({ x0, y0, x1, y1, fill, stroked }); }
  }

  function paint(doFill, doStroke) {
    for (const p of sub) {
      const pts = p.pts;
      if (pts.length < 2) continue;
      const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      const isRect = !p.curved && (pts.length === 4 || (pts.length === 5 && near(pts[0][0], pts[4][0]) && near(pts[0][1], pts[4][1])))
        && pts.every(q => (near(q[0], x0) || near(q[0], x1)) && (near(q[1], y0) || near(q[1], y1)));
      if (isRect) {
        const w = x1 - x0, h = y1 - y0;
        if (Math.min(w, h) < 1.6) {                        // garis tipis (border digambar sebagai kotak/stroke)
          if (doFill) addLine(x0, y0, x1, y1, fc);
          else if (doStroke) addLine(x0, y0, x1, y1, sc);
        } else {
          addRect(x0, y0, x1, y1, doFill && fc !== 'FFFFFF' ? fc : null, doStroke);
          if (doStroke) { addLine(x0, y0, x1, y0, sc); addLine(x0, y1, x1, y1, sc); addLine(x0, y0, x0, y1, sc); addLine(x1, y0, x1, y1, sc); }
        }
      } else if (p.curved) {
        if (doFill && p.closed && x1 - x0 > 1.6 && y1 - y0 > 1.6) addRect(x0, y0, x1, y1, fc !== 'FFFFFF' ? fc : null, false);
      } else if (doStroke) {
        const n = pts.length;
        for (let i = 0; i < n - 1 || (p.closed && i < n); i++) {
          const a = pts[i], b = pts[(i + 1) % n];
          if (near(a[0], b[0]) || near(a[1], b[1])) addLine(a[0], a[1], b[0], b[1], sc);
        }
      }
    }
  }

  const PAINT = {
    [OPS.fill]: [1, 0], [OPS.eoFill]: [1, 0], [OPS.stroke]: [0, 1], [OPS.closeStroke]: [0, 1],
    [OPS.fillStroke]: [1, 1], [OPS.eoFillStroke]: [1, 1], [OPS.closeFillStroke]: [1, 1], [OPS.closeEOFillStroke]: [1, 1]
  };

  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i], a = ol.argsArray[i];
    if (fn === OPS.save) stack.push({ ctm: ctm.slice(), fc, sc });
    else if (fn === OPS.restore) { const s = stack.pop(); if (s) { ctm = s.ctm; fc = s.fc; sc = s.sc; } }
    else if (fn === OPS.transform) ctm = mul(a, ctm);
    else if (fn === OPS.setFillRGBColor) fc = hex(a);
    else if (fn === OPS.setStrokeRGBColor) sc = hex(a);
    else if (fn === OPS.constructPath) {
      const ops = a[0], co = a[1]; let k = 0;
      for (const op of ops) {
        if (op === OPS.moveTo) { cur = { pts: [tf(co[k], co[k + 1])] }; sub.push(cur); k += 2; }
        else if (op === OPS.lineTo) { if (cur) cur.pts.push(tf(co[k], co[k + 1])); k += 2; }
        else if (op === OPS.curveTo) { if (cur) { cur.curved = true; cur.pts.push(tf(co[k + 4], co[k + 5])); } k += 6; }
        else if (op === OPS.curveTo2 || op === OPS.curveTo3) { if (cur) { cur.curved = true; cur.pts.push(tf(co[k + 2], co[k + 3])); } k += 4; }
        else if (op === OPS.closePath) { if (cur) cur.closed = true; }
        else if (op === OPS.rectangle) { const x = co[k], y = co[k + 1], w = co[k + 2], h = co[k + 3]; sub.push({ pts: [tf(x, y), tf(x + w, y), tf(x + w, y + h), tf(x, y + h)], closed: true }); cur = null; k += 4; }
      }
    } else if (PAINT[fn]) { if (fn === OPS.closeStroke && cur) cur.closed = true; paint(PAINT[fn][0], PAINT[fn][1]); sub = []; cur = null; }
    else if (fn === OPS.endPath) { sub = []; cur = null; }
  }
  return out;
}

// Warna teks: telusuri operator show-text bersama warna isi saat itu → { chars, colors } (tanpa spasi)
function pageTextColors(ol, OPS) {
  let fc = '000000'; const stack = [], chars = [], colors = [];
  const hex = a => [a[0], a[1], a[2]].map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
  const SHOW = new Set([OPS.showText, OPS.showSpacedText, OPS.nextLineShowText, OPS.nextLineSetSpacingShowText]);
  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i], a = ol.argsArray[i];
    if (fn === OPS.save) stack.push(fc);
    else if (fn === OPS.restore) { if (stack.length) fc = stack.pop(); }
    else if (fn === OPS.setFillRGBColor) fc = hex(a);
    else if (SHOW.has(fn)) {
      const glyphs = fn === OPS.nextLineSetSpacingShowText ? a[2] : a[0];
      for (const g of glyphs || []) if (g && typeof g === 'object' && typeof g.unicode === 'string')
        for (const ch of g.unicode) if (!/\s/.test(ch)) { chars.push(ch); colors.push(fc); }
    }
  }
  return { chars: chars.join(''), colors };
}
// Cocokkan item getTextContent (berurutan) dengan deret karakter → warna per item (null = tidak diketahui)
function colorItems(items, runs) {
  let p = 0;
  return items.map(it => {
    const t = typeof it.str === 'string' ? it.str.replace(/\s+/g, '') : '';
    if (!t) return null;
    const idx = runs.chars.indexOf(t.slice(0, 6), p);
    if (idx < 0 || idx - p > 400) return null;
    p = idx + t.length;
    return runs.colors[idx];
  });
}

if (typeof module !== 'undefined') module.exports = { pageGraphics, pageTextColors, colorItems };
