// Helper ($, msg, setupDrop, download, fmtSize) ada di shared/js/common.js
const worker = new Worker('worker.js');
let file = null, fileName = 'hasil';

const opts = () => ({ delim: $('delim').value, encoding: $('enc').value, asText: $('asText').checked });
function setBusy(b) { $('dl').disabled = b || !file; }

function renderPreview(rows) {
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  $('preview').innerHTML = rows
    .map((r, i) => '<tr>' + r.map(v => `<${i ? 'td' : 'th'}>${esc(v)}</${i ? 'td' : 'th'}>`).join('') + '</tr>').join('');
  msg(`${file.name} (${fmtSize(file.size)}) — preview ${rows.length} baris pertama`);
  setBusy(false);
}

worker.onmessage = ({ data }) => {
  if (data.type === 'preview') renderPreview(data.rows);
  else if (data.type === 'progress') msg(`Memproses… ${Math.round(data.p * 100)}%`);
  else if (data.type === 'done') { download(data.blob, fileName + '.xlsx'); msg(`Selesai: ${data.rows.toLocaleString('id-ID')} baris.`); setBusy(false); }
  else if (data.type === 'error') { msg(data.message, true); setBusy(false); }
};

function requestPreview() { if (file) worker.postMessage({ type: 'preview', file, opts: opts() }); }

function load(f) {
  if (!f) return;
  file = f;
  fileName = f.name.replace(/\.[^.]+$/, '');
  setBusy(true);
  requestPreview();
}

setupDrop($('drop'), $('file'), files => load(files[0]));
['delim', 'enc', 'asText'].forEach(id => $(id).onchange = requestPreview);

$('dl').onclick = () => {
  setBusy(true);
  msg('Memproses… 0%');
  worker.postMessage({ type: 'convert', file, opts: opts() });
};
