/* tools.js — daftar tool. Menambah tool baru = tambah satu baris di sini + satu folder di tools/ */
const TOOLS = [
  { id: 'csv-to-excel', name: 'CSV → Excel', path: 'tools/csv-to-excel/', desc: 'Ubah CSV (hingga ±1 juta baris) menjadi file .xlsx.' },
  { id: 'image-to-pdf', name: 'Gambar → PDF', path: 'tools/image-to-pdf/', desc: 'Gabungkan satu atau banyak gambar menjadi satu PDF.' },
  { id: 'merge-pdf', name: 'Gabung PDF', path: 'tools/merge-pdf/', desc: 'Gabungkan beberapa file PDF dengan urutan yang bisa diatur.' },
  { id: 'compress-file', name: 'Compress PDF', path: 'tools/compress-file/', desc: 'Kecilkan ukuran PDF: pilih Low, Recommended, atau High compress.' },
  { id: 'pdf-to-excel', name: 'PDF → Excel', path: 'tools/pdf-to-excel/', desc: 'Ekstrak tabel dari PDF berisi teks menjadi .xlsx.' }
];
