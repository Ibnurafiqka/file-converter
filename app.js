const $ = id => document.getElementById(id);
const worker = new Worker('worker.js');
let file = null, fileName = 'hasil';

const opts = () => ({ delim: $('delim').value, encoding: $('enc').value, asText: $('asText').checked });
function msg(t, err) { $('msg').textContent = t; $('msg').className = err ? 'err' : ''; }
function setBusy(b) { $('dl').disabled = b || !file; }

function renderPreview(rows) {
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  $('preview').innerHTML = rows
    .map((r, i) => '<tr>' + r.map(v => `<${i ? 'td' : 'th'}>${esc(v)}</${i ? 'td' : 'th'}>`).join('') + '</tr>').join('');
  msg(`${file.name} (${(file.size / 1048576).toFixed(1)} MB) — preview ${rows.length} baris pertama`);
  setBusy(false);
}

function save(blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName + '.xlsx';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

worker.onmessage = ({ data }) => {
  if (data.type === 'preview') renderPreview(data.rows);
  else if (data.type === 'progress') msg(`Memproses… ${Math.round(data.p * 100)}%`);
  else if (data.type === 'done') { save(data.blob); msg(`Selesai: ${data.rows.toLocaleString('id-ID')} baris.`); setBusy(false); }
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

$('drop').onclick = () => $('file').click();
$('file').onchange = e => load(e.target.files[0]);
['dragover', 'dragenter'].forEach(ev => $('drop').addEventListener(ev, e => { e.preventDefault(); $('drop').classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => $('drop').addEventListener(ev, e => { e.preventDefault(); $('drop').classList.remove('over'); }));
$('drop').addEventListener('drop', e => load(e.dataTransfer.files[0]));
['delim', 'enc', 'asText'].forEach(id => $(id).onchange = requestPreview);

$('dl').onclick = () => {
  setBusy(true);
  msg('Memproses… 0%');
  worker.postMessage({ type: 'convert', file, opts: opts() });
};