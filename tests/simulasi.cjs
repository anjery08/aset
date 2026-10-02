/**
 * SIMULASI PENGUJIAN OTOMATIS (UNIT TEST) - SISTEM RENTAL ASET METAHATI
 * File: tests/simulasi.cjs
 * 
 * Menjalankan puluhan skenario pengujian secara otomatis via Terminal PowerShell / Node.js
 * Cara menjalankan:
 *   npm test
 *   atau: node tests/simulasi.cjs
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// 1. Siapkan mock storage in-memory
const mockStorage = {};
const mockLocalStorage = {
    getItem: (key) => (key in mockStorage ? mockStorage[key] : null),
    setItem: (key, val) => { mockStorage[key] = String(val); },
    removeItem: (key) => { delete mockStorage[key]; },
    clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); }
};

// 2. Siapkan Context Browser Sandbox menggunakan node:vm
const sandbox = {
    console,
    Date,
    parseInt,
    parseFloat,
    Math,
    String,
    Array,
    Object,
    JSON,
    Set,
    Map,
    Promise,
    setTimeout,
    clearTimeout,
    encodeURIComponent,
    decodeURIComponent,
    isNaN,
    isFinite,
    localStorage: mockLocalStorage,
    sessionStorage: mockLocalStorage,
    document: {
        documentElement: {
            setAttribute: () => {},
            getAttribute: () => null
        },
        getElementById: () => null,
        createElement: () => ({ setAttribute: () => {}, innerHTML: "", appendChild: () => {} }),
        addEventListener: () => {}
    }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

// Buat custom event mock jika dibutuhkan
sandbox.CustomEvent = class {
    constructor(type, detail) {
        this.type = type;
        this.detail = detail;
    }
};
sandbox.dispatchEvent = () => true;

// 3. Muat dan jalankan rental-logic.js dalam sandbox
const filePath = path.resolve(__dirname, '../js/rental-logic.js');
const fileCode = fs.readFileSync(filePath, 'utf8');
vm.createContext(sandbox);
vm.runInContext(fileCode, sandbox);

// Ambil referensi fungsi-fungsi logika yang diuji
const {
    cekBentrokJadwalAset,
    cekBentrokMultiAset,
    hitungWaktuSelesai,
    hitungDenda,
    hitungTotalKeranjang,
    tambahKeKeranjang,
    hapusDariKeranjang,
    kosongkanKeranjang,
    ambilKeranjang,
    simpanKeranjang,
    ambilSemuaKatalog,
    formatNomorWaLokal,
    formatRupiah,
    formatWaktuIndo,
    escapeHtml,
    ambilOpsiDurasiPerpanjangan,
    ambilPengaturanAdmin,
    simpanPengaturanAdmin,
    JEDA_PERSIAPAN_MENIT
} = sandbox;

// Variabel pelacak hasil pengujian
let totalUji = 0;
let totalLolos = 0;
let totalGagal = 0;
const daftarGagal = [];

function uji(deskripsi, kondisi, pesanDetail = "") {
    totalUji++;
    if (kondisi) {
        totalLolos++;
        console.log(`  \x1b[32m✔ [LOLOS]\x1b[0m ${deskripsi}`);
    } else {
        totalGagal++;
        daftarGagal.push({ deskripsi, pesanDetail });
        console.log(`  \x1b[31m✖ [GAGAL]\x1b[0m ${deskripsi}`);
        if (pesanDetail) {
            console.log(`    \x1b[33m↳ Detail: ${pesanDetail}\x1b[0m`);
        }
    }
}

console.log("\n\x1b[36m======================================================================\x1b[0m");
console.log("\x1b[1m\x1b[35m  SIMULASI PENGUJIAN OTOMATIS: SISTEM RENTAL ASET MA'HAD ALY AMTSILATI\x1b[0m");
console.log("\x1b[36m======================================================================\x1b[0m\n");

const startTime = Date.now();

// -------------------------------------------------------------
// KELOMPOK 1: KALKULASI KERANJANG & MULTI-ASET
// -------------------------------------------------------------
console.log("\x1b[1m\x1b[34m[KELOMPOK 1: KALKULASI KERANJANG & MULTI-ASET]\x1b[0m");
mockLocalStorage.clear();

// Skenario 1.1: Keranjang awal harus kosong
const kAwal = hitungTotalKeranjang();
uji("Keranjang awal harus berstatus kosong (0 item, Rp 0)", kAwal.totalItem === 0 && kAwal.totalBiaya === 0);

// Skenario 1.2: Tambah 1 barang ke keranjang
tambahKeKeranjang({ id: "cam-01", nama: "Sony A6400", tarif: 60000, stokTotal: 2 }, { id: "12", jam: 12, tarif: 60000, label: "12 Jam" });
const k1 = hitungTotalKeranjang();
uji("Tambah 1 unit: total item harus 1 dan total biaya Rp 60.000", k1.totalItem === 1 && k1.totalBiaya === 60000);

// Skenario 1.3: Tambah barang ke-2 dan ke-3 dengan durasi berbeda
tambahKeKeranjang({ id: "lens-01", nama: "Lensa 50mm", tarif: 25000, stokTotal: 3 }, { id: "6", jam: 6, tarif: 25000, label: "6 Jam" });
tambahKeKeranjang({ id: "tripod-01", nama: "Tripod Takara", tarif: 15000, stokTotal: 5 }, { id: "24", jam: 24, tarif: 30000, label: "24 Jam" });
const k3 = hitungTotalKeranjang();
uji("Tambah 3 unit berbeda: total item 3 dan total biaya akumulatif tepat (Rp 115.000)", k3.totalItem === 3 && k3.totalBiaya === 115000, `Dihitung: Rp ${k3.totalBiaya}`);

// Skenario 1.4: Update durasi barang yang sudah ada (tidak boleh duplikat)
tambahKeKeranjang({ id: "cam-01", nama: "Sony A6400", tarif: 60000 }, { id: "24", jam: 24, tarif: 100000, label: "24 Jam" });
const kUpdate = hitungTotalKeranjang();
uji("Update paket barang lama: jumlah item tetap 3 (tidak duplikat) & tarif disesuaikan (Rp 155.000)", kUpdate.totalItem === 3 && kUpdate.totalBiaya === 155000, `Dihitung: Rp ${kUpdate.totalBiaya}`);

// Skenario 1.5: Hapus 1 barang dari keranjang
hapusDariKeranjang("lens-01");
const kHapus = hitungTotalKeranjang();
uji("Hapus 1 unit: sisa 2 item dan biaya berkurang tepat (Rp 130.000)", kHapus.totalItem === 2 && kHapus.totalBiaya === 130000, `Dihitung: Rp ${kHapus.totalBiaya}`);

// Skenario 1.6: Kosongkan keranjang
kosongkanKeranjang();
const kKosong = hitungTotalKeranjang();
uji("Kosongkan keranjang: kembali ke 0 item dan Rp 0", kKosong.totalItem === 0 && kKosong.totalBiaya === 0);

console.log("");

// -------------------------------------------------------------
// KELOMPOK 2: DETEKSI BENTROK JADWAL & BUFFER 30 MENIT
// -------------------------------------------------------------
console.log("\x1b[1m\x1b[34m[KELOMPOK 2: DETEKSI BENTROK JADWAL & JEDA PERSIAPAN 30 MENIT]\x1b[0m");
mockLocalStorage.clear();

// Setup dummy riwayat booking: Kamera A (stok 1) disewa hari ini jam 08:00 - 10:00
const bookingDummy = [
    {
        bookingId: "INV-TEST-01",
        status: "approved",
        asetId: "cam-sony",
        namaBarang: "Sony A6400",
        waktuAmbilRaw: "2026-10-01T08:00:00.000Z",
        waktuSelesaiRaw: "2026-10-01T10:00:00.000Z"
    },
    {
        bookingId: "INV-TEST-02",
        status: "completed", // Selesai -> tidak boleh menghalangi booking lain
        asetId: "cam-sony",
        waktuAmbilRaw: "2026-10-01T14:00:00.000Z",
        waktuSelesaiRaw: "2026-10-01T16:00:00.000Z"
    }
];
mockLocalStorage.setItem("rental_aset_booking_history", JSON.stringify(bookingDummy));

// Skenario 2.1: Sewa bertabrakan langsung di tengah jam 08:30 - 09:30
const bentrokLangsung = cekBentrokJadwalAset("cam-sony", "2026-10-01T08:30:00.000Z", "2026-10-01T09:30:00.000Z");
uji("Tabrakan langsung di tengah jam sewa: sistem WAJIB mendeteksi bentrok", bentrokLangsung.available === false);

// Skenario 2.2: Sewa jam 10:15 (selesai sewa lama 10:00 + buffer 30 mnt = siap 10:30)
const bentrokBufferSesudah = cekBentrokJadwalAset("cam-sony", "2026-10-01T10:15:00.000Z", "2026-10-01T12:00:00.000Z");
uji("Sewa jam 10:15 (di dalam jeda perawatan 30 mnt): sistem WAJIB menolak", bentrokBufferSesudah.available === false, "Alat masih dalam masa jeda pembersihan/cek fisik");

// Skenario 2.3: Sewa jam 10:35 (sudah melewati jeda perawatan 30 menit)
const amanSetelahBuffer = cekBentrokJadwalAset("cam-sony", "2026-10-01T10:35:00.000Z", "2026-10-01T12:00:00.000Z");
uji("Sewa jam 10:35 (lewat dari batas buffer 10:30): sistem WAJIB meloloskan", amanSetelahBuffer.available === true);

// Skenario 2.4: Sewa sebelum jam 08:00 tapi selesainya mepet (06:00 - 07:45, butuh buffer 30 mnt s.d 08:15)
const bentrokBufferSebelum = cekBentrokJadwalAset("cam-sony", "2026-10-01T06:00:00.000Z", "2026-10-01T07:45:00.000Z");
uji("Sewa selesai jam 07:45 (jeda ke 08:00 hanya 15 menit): sistem WAJIB menolak", bentrokBufferSebelum.available === false);

// Skenario 2.5: Booking berstatus 'completed' tidak boleh menghambat peminjam baru
const cekJadwalSelesai = cekBentrokJadwalAset("cam-sony", "2026-10-01T14:30:00.000Z", "2026-10-01T15:30:00.000Z");
uji("Booking lama yang sudah berstatus 'completed': TIDAK BOLEH memblokir sewa baru", cekJadwalSelesai.available === true);

// Skenario 2.6: Pengecekan multi-aset (Kamera bentrok, Lensa & Mic aman)
const itemsMulti = [
    { asetId: "cam-sony", namaBarang: "Sony A6400", paketJam: 2 },
    { asetId: "lens-wide", namaBarang: "Lensa 16mm", paketJam: 2 },
    { asetId: "mic-wireless", namaBarang: "Mic Rode", paketJam: 2 }
];
const resMulti = cekBentrokMultiAset(itemsMulti, "2026-10-01T09:00:00.000Z");
uji("Multi-aset: jika 1 dari 3 alat bentrok, sistem mendeteksi alat spesifik yang bermasalah", 
    resMulti.available === false && resMulti.bentrokItems.length === 1 && resMulti.bentrokItems[0].asetId === "cam-sony");

console.log("");

// -------------------------------------------------------------
// KELOMPOK 3: PERHITUNGAN WAKTU SELESAI SEWA
// -------------------------------------------------------------
console.log("\x1b[1m\x1b[34m[KELOMPOK 3: PERHITUNGAN WAKTU SELESAI SEWA]\x1b[0m");

// Skenario 3.1: Mulai jam 08:00 durasi 3 jam -> harus selesai 11:00
const waktuMulai1 = "2026-10-01T08:00:00";
const waktuSelesai1 = hitungWaktuSelesai(waktuMulai1, 3);
uji("Hitung durasi 3 jam dari jam 08:00: tepat menghasilkan jam 11:00", waktuSelesai1 && waktuSelesai1.getHours() === 11);

// Skenario 3.2: Mulai jam 22:00 durasi 6 jam (lintas hari) -> harus selesai 04:00 besoknya
const waktuMulai2 = "2026-10-01T22:00:00";
const waktuSelesai2 = hitungWaktuSelesai(waktuMulai2, 6);
uji("Hitung sewa lintas hari (22:00 + 6 jam): tepat menghasilkan jam 04:00 hari berikutnya", 
    waktuSelesai2 && waktuSelesai2.getDate() === 2 && waktuSelesai2.getHours() === 4);

// Skenario 3.3: Input waktu salah/kosong -> aman tanpa error
const waktuInvalid = hitungWaktuSelesai("", 6);
uji("Input waktu kosong / tidak valid: mengembalikan null secara aman tanpa error", waktuInvalid === null);

console.log("");

// -------------------------------------------------------------
// KELOMPOK 4: PERHITUNGAN DENDA KETERLAMBATAN
// -------------------------------------------------------------
console.log("\x1b[1m\x1b[34m[KELOMPOK 4: PERHITUNGAN DENDA KETERLAMBATAN]\x1b[0m");

const batasSelesai = "2026-10-01T12:00:00";

// Skenario 4.1: Pengembalian tepat waktu (jam 11:45)
const dendaTepatWaktu = hitungDenda(batasSelesai, "2026-10-01T11:45:00");
uji("Kembali sebelum batas waktu: denda Rp 0 (Tepat waktu)", dendaTepatWaktu.totalDenda === 0 && dendaTepatWaktu.terlambat === false);

// Skenario 4.2: Terlambat 10 menit (dalam masa toleransi 15 menit)
const dendaToleransi = hitungDenda(batasSelesai, "2026-10-01T12:10:00");
uji("Terlambat 10 menit (masa toleransi 15 menit): denda tetap Rp 0", dendaToleransi.totalDenda === 0 && dendaToleransi.terlambat === false);

// Skenario 4.3: Terlambat 20 menit (lewat toleransi 15 menit -> dihitung 1 jam)
const denda1Jam = hitungDenda(batasSelesai, "2026-10-01T12:20:00");
uji("Terlambat 20 menit (lewat batas toleransi): denda 1 jam = Rp 10.000", denda1Jam.totalDenda === 10000 && denda1Jam.terlambat === true);

// Skenario 4.4: Terlambat 75 menit (1 jam 15 menit -> dibulatkan 2 jam)
const denda2Jam = hitungDenda(batasSelesai, "2026-10-01T13:15:00");
uji("Terlambat 75 menit: pembulatan ke atas 2 jam = denda Rp 20.000", denda2Jam.totalDenda === 20000 && denda2Jam.jamDihitung === 2);

// Skenario 4.5: Terlambat 3 jam pada peminjaman Dinas Resmi Pesantren (isDinas: true)
const dendaDinas = hitungDenda(batasSelesai, "2026-10-01T15:00:00", true);
uji("Terlambat 3 jam keperluan Dinas Resmi Pondok: denda Rp 0 (Bebas Biaya)", dendaDinas.totalDenda === 0 && dendaDinas.jamDihitung === 0);

console.log("");

// -------------------------------------------------------------
// KELOMPOK 5: KETAHANAN DATA, FORMAT WA, DAN KEAMANAN
// -------------------------------------------------------------
console.log("\x1b[1m\x1b[34m[KELOMPOK 5: KETAHANAN DATA & KEAMANAN SISTEM]\x1b[0m");

// Skenario 5.1: Rentang tanggal terbalik (waktu selesai mendahului waktu mulai)
const tanggalTerbalik = cekBentrokJadwalAset("cam-sony", "2026-10-01T12:00:00.000Z", "2026-10-01T08:00:00.000Z");
uji("Waktu selesai lebih awal dari waktu mulai: sistem menolak validasi secara aman", tanggalTerbalik.available === false && !!tanggalTerbalik.error);

// Skenario 5.2: Format nomor WhatsApp awalan lokal
const wa1 = formatNomorWaLokal("628123456789");
const wa2 = formatNomorWaLokal("+62 812-3456-789");
const wa3 = formatNomorWaLokal("08123456789");
uji("Normalisasi nomor WhatsApp ke standar 08... bekerja konsisten", wa1 === "08123456789" && wa2 === "08123456789" && wa3 === "08123456789");

// Skenario 5.3: Sanitasi XSS (Cross Site Scripting)
const inputBahaya = '<script>alert("hack")</script>';
const amanXSS = escapeHtml(inputBahaya);
uji("Sanitasi tag berbahaya (<script>): berhasil diamankan menjadi HTML Entity", !amanXSS.includes("<script>") && amanXSS.includes("&lt;script&gt;"));

console.log("");

// -------------------------------------------------------------
// KELOMPOK 6: OPSI DURASI PERPANJANGAN SEWA
// -------------------------------------------------------------
console.log("\x1b[1m\x1b[34m[KELOMPOK 6: OPSI DURASI PERPANJANGAN SEWA]\x1b[0m");

// Skenario 6.1: Default mode "katalog" mengikuti paket durasi aset
const dummyAsetBooking = {
    bookingId: "INV-TEST-001",
    asetId: "ast-canon-rp",
    namaBarang: "Kamera Canon EOS RP",
    biayaSewa: 50000,
    waktuSelesaiRaw: "2026-10-01T15:00:00.000Z"
};
const opsiKatalog = ambilOpsiDurasiPerpanjangan(dummyAsetBooking);
uji("Mode Katalog: Opsi durasi perpanjangan otomatis mengikuti paket asli aset", 
    Array.isArray(opsiKatalog) && opsiKatalog.length > 0 && opsiKatalog.some(o => o.jam === 5 || o.jam === 12 || o.jam === 24));

// Skenario 6.2: Admin mengubah mode ke "kustom" dengan daftar jam [2, 4, 8]
const cfgAdmin = ambilPengaturanAdmin();
cfgAdmin.opsiPerpanjangan = {
    mode: "kustom",
    jamKustom: [2, 4, 8]
};
simpanPengaturanAdmin(cfgAdmin);

const opsiKustom = ambilOpsiDurasiPerpanjangan(dummyAsetBooking);
uji("Mode Kustom Admin: Opsi durasi mematuhi daftar jam yang dikustomisasi admin", 
    Array.isArray(opsiKustom) && opsiKustom.length === 3 && opsiKustom[0].jam === 2 && opsiKustom[1].jam === 4 && opsiKustom[2].jam === 8);

// Kembalikan ke mode default katalog
cfgAdmin.opsiPerpanjangan = { mode: "katalog", jamKustom: [3, 6, 12, 24] };
simpanPengaturanAdmin(cfgAdmin);

// Skenario 6.3: Fallback aman jika aset tanpa paket katalog
const dummyBookingPolos = { bookingId: "INV-TEST-002", asetId: "ast-unknown-xyz" };
const opsiFallback = ambilOpsiDurasiPerpanjangan(dummyBookingPolos);
uji("Fallback Aman: Aset tanpa paket katalog tetap memiliki opsi perpanjangan terstandar",
    Array.isArray(opsiFallback) && opsiFallback.length > 0);

// Skenario 6.4: Aset dengan Paket Khusus Perpanjangan (Per-Barang)
const dummyAsetDenganPaketKhusus = {
    id: "ast-custom-lens",
    nama: "Lensa 85mm F/1.4",
    paketOpsi: [
        { jam: 6, tarif: 60000 },
        { jam: 12, tarif: 100000 }
    ],
    paketPerpanjangan: [
        { jam: 2, label: "+2 Jam (Diskon)", tarif: 15000 },
        { jam: 4, label: "+4 Jam (Diskon)", tarif: 28000 }
    ]
};
const opsiPaketKhusus = ambilOpsiDurasiPerpanjangan(dummyAsetDenganPaketKhusus);
uji("Paket Khusus Per-Barang: Prioritaskan paketPerpanjangan khusus dibanding paket sewa reguler",
    Array.isArray(opsiPaketKhusus) && opsiPaketKhusus.length === 2 && opsiPaketKhusus[0].jam === 2 && opsiPaketKhusus[0].tarif === 15000);

// Skenario 6.5: Pengambilan opsi durasi via parameter string asetId langsung
const opsiAsetIdString = ambilOpsiDurasiPerpanjangan("ast-canon-rp");
uji("Fleksibilitas Parameter: Mampu menerima string asetId langsung dan menghasilkan paket opsi aset tersebut",
    Array.isArray(opsiAsetIdString) && opsiAsetIdString.length > 0);

console.log("");

// -------------------------------------------------------------
// REKAPITULASI HASIL PENGUJIAN
// -------------------------------------------------------------
const durasiMs = Date.now() - startTime;
console.log("\x1b[36m======================================================================\x1b[0m");
if (totalGagal === 0) {
    console.log(`\x1b[1m\x1b[32m  HASIL AKHIR: 100% SEMPURNA! SELURUH ${totalLolos} DARI ${totalUji} SKENARIO LULUS (0 BUG)\x1b[0m`);
} else {
    console.log(`\x1b[1m\x1b[31m  HASIL AKHIR: ${totalGagal} SKENARIO GAGAL! (${totalLolos} Lolos, ${totalGagal} Gagal)\x1b[0m`);
    daftarGagal.forEach((g, i) => {
        console.log(`  ${i + 1}. ${g.deskripsi} (${g.pesanDetail})`);
    });
}
console.log(`  Waktu Eksekusi: ${durasiMs} ms | Engine: Node.js ${process.version}`);
console.log("\x1b[36m======================================================================\x1b[0m\n");

// Kembalikan exit code sesuai hasil test (0 jika lolos semua, 1 jika ada yang gagal)
process.exit(totalGagal === 0 ? 0 : 1);
