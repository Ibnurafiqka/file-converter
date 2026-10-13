/* layout.js — menyisipkan navigasi (dan kartu di beranda) dari daftar TOOLS.
   Dipasang di tiap halaman: <script src=".../layout.js" data-root="../../" data-tool="id-tool"></script> */
(function () {
  const s = document.querySelector('script[data-root]');
  const root = s.dataset.root, cur = s.dataset.tool;
  const link = (href, text, cls) => { const a = document.createElement('a'); a.href = href; a.textContent = text; if (cls) a.className = cls; return a; };

  const nav = document.createElement('nav');
  nav.className = 'nav';
  nav.append(link(root, 'Beranda', cur ? '' : 'on'), ...TOOLS.map(t => link(root + t.path, t.name, t.id === cur ? 'on' : '')));
  document.body.prepend(nav);

  const cards = document.getElementById('cards');
  if (cards) TOOLS.forEach(t => {
    const a = link(root + t.path, '', 'card');
    a.innerHTML = '<strong></strong><span></span>';
    a.firstChild.textContent = t.name;
    a.lastChild.textContent = t.desc;
    cards.append(a);
  });
})();
