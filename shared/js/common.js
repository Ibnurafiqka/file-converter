/* common.js — helper bersama untuk halaman fitur PDF */
const $ = id => document.getElementById(id);
function msg(t, err) { const m = $('msg'); m.textContent = t; m.className = err ? 'err' : ''; }
function fmtSize(b) { return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' kB'; }
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
function setupDrop(drop, input, onFiles) {
  drop.onclick = () => input.click();
  input.onchange = e => { onFiles([...e.target.files]); input.value = ''; };
  ['dragover', 'dragenter'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => onFiles([...e.dataTransfer.files]));
}
// Daftar file yang bisa diurutkan (↑ ↓) dan dihapus (✕)
function createFileList(ul, onChange) {
  const items = [];
  function render() {
    ul.innerHTML = '';
    items.forEach((it, i) => {
      const li = document.createElement('li');
      li.innerHTML = '<span class="nm"></span><span class="sz"></span><button class="sm" data-a="up">↑</button><button class="sm" data-a="down">↓</button><button class="sm" data-a="rm">✕</button>';
      li.querySelector('.nm').textContent = (i + 1) + '. ' + it.file.name;
      li.querySelector('.sz').textContent = fmtSize(it.file.size);
      li.onclick = e => {
        const a = e.target.dataset.a;
        if (!a) return;
        if (a === 'up' && i > 0) [items[i - 1], items[i]] = [items[i], items[i - 1]];
        else if (a === 'down' && i < items.length - 1) [items[i + 1], items[i]] = [items[i], items[i + 1]];
        else if (a === 'rm') items.splice(i, 1);
        render(); onChange(items);
      };
      ul.appendChild(li);
    });
  }
  return {
    items,
    add(files) { files.forEach(file => items.push({ file })); render(); onChange(items); },
    clear() { items.length = 0; render(); onChange(items); }
  };
}
