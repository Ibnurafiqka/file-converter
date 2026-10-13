# Internal Tools

Kumpulan alat konversi internal berbasis **web statis** (HTML + JS biasa, tanpa build step).
Semua proses jalan di browser pengguna; tidak ada backend dan tidak ada data yang diunggah.

| Tool | Folder | Teknologi |
|---|---|---|
| CSV → Excel | `tools/csv-to-excel/` | Web Worker + streaming + fflate (file besar, ±1 juta baris) |
| Gambar → PDF | `tools/image-to-pdf/` | pdf-lib + canvas |
| Gabung PDF | `tools/merge-pdf/` | pdf-lib |
| Compress PDF | `tools/compress-file/` | pdf-lib (kompres ulang gambar) atau pdf.js + canvas (halaman jadi gambar) |
| PDF → Excel | `tools/pdf-to-excel/` | pdf.js (teks + grafik) → grid mengikuti tampilan PDF → `shared/js/xlsx-lite.js` |

## Struktur

```
index.html              beranda (kartu daftar tool, dibuat dari shared/js/tools.js)
shared/
  css/style.css         satu stylesheet untuk semua halaman
  js/common.js          helper UI: $, msg, setupDrop, createFileList, download, fmtSize
  js/tools.js           DAFTAR TOOL (sumber tunggal untuk navigasi dan beranda)
  js/layout.js          menyisipkan navigasi/kartu dari tools.js
  js/xlsx-lite.js       penulis .xlsx kecil (banyak sheet, di memori)
vendor/                 library pihak ketiga (disimpan lokal, tidak pakai CDN)
tools/<id>/
  index.html            halaman tool
  app.js                kode UI (DOM, event)
  core.js               logika murni tanpa DOM (bisa dites di Node)
  (pdf-to-excel: table.js = teks → tabel, graphics.js = warna/garis dari PDF, sheet-layout.js = grid mengikuti tampilan PDF)
  worker.js             (hanya csv-to-excel) proses berat di Web Worker
tests/smoke.js          tes cepat logika inti
tests/fixtures/        PDF contoh (hasil ekspor LibreOffice) untuk tes regresi PDF → Excel; tambahkan PDF yang bermasalah di sini
docs/                   catatan perencanaan
```

Aturan: **UI (`app.js`) dan logika (`core.js` dst.) dipisah.** Logika tidak menyentuh DOM, jadi bisa dites dengan `npm test`.

## Menjalankan lokal

Harus lewat server (Web Worker tidak jalan dari `file://`):

```bash
php -S localhost:8000      # atau: npm start / python3 -m http.server 8000
```

Buka `http://localhost:8000`.

## Menambah tool baru

1. Buat folder `tools/<id-baru>/` dengan `index.html` dan `app.js` (salin dari tool yang paling mirip).
2. Di `index.html` baru, muat script berurutan: library `vendor/...` → `shared/js/common.js` → `tools.js` → `layout.js` (dengan `data-root="../../" data-tool="<id-baru>"`) → file tool.
3. Tambah satu baris di `shared/js/tools.js`. Navigasi dan beranda ikut terisi otomatis.
4. Kalau ada logika yang bisa dites, taruh di `core.js` (tanpa DOM) dan tambah kasus di `tests/smoke.js`.

## Konvensi

- Script klasik (bukan ES module), jadi nama global dibagi per halaman: jangan memakai nama top-level yang sama di dua file yang dimuat bersamaan.
- Path relatif (`../../shared/...`), sehingga aman di-deploy di root domain maupun subfolder.
- Proses berat (puluhan MB ke atas) harus di Web Worker agar halaman tidak beku.

## Library di `vendor/`

| Library | Versi | Lisensi |
|---|---|---|
| fflate | 0.8.x | MIT |
| pdf-lib | 1.17.1 | MIT |
| pdf.js (`pdfjs-dist`) | 3.11.174 | Apache-2.0 |

Memperbarui: ganti file di `vendor/`, lalu jalankan `npm test` dan uji manual tiap halaman.

## Tes

```bash
npm install
npm test
```

## Deploy (Vercel)

Import repo, Framework Preset: **Other**, tanpa Build/Output Directory. Setiap push ke `main` otomatis deploy.

## Batasan yang diketahui

- **PDF → Excel** menebak tata letak dari teks + grafik PDF. Yang ikut: warna latar, warna teks, border, sel gabungan (dari kotak yang menutup beberapa sel, dari area bergaris penuh yang tidak dipisah garis di dalamnya, atau dari teks rata tengah yang melebar ke kolom kosong), huruf tebal/miring, ukuran huruf, rata teks, lebar kolom/tinggi baris, format ribuan/desimal (saat opsi Angka dipilih). Yang belum: jenis font, gambar/logo, sel gabungan pada tabel tanpa garis dan tanpa warna (tidak ada petunjuk di PDF), halaman dengan `/Rotate` (belum diuji). PDF hasil scan tidak punya teks (butuh OCR).
- **Compress PDF** (Low / Recommended / High): cara "kompres gambar" hanya mengecilkan gambar JPEG dan Flate (RGB/Gray 8-bit); gambar CMYK, palette, JBIG2/CCITT/JPX dilewati. Cara "halaman jadi gambar" membuat teks tidak bisa dipilih/dicari.
- Excel membatasi 1.048.576 baris per sheet.
