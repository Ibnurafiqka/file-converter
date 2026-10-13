# Plan: CSV → Excel Converter (Internal)

## 1. Tujuan
Web tool sederhana untuk mengubah file `.csv` menjadi `.xlsx`, diakses internal saja, hosting gratis.

## 2. Keputusan Teknis
| Aspek | Pilihan | Alasan |
|---|---|---|
| Arsitektur | Client-side (tanpa backend) | Data tidak keluar dari browser, hosting statis gratis |
| Library | SheetJS (`xlsx`) | Parsing CSV + tulis XLSX dalam satu library |
| Stack | HTML + Vanilla JS (opsional Vite) | Minimal, mudah di-maintain |
| Hosting | Cloudflare Pages / Vercel / server internal | Statis, gratis |
| Pembatasan akses | Cloudflare Access (email) atau jaringan internal | Free tier Vercel = URL publik |

## 3. Scope MVP
- [ ] Upload CSV (drag & drop + tombol pilih file)
- [ ] Deteksi delimiter (`,` / `;` / tab)
- [ ] Preview beberapa baris pertama
- [ ] Tombol download `.xlsx`
- [ ] Nama file output mengikuti nama file input
- [ ] Pesan error jika file tidak valid

## 4. Di Luar MVP (opsional, nanti)
- Pilih encoding (UTF-8 / Windows-1252)
- Paksa kolom tertentu jadi teks (hindari angka nol di depan hilang, mis. `00123`)
- Format tanggal/angka
- Multi-file → multi-sheet
- Batch convert

## 5. Tahapan Pengerjaan
1. **Setup**: buat folder proyek, `index.html`, `app.js`, install/CDN SheetJS.
2. **Upload & baca file**: `FileReader` → `XLSX.read(data, { type: 'array' })`.
3. **Preview**: render tabel kecil dari 10–20 baris pertama.
4. **Konversi & download**: `XLSX.writeFile(workbook, 'nama.xlsx')`.
5. **Penanganan edge case**: delimiter, encoding, file kosong, file besar.
6. **Uji**: CSV kecil, CSV ±100k baris, karakter khusus, kolom dengan koma di dalam tanda kutip.
7. **Deploy**: push ke Git → hubungkan ke Cloudflare Pages / Vercel.
8. **Batasi akses**: aktifkan Cloudflare Access, atau pindah ke server internal.

## 6. Risiko & Catatan
- **Ukuran file**: parsing di browser; ratusan ribu baris masih aman, jutaan baris bisa lambat/crash. Batas baris Excel: 1.048.576.
- **Nol di depan / angka panjang**: Excel/SheetJS bisa mengubah tipe data; siapkan opsi "semua kolom sebagai teks".
- **Akses**: URL Vercel gratis bersifat publik; jangan taruh data sensitif di dalam kode (konversi sendiri tetap lokal di browser).
- **Fallback backend**: jika butuh aturan transformasi berat, pindah ke PHP (`phpoffice/phpspreadsheet`) di server internal.

## 7. Struktur Proyek (usulan)
```
csv-to-excel/
├── index.html
├── app.js
├── style.css
└── README.md
```

## 8. Definition of Done
- CSV bisa diunggah, di-preview, dan diunduh sebagai `.xlsx` yang terbuka normal di Excel.
- Berjalan tanpa backend.
- Ter-deploy dan akses sudah dibatasi sesuai kebutuhan internal.
