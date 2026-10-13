/* worker.js — streaming CSV → XLSX (tanpa SheetJS, tidak membekukan halaman) */
if (typeof importScripts === 'function') importScripts('../../vendor/fflate/fflate.js');
const FF = typeof fflate !== 'undefined' ? fflate : require('../../vendor/fflate/fflate.js');

const MAX_ROWS = 1048576, MAX_COLS = 16384, MAX_CELL = 32767;
const NUM_RE = /^-?(0|[1-9]\d{0,14})(\.\d+)?$/;
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const enc = new TextEncoder();

const colCache = [];
function colName(i) {
  if (colCache[i]) return colCache[i];
  let n = i + 1, s = '';
  while (n > 0) { s = String.fromCharCode(65 + (n - 1) % 26) + s; n = Math.floor((n - 1) / 26); }
  return (colCache[i] = s);
}

const BAD = /[&<>\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;
const escXml = s => s.replace(BAD, c => c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '');

function detectDelim(text) {
  const line = text.split(/\r?\n/).find(l => l.trim()) || '';
  const c = { ',': 0, ';': 0, '\t': 0, '|': 0 };
  for (const ch of line) if (ch in c) c[ch]++;
  return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0];
}

// Parser CSV bertahap (aman untuk potongan data, tanda kutip, dan baris baru di dalam sel)
function createParser(delim, onRow) {
  let field = '', row = [], inQ = false, qp = false, skipLF = false;
  const endRow = () => { if (row.length || field !== '') { row.push(field); onRow(row); } row = []; field = ''; };
  return {
    push(text) {
      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (skipLF) { skipLF = false; if (c === '\n') continue; }
        if (inQ) {
          if (qp) { qp = false; if (c === '"') { field += '"'; continue; } inQ = false; }
          else if (c === '"') { qp = true; continue; }
          else { field += c; continue; }
        }
        if (c === '"' && field === '') inQ = true;
        else if (c === delim) { row.push(field); field = ''; }
        else if (c === '\n') endRow();
        else if (c === '\r') { endRow(); skipLF = true; }
        else field += c;
      }
    },
    end() { inQ = false; qp = false; endRow(); }
  };
}

function rowXml(r, cells, asText) {
  if (cells.length > MAX_COLS) throw new Error(`Baris ${r} punya ${cells.length} kolom (batas Excel ${MAX_COLS}).`);
  let x = '<row r="' + r + '">';
  for (let i = 0; i < cells.length; i++) {
    let v = cells[i];
    if (v === '') continue;
    const ref = colName(i) + r;
    if (!asText && NUM_RE.test(v)) x += `<c r="${ref}"><v>${v}</v></c>`;
    else {
      if (v.length > MAX_CELL) v = v.slice(0, MAX_CELL);
      x += `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escXml(v)}</t></is></c>`;
    }
  }
  return x + '</row>';
}

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const OD = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

async function convertStream(stream, size, opts, onProgress) {
  const parts = [];
  let rows = 0;
  const zip = new FF.Zip((err, chunk) => { if (err) throw err; parts.push(chunk); });
  const addText = (name, s) => { const f = new FF.ZipDeflate(name, { level: 6 }); zip.add(f); f.push(enc.encode(s), true); };

  addText('[Content_Types].xml', XML + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
  addText('_rels/.rels', XML + `<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${OD}/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  addText('xl/workbook.xml', XML + `<workbook xmlns="${NS}" xmlns:r="${OD}"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  addText('xl/_rels/workbook.xml.rels', XML + `<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${OD}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`);

  const sheet = new FF.ZipDeflate('xl/worksheets/sheet1.xml', { level: 1 });
  zip.add(sheet);
  let buf = XML + `<worksheet xmlns="${NS}"><sheetData>`;

  const onRow = cells => {
    if (++rows > MAX_ROWS) throw new Error(`Jumlah baris melebihi batas Excel (${MAX_ROWS.toLocaleString('id-ID')}).`);
    buf += rowXml(rows, cells, opts.asText);
    if (buf.length > (1 << 19)) { sheet.push(enc.encode(buf), false); buf = ''; }
  };

  const reader = stream.getReader();
  const dec = new TextDecoder(opts.encoding || 'utf-8');
  let parser = null, read = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      read += value.length;
      const text = dec.decode(value, { stream: true });
      if (!text) continue;
      if (!parser) parser = createParser(opts.delim || detectDelim(text), onRow);
      parser.push(text);
      if (onProgress) onProgress(size ? read / size : 0);
    }
    if (!parser) parser = createParser(',', onRow);
    parser.push(dec.decode());
    parser.end();
  } catch (e) { reader.cancel().catch(() => {}); throw e; }

  if (!rows) throw new Error('File kosong.');
  buf += '</sheetData></worksheet>';
  sheet.push(enc.encode(buf), true);
  zip.end();
  return { parts, rows };
}

async function preview(file, opts, limit = 20) {
  const LIM = 1 << 19;
  const text = new TextDecoder(opts.encoding || 'utf-8').decode(await file.slice(0, LIM).arrayBuffer());
  const out = [];
  const p = createParser(opts.delim || detectDelim(text), r => { if (out.length < limit) out.push(r.slice(0, 50)); });
  p.push(text);
  if (file.size <= LIM) p.end();
  return out;
}

if (typeof importScripts === 'function') {
  self.onmessage = async ({ data }) => {
    try {
      if (data.type === 'preview') {
        self.postMessage({ type: 'preview', rows: await preview(data.file, data.opts) });
      } else {
        let last = 0;
        const { parts, rows } = await convertStream(data.file.stream(), data.file.size, data.opts, p => {
          const now = Date.now();
          if (now - last > 150) { last = now; self.postMessage({ type: 'progress', p }); }
        });
        self.postMessage({ type: 'done', rows, blob: new Blob(parts, { type: XLSX_MIME }) });
      }
    } catch (e) { self.postMessage({ type: 'error', message: e.message }); }
  };
}
if (typeof module !== 'undefined') module.exports = { convertStream, preview, createParser };
