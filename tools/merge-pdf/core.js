/* core.js — logika gabung PDF (pdf-lib). Murni, tanpa DOM, bisa dites di Node. */
const PL = typeof PDFLib !== 'undefined' ? PDFLib : require('../../vendor/pdf-lib/pdf-lib.min.js');
const tick = () => new Promise(r => setTimeout(r, 0));

// getFile(i) → Promise<{ name, buffer }>
async function mergePdfs(count, getFile, onProgress) {
  const out = await PL.PDFDocument.create();
  for (let i = 0; i < count; i++) {
    const { name, buffer } = await getFile(i);
    if (onProgress) { onProgress(i + 1, count); await tick(); }
    let src;
    try { src = await PL.PDFDocument.load(buffer, { updateMetadata: false }); }
    catch (e) { throw new Error(`"${name}": ` + (/encrypt/i.test(e.message) ? 'PDF dilindungi password.' : 'bukan PDF yang valid atau rusak.')); }
    (await out.copyPages(src, src.getPageIndices())).forEach(p => out.addPage(p));
  }
  return out.save();
}

if (typeof module !== 'undefined') module.exports = { mergePdfs };
