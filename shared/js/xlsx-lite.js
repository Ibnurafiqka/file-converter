/* xlsx-lite.js — penulis XLSX kecil (di memori): banyak sheet, style (warna, border, tebal, rata), sel gabungan, lebar kolom/tinggi baris.
   Sel boleh berupa string | number | { v, st } dengan st = { b, i, sz, nf, fc, bg, al, wrap, bl, br, bt, bb } (warna = 'RRGGBB'). */
const FFL = typeof fflate !== 'undefined' ? fflate : require('../../vendor/fflate/fflate.js');
const X_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const X_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const X_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const X_OD = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

const escXml = s => String(s).replace(/[&<>"\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] || ''));

function xlCol(i) { let n = i + 1, s = ''; while (n > 0) { s = String.fromCharCode(65 + (n - 1) % 26) + s; n = Math.floor((n - 1) / 26); } return s; }

// Registri style: font/fill/border/xf unik → indeks
function makeStyles() {
  const fonts = ['<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>'];
  const fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  const borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>'];
  const xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  const nfs = [], memo = new Map();
  const idx = (arr, xml) => { let i = arr.indexOf(xml); if (i < 0) { arr.push(xml); i = arr.length - 1; } return i; };
  const side = (n, c) => c ? `<${n} style="thin"><color rgb="FF${c}"/></${n}>` : `<${n}/>`;
  return {
    id(st) {
      if (!st) return 0;
      const key = JSON.stringify(st);
      if (memo.has(key)) return memo.get(key);
      const f = idx(fonts, `<font>${st.b ? '<b/>' : ''}${st.i ? '<i/>' : ''}<sz val="${st.sz || 11}"/>${st.fc ? `<color rgb="FF${st.fc}"/>` : ''}<name val="Calibri"/><family val="2"/></font>`);
      const fl = st.bg ? idx(fills, `<fill><patternFill patternType="solid"><fgColor rgb="FF${st.bg}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
      const bd = (st.bl || st.br || st.bt || st.bb) ? idx(borders, `<border>${side('left', st.bl)}${side('right', st.br)}${side('top', st.bt)}${side('bottom', st.bb)}<diagonal/></border>`) : 0;
      const al = `<alignment${st.al ? ` horizontal="${st.al}"` : ''} vertical="center"${st.wrap ? ' wrapText="1"' : ''}/>`;
      const nf = st.nf ? 164 + idx(nfs, st.nf) : 0;
      const i = idx(xfs, `<xf numFmtId="${nf}" fontId="${f}" fillId="${fl}" borderId="${bd}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"${nf ? ' applyNumberFormat="1"' : ''}>${al}</xf>`);
      memo.set(key, i);
      return i;
    },
    xml() {
      const blk = (t, a) => `<${t} count="${a.length}">${a.join('')}</${t}>`;
      return X_HEAD + `<styleSheet xmlns="${X_NS}">${nfs.length ? `<numFmts count="${nfs.length}">${nfs.map((c, k) => `<numFmt numFmtId="${164 + k}" formatCode="${escXml(c)}"/>`).join('')}</numFmts>` : ''}${blk('fonts', fonts)}${blk('fills', fills)}${blk('borders', borders)}<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>${blk('cellXfs', xfs)}<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
    }
  };
}

function sheetXml(sh, reg) {
  const rows = sh.rows;
  let x = X_HEAD + `<worksheet xmlns="${X_NS}">`;
  if (sh.colWidths) x += '<cols>' + sh.colWidths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${(+w).toFixed(2)}" customWidth="1"/>`).join('') + '</cols>';
  x += '<sheetData>';
  rows.forEach((row, r) => {
    const ht = sh.rowHeights && sh.rowHeights[r];
    x += `<row r="${r + 1}"${ht ? ` ht="${(+ht).toFixed(1)}" customHeight="1"` : ''}>`;
    row.forEach((cell, c) => {
      const o = cell !== null && typeof cell === 'object' ? cell : { v: cell };
      const has = !(o.v === '' || o.v == null);
      const s = o.st ? reg.id(o.st) : 0;
      if (!has && !s) return;
      const ref = xlCol(c) + (r + 1), sa = s ? ` s="${s}"` : '';
      if (!has) x += `<c r="${ref}"${sa}/>`;
      else if (typeof o.v === 'number') x += `<c r="${ref}"${sa}><v>${o.v}</v></c>`;
      else x += `<c r="${ref}"${sa} t="inlineStr"><is><t xml:space="preserve">${escXml(String(o.v).slice(0, 32767))}</t></is></c>`;
    });
    x += '</row>';
  });
  x += '</sheetData>';
  if (sh.merges && sh.merges.length)
    x += `<mergeCells count="${sh.merges.length}">` + sh.merges.map(m => `<mergeCell ref="${xlCol(m.c0)}${m.r0 + 1}:${xlCol(m.c1)}${m.r1 + 1}"/>`).join('') + '</mergeCells>';
  return x + '</worksheet>';
}

// sheets: [{ name, rows, merges?: [{r0,c0,r1,c1}], colWidths?, rowHeights? }] → Uint8Array (.xlsx)
function buildXlsx(sheets) {
  const enc = new TextEncoder(), f = {}, used = new Set(), reg = makeStyles();
  const names = sheets.map((s, i) => {
    let n = (s.name || 'Sheet' + (i + 1)).replace(/[\[\]:*?\/\\]/g, '').slice(0, 28) || 'Sheet' + (i + 1), k = 2, base = n;
    while (used.has(n.toLowerCase())) n = base + ' ' + k++;
    used.add(n.toLowerCase());
    return n;
  });
  sheets.forEach((s, i) => { f[`xl/worksheets/sheet${i + 1}.xml`] = enc.encode(sheetXml(s, reg)); });
  f['xl/styles.xml'] = enc.encode(reg.xml());
  f['[Content_Types].xml'] = enc.encode(X_HEAD + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
    + sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '</Types>');
  f['_rels/.rels'] = enc.encode(X_HEAD + `<Relationships xmlns="${X_REL}"><Relationship Id="rId1" Type="${X_OD}/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  f['xl/workbook.xml'] = enc.encode(X_HEAD + `<workbook xmlns="${X_NS}" xmlns:r="${X_OD}"><sheets>`
    + names.map((n, i) => `<sheet name="${escXml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>');
  f['xl/_rels/workbook.xml.rels'] = enc.encode(X_HEAD + `<Relationships xmlns="${X_REL}">`
    + sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${X_OD}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
    + `<Relationship Id="rId${sheets.length + 1}" Type="${X_OD}/styles" Target="styles.xml"/></Relationships>`);
  return FFL.zipSync(f, { level: 6 });
}

if (typeof module !== 'undefined') module.exports = { buildXlsx };
