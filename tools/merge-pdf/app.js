const list = createFileList($('list'), items => { $('go').disabled = items.length < 2; });
setupDrop($('drop'), $('file'), files => list.add(files.filter(f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name))));

$('go').onclick = async () => {
  const items = list.items.slice();
  $('go').disabled = true;
  try {
    const bytes = await mergePdfs(items.length,
      async i => ({ name: items[i].file.name, buffer: await items[i].file.arrayBuffer() }),
      (i, n) => msg(`Menggabungkan file ${i}/${n}…`));
    download(new Blob([bytes], { type: 'application/pdf' }), 'gabungan.pdf');
    msg(`Selesai: ${items.length} file digabung, ${fmtSize(bytes.length)}.`);
  } catch (e) { msg('Gagal: ' + e.message, true); }
  $('go').disabled = list.items.length < 2;
};
