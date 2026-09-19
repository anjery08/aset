# 📸 Sistem Peminjaman & Inventarisasi Aset Multimedia
### METAHATI (Media, Teknologi Informasi & Pangkalan Data) — Ma'had Aly Amtsilati

Aplikasi web modern berbasis Bootstrap 5 (AdminLTE 4) dan backend PHP JSON atomik untuk otomasi peminjaman alat multimedia, pemantauan hitung mundur (live countdown) masa sewa, integrasi notifikasi WhatsApp, serta penerbitan bukti sewa dan invoice resmi (PDF).

---

## 🌟 Fitur Unggulan

### 1. 🔍 Portal Peminjam (Santri / Mahasantri)
- **Katalog Aset Real-Time:** Menampilkan inventaris alat (kamera, lensa, tripod, audio recorder, lighting, dll.) lengkap dengan opsi paket durasi & tarif sewa.
- **Formulir Cerdas & Pengecekan Bentrok:** Anti-race condition otomatis yang mencegah peminjaman ganda di jam/tanggal yang sama.
- **Integrasi WhatsApp:** Otomatis menghasilkan format pesan reservasi resmi langsung ke WhatsApp pengurus inventaris.
- **Live Countdown Timer (`status.html`):** Menghitung mundur sisa waktu peminjaman secara akurat dengan peringatan jika masa sewa hampir habis atau terlambat.
- **Penerbitan Invoice Resmi (`invoice.html`):** Hanya dapat diterbitkan saat transaksi telah selesai diverifikasi pengurus, mendukung unduh langsung PDF tanpa dialog printer, serta memuat rincian denda (atau bebas denda) dan tanda terima sah.

### 2. 🛡️ Panel Admin (`admin-dashboard.html`)
- **Manajemen Persetujuan (ACC):** Verifikasi identitas pemohon, jaminan KTS/KTP, opsi sewa dinas pondok (gratis), dan pengaturan waktu handover riil.
- **Serah Terima Pengembalian Fisik:** Pengecekan kondisi fisik (normal / rusak), kalkulasi otomatis denda keterlambatan (dengan opsi bebas denda oleh admin), dan unggah foto dokumentasi serah terima.
- **Manajemen Katalog Aset:** Tambah, edit, hapus inventaris alat, atur paket jam & tarif dinamis, serta status perbaikan / servis.
- **Pencadangan Data & Keamanan:** Fitur backup database JSON terpusat, rate limiting IP, proteksi CORS, dan token autentikasi admin.

---

## 📂 Struktur Direktori Proyek

```text
├── 1-katalog.html         # Halaman katalog inventaris alat multimedia
├── 2-detail.html          # Halaman detail spesifikasi unit & pemilihan paket
├── 3-datadiri.html        # Formulir data diri peminjam & jadwal sewa
├── 4-persetujuan.html     # Halaman syarat kesepakatan & pengiriman ke WA admin
├── status.html            # Halaman kartu pantau & hitung mundur sewa (live countdown)
├── invoice.html           # Lembar bukti sewa resmi, pelunasan & unduh PDF
├── admin-dashboard.html   # Panel kendali admin & operasional serah terima alat
├── admin-login.html       # Halaman autentikasi pengurus/admin
├── api.php                # Backend REST API atomik (Flat-File JSON Storage)
├── css/
│   └── custom.css         # Styling custom glassmorphism & tema METAHATI
├── js/
│   └── rental-logic.js    # Mesin logika perhitungan durasi, denda, stok & sinkronisasi
├── img/                   # Foto katalog aset & logo resmi METAHATI
├── dist/                  # Komponen tema AdminLTE 4 & Bootstrap 5
└── data/                  # Penyimpanan data server terproteksi (.htaccess)
    ├── .htaccess          # Proteksi deny access direct URL
    ├── index.html         # 403 Forbidden page
    ├── assets.json        # Database katalog aset (JSON)
    ├── bookings.json      # Database riwayat transaksi peminjaman (JSON)
    └── categories.json    # Database kategori dinamis (JSON)
```

---

## 🚀 Panduan Instalasi & Deployment

### A. Deployment di cPanel (Shared / Cloud Hosting - LiteSpeed / Apache)
1. Unggah seluruh isi file proyek (atau ekstrak `aset-mahadaly.zip`) ke direktori root web publik Anda (biasanya `public_html/`).
2. Pastikan PHP versi 7.4, 8.0, 8.1, atau 8.2 aktif di cPanel Anda.
3. Pastikan folder `data/` memiliki izin tulis (*write permission* `755` atau `775`).
4. Buka domain Anda di peramban (misal `https://aset.mahadalyamtsilati.ac.id/`). Sistem siap langsung beroperasi tanpa perlu instalasi database MySQL rumit.

### B. Menjalankan di Localhost Development
Anda dapat menjalankan server lokal menggunakan PHP CLI:
```bash
php -S localhost:8000
```
Lalu buka peramban di `http://localhost:8000/1-katalog.html` atau `http://localhost:8000/admin-dashboard.html`.

---

## 🔐 Keamanan & Privasi (PII Protection)
- **PII Stripping:** Akses kalender publik umum secara otomatis disaring oleh `api.php` agar data pribadi santri (nama, nomor telepon, alamat) tidak dapat dilihat oleh publik luar.
- **Token Admin:** Tindakan sensitif (ACC, ubah status, hapus riwayat, ubah katalog) dilindungi oleh token autentikasi admin.
- **Folder Shield:** Direktori `data/` dilindungi file `.htaccess` bawaan untuk mencegah pengunduhan berkas JSON secara langsung lewat browser.

---

## 📄 Lisensi
Hak Cipta © 2026 **METAHATI — Ma'had Aly Amtsilati**.
Dibangun di atas kerangka kerja [AdminLTE 4](https://adminlte.io) berlisensi MIT.
