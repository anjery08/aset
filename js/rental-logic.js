/**
 * SISTEM LOGIKA RENTAL ADMINLTE - MA'HAD ALY AMTSILATI
 * File: js/rental-logic.js
 */

// Kunci selalu ke Light Mode murni (hapus residu tema gelap dari AdminLTE/Browser)
try {
    localStorage.removeItem('lte-theme');
    document.documentElement.setAttribute('data-bs-theme', 'light');
    document.documentElement.setAttribute('data-lte-color-mode', 'off');
} catch (e) {}

// Helper URL Endpoint API Backend (Mendukung mode offline file:// langsung terhubung ke localhost:8000 dan mode hosting cPanel)
function dapatkanApiEndpoint(actionOrQuery = "") {
    const file = "api-service.php";
    let base = file;
    if (typeof window !== "undefined" && window.location) {
        if (window.location.protocol === "file:") {
            base = "http://localhost:8000/" + file;
        }
    }
    if (!actionOrQuery) return base;
    if (actionOrQuery.startsWith("?")) {
        return base + actionOrQuery;
    }
    if (actionOrQuery.startsWith("api")) {
        const cleanQuery = actionOrQuery.replace(/^api(-service)?\.php\??/, "");
        return base + (cleanQuery ? ("?" + cleanQuery) : "");
    }
    return base + "?" + actionOrQuery;
}

// ==========================================
// PENGATURAN MULTI-ADMIN & NOMOR WHATSAPP
// ==========================================
const STORAGE_ADMIN_CONFIG = "rental_aset_admin_config";
const STORAGE_CUSTOM_ASET = "rental_aset_custom_items";
const STORAGE_CUSTOM_ASSETS = STORAGE_CUSTOM_ASET; // Fallback pencegah ReferenceError
const STORAGE_DELETED_DEFAULT = "rental_aset_deleted_default";
const STORAGE_BOOKING_HISTORY = "rental_aset_booking_history";

const DEFAULT_ADMIN_CONFIG = {
    username: "admin",
    password: "metahati2026",
    admin1: {
        id: "admin1",
        label: "Admin 1 (Pengurus)",
        wa: "628812762520"
    },
    admin2: {
        id: "admin2",
        label: "Mustaghfiri (Pengurus)",
        wa: "628812762520"
    },
    waGateway: {
        enabled: true,
        apiUrl: "https://wa-multi-session.amtsilatipusat.com/api/v1",
        apiKey: "1fcea2a9-6c3d-4158-8280-76ccdb9d9f66",
        sessionIdAdmin: "0ab9413c-aab1-4705-bd92-3e4b0a8c5426",
        sessionName: "Admin Ma'had Aly Amtsilati",
        phonePengantara: "6287748921490",
        phoneAdmin: "6287748921490",
        notifyAdminNewBooking: true,
        notifySantriBooking: true,
        notifySantriAcc: true,
        notifySantriTolak: true,
        notifySantriKembali: true
    }
};

// Helper sanitasi string untuk pencegahan XSS di seluruh tampilan UI
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function ambilAdminToken() {
    try {
        if (typeof sessionStorage !== "undefined" && sessionStorage.getItem("admin_token")) {
            return sessionStorage.getItem("admin_token");
        }
    } catch (e) {}
    try {
        const config = (typeof ambilPengaturanAdmin === "function") ? ambilPengaturanAdmin() : DEFAULT_ADMIN_CONFIG;
        if (config && config.password) return config.password;
    } catch (e) {}
    return "metahati2026";
}

function ambilHeaderAdminAuth() {
    const token = ambilAdminToken();
    const headers = {
        'Content-Type': 'application/json'
    };
    if (token) {
        headers['X-Admin-Token'] = token;
        headers['Authorization'] = 'Bearer ' + token;
    }
    return headers;
}

function ambilPengaturanAdmin() {
    try {
        const raw = localStorage.getItem(STORAGE_ADMIN_CONFIG);
        if (raw) {
            const parsed = JSON.parse(raw);
            return {
                ...DEFAULT_ADMIN_CONFIG,
                ...parsed,
                waGateway: {
                    ...DEFAULT_ADMIN_CONFIG.waGateway,
                    ...(parsed.waGateway || {})
                }
            };
        }
    } catch (e) {}
    return DEFAULT_ADMIN_CONFIG;
}

async function simpanPengaturanAdmin(config) {
    try {
        localStorage.setItem(STORAGE_ADMIN_CONFIG, JSON.stringify(config));
        const token = ambilAdminToken();
        try {
            const endpoint = dapatkanApiEndpoint(`action=simpan_pengaturan&token=${encodeURIComponent(token)}`);
            await fetch(endpoint, {
                method: 'POST',
                headers: ambilHeaderAdminAuth(),
                body: JSON.stringify({ ...config, admin_token: token }),
                keepalive: true
            });
        } catch (err) {}
        return true;
    } catch (e) {
        return false;
    }
}

// Mendapatkan Nomor WA Admin berdasarkan Aset (Fleksibel: Murni Admin 1 atau Admin 2)
function dapatkanNomorWaAdmin(asetOrKategori = null) {
    const config = ambilPengaturanAdmin();
    const botNo = (config.waGateway && (config.waGateway.phonePengantara || config.waGateway.phoneAdmin)) ? config.waGateway.phonePengantara || config.waGateway.phoneAdmin : "6287748921490";
    let wa1 = (config.admin1 && config.admin1.wa) ? config.admin1.wa : "628812762520";
    let wa2 = (config.admin2 && config.admin2.wa) ? config.admin2.wa : "628812762520";

    if (wa1 === botNo && wa2 !== botNo) wa1 = wa2;
    if (wa2 === botNo && wa1 !== botNo) wa2 = wa1;

    if (!asetOrKategori) return wa1;

    // Jika objek aset memiliki adminPic langsung atau lookup via asetId
    if (typeof asetOrKategori === "object") {
        if (asetOrKategori.adminPic === "admin2" || asetOrKategori.adminPic === "2") return wa2;
        if (asetOrKategori.adminPic === "admin1" || asetOrKategori.adminPic === "1") return wa1;

        if (asetOrKategori.asetId) {
            try {
                const rawAsset = cariAset(asetOrKategori.asetId);
                if (rawAsset && rawAsset.adminPic) {
                    return (rawAsset.adminPic === "admin2" || rawAsset.adminPic === "2") ? wa2 : wa1;
                }
            } catch (e) {}
        }
        
        return wa1;
    }

    const str = String(asetOrKategori).toLowerCase();
    if (str === "admin2" || str === "2") return wa2;
    return wa1;
}

// Variabel lama untuk backward-compatibility
let NOMOR_WA_ADMIN = dapatkanNomorWaAdmin();

// ==========================================
// PENGELOLAAN KATEGORI ASET DINAMIS
// ==========================================
const STORAGE_CATEGORIES = "rental_aset_custom_categories";

const KATEGORI_DEFAULT = [
    { id: "kamera", label: "Kamera & Lensa" },
    { id: "audio", label: "Audio & Sound System" },
    { id: "lighting", label: "Lighting & Studio" },
    { id: "handycam", label: "Handycam & Video" },
    { id: "sarana", label: "Sarana & Perlengkapan Acara" }
];

function ambilDaftarKategori() {
    try {
        const raw = localStorage.getItem(STORAGE_CATEGORIES);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) {
                return parsed;
            }
        }
    } catch (e) {}
    return [...KATEGORI_DEFAULT];
}

function simpanSemuaKategori(listKategori) {
    if (!Array.isArray(listKategori)) return Promise.resolve(false);
    try {
        localStorage.setItem(STORAGE_CATEGORIES, JSON.stringify(listKategori));
        
        let token = "metahati2026";
        try {
            if (typeof sessionStorage !== "undefined" && sessionStorage.getItem("admin_token")) {
                token = sessionStorage.getItem("admin_token");
            } else if (typeof ambilPengaturanAdmin === "function") {
                token = ambilPengaturanAdmin().password || "metahati2026";
            }
        } catch (e) {}

        const endpoint = dapatkanApiEndpoint('action=simpan_kategori&token=' + encodeURIComponent(token));
        const headers = {
            'Content-Type': 'application/json',
            'X-Admin-Token': token,
            'Authorization': 'Bearer ' + token
        };

        const payload = {
            categories: listKategori,
            admin_token: token
        };

        return fetch(endpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(payload),
            keepalive: true
        }).then(r => r.json()).then(res => {
            return res && res.success;
        }).catch(err => {
            console.warn("Sinkronisasi kategori ke server:", err);
            return false;
        });
    } catch (e) {
        return Promise.resolve(false);
    }
}

async function tambahKategoriBaru(namaLabel) {
    if (!namaLabel || typeof namaLabel !== "string") return null;
    const cleanLabel = namaLabel.trim();
    if (!cleanLabel) return null;

    const slug = cleanLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || ('kat-' + Date.now().toString(36));
    let list = ambilDaftarKategori();

    const existing = list.find(x => x.id === slug || x.label.toLowerCase() === cleanLabel.toLowerCase());
    if (existing) return existing;

    const newCat = { id: slug, label: cleanLabel };
    list.push(newCat);
    await simpanSemuaKategori(list);
    return newCat;
}

async function perbaruiKategori(catId, namaLabelBaru) {
    if (!catId || !namaLabelBaru || typeof namaLabelBaru !== "string") return false;
    const cleanLabel = namaLabelBaru.trim();
    if (!cleanLabel) return false;

    let list = ambilDaftarKategori();
    const targetIdx = list.findIndex(x => x.id === catId);
    if (targetIdx < 0) return false;

    const oldLabel = list[targetIdx].label;
    list[targetIdx].label = cleanLabel;
    
    // Simpan ke storage dan server
    await simpanSemuaKategori(list);

    // Sinkronisasi kategoriLabel ke aset kustom & katalog lokal
    try {
        const customRaw = localStorage.getItem(STORAGE_CUSTOM_ASET);
        if (customRaw) {
            let customList = JSON.parse(customRaw);
            let updated = false;
            if (Array.isArray(customList)) {
                customList.forEach(ast => {
                    if (ast && (ast.kategori === catId || ast.kategoriLabel === oldLabel)) {
                        ast.kategoriLabel = cleanLabel;
                        updated = true;
                    }
                });
                if (updated) {
                    localStorage.setItem(STORAGE_CUSTOM_ASET, JSON.stringify(customList));
                }
            }
        }
    } catch (e) {}

    return true;
}

async function hapusKategori(catId) {
    if (!catId) return false;
    let list = ambilDaftarKategori();
    const targetIdx = list.findIndex(x => x.id === catId);
    if (targetIdx < 0) return false;

    list.splice(targetIdx, 1);
    await simpanSemuaKategori(list);

    // Jika ada aset yang memakai kategori ini, alihkan ke kategori pertama yang tersisa
    try {
        const fallbackCat = list.length > 0 ? list[0] : { id: 'sarana', label: 'Sarana & Perlengkapan Acara' };
        const customRaw = localStorage.getItem(STORAGE_CUSTOM_ASET);
        if (customRaw) {
            let customList = JSON.parse(customRaw);
            let updated = false;
            if (Array.isArray(customList)) {
                customList.forEach(ast => {
                    if (ast && ast.kategori === catId) {
                        ast.kategori = fallbackCat.id;
                        ast.kategoriLabel = fallbackCat.label;
                        updated = true;
                    }
                });
                if (updated) {
                    localStorage.setItem(STORAGE_CUSTOM_ASET, JSON.stringify(customList));
                }
            }
        }
    } catch (e) {}

    return true;
}

// ==========================================
// DATA KATALOG ASET BAWAAN MA'HAD ALY AMTSILATI
// ==========================================
const KATALOG_DEFAULT = [
    {
        id: "ast-canon-rp",
        nama: "Kamera Canon RP + Lensa RF 50mm",
        kategori: "kamera",
        kategoriLabel: "Kamera & Lensa",
        adminPic: "admin1",
        stokTotal: 1,
        status: "available",
        gambar: "img/canon-rp.jpg",
        ikon: "bi-camera-fill",
        deskripsi: "Kamera mirrorless full-frame Canon EOS RP dipadukan dengan Lensa RF 50mm f/1.8 STM untuk hasil foto & video tajam dengan bokeh sinematik.",
        kelengkapan: [
            "1x Unit Body Kamera Canon EOS RP",
            "1x Lensa Canon RF 50mm f/1.8 STM",
            "1x Tutup Lensa Depan & Belakang",
            "1x Baterai Canon LP-E17 Original",
            "1x Charger Baterai + Kabel Power",
            "1x Tas Kamera Khusus & Strap"
        ],
        paketOpsi: [
            { id: "5", jam: 5, label: "5 Jam", tarif: 50000, desc: "Cocok untuk dokumentasi liputan singkat" },
            { id: "12", jam: 12, label: "12 Jam", tarif: 100000, desc: "Ideal untuk acara setengah hari / wisuda" },
            { id: "24", jam: 24, label: "24 Jam", tarif: 150000, desc: "Paket satu hari penuh untuk liputan luar" }
        ],
        tarif: {
            "5": 50000,
            "12": 100000,
            "24": 150000
        }
    },
    {
        id: "ast-flash-godox",
        nama: "Flash Godox TT680",
        kategori: "lighting",
        kategoriLabel: "Flash & Lighting",
        adminPic: "admin2",
        stokTotal: 1,
        status: "available",
        gambar: "img/flash-godox.jpg",
        ikon: "bi-lightning-charge-fill",
        deskripsi: "Speedlite flash eksternal high-speed sync untuk penerangan indoor, foto panggung, dan ruangan minim cahaya.",
        kelengkapan: [
            "1x Unit Speedlite Flash Godox TT680",
            "1x Diffuser Bouncer Cap",
            "1x Mini Table Stand / Dudukan Kaki Bebek",
            "1x Pouch Pelindung Flash",
            "Paket Baterai AA Alkaline / Rechargeable"
        ],
        paketOpsi: [
            { id: "12-bat1", jam: 12, label: "12 Jam (+ 1 Paket Baterai)", tarif: 20000, desc: "Termasuk 1 paket baterai isi ulang" },
            { id: "12-bat2", jam: 12, label: "12 Jam (+ 2 Paket Baterai)", tarif: 25000, desc: "Termasuk 2 paket baterai (cadangan lengkap)" }
        ],
        tarif: {
            "12-bat1": 20000,
            "12-bat2": 25000
        }
    },
    {
        id: "ast-handycam-sony",
        nama: "Handycam Sony",
        kategori: "kamera",
        kategoriLabel: "Handycam & Video",
        adminPic: "admin1",
        stokTotal: 1,
        status: "available",
        gambar: "img/handycam-sony.jpg",
        ikon: "bi-camera-video-fill",
        deskripsi: "Handycam praktis dengan optical zoom tinggi dan stabilisasi gambar mumpuni untuk rekam kajian panjang & live streaming santri.",
        kelengkapan: [
            "1x Unit Handycam Sony",
            "1x Baterai Sony Original",
            "1x Kabel Adaptor AC Charger & Power",
            "1x Kabel HDMI / Output Video",
            "1x Tas Handycam"
        ],
        paketOpsi: [
            { id: "12", jam: 12, label: "12 Jam", tarif: 50000, desc: "Paket standar sewa 12 jam kegiatan liputan / kajian" }
        ],
        tarif: {
            "12": 50000
        }
    },
    {
        id: "ast-kursi-lipat",
        nama: "Kursi Lipat Acara (Chitose)",
        kategori: "sarana",
        kategoriLabel: "Sarana & Perlengkapan Acara",
        adminPic: "admin2",
        stokTotal: 50,
        status: "available",
        gambar: "",
        ikon: "bi-easel2",
        deskripsi: "Kursi lipat besi berkualitas untuk kegiatan rapat, seminar, kajian umum, pengajian asrama, maupun acara santri.",
        kelengkapan: [
            "Unit Kursi Lipat Besi Kokoh",
            "Bantalan Dudukan Nyaman",
            "Penyusunan Rapi Saat Pengambilan"
        ],
        paketOpsi: [
            { id: "12", jam: 12, label: "12 Jam", tarif: 2000, desc: "Tarif sewa per unit untuk acara setengah hari" },
            { id: "24", jam: 24, label: "1 Hari (24 Jam)", tarif: 3000, desc: "Tarif sewa per unit untuk acara satu hari penuh" }
        ],
        tarif: {
            "12": 2000,
            "24": 3000
        }
    }
];

// ========================================================
// PEMBERSIHAN OTOMATIS RESIDU DUPLIKASI ASET LOKAL
// ========================================================
function bersihkanDuplikasiAsetLokal() {
    try {
        const customRaw = localStorage.getItem(STORAGE_CUSTOM_ASET);
        if (!customRaw) return;
        let customList = JSON.parse(customRaw);
        if (!Array.isArray(customList)) return;

        const defaultIds = KATALOG_DEFAULT.map(k => k.id);
        const cleaned = [];
        const seen = new Set();

        customList.forEach(item => {
            if (!item || !item.id) return;
            if (seen.has(item.id)) return; // Buang duplikat ID
            seen.add(item.id);

            // Jika item ini adalah aset bawaan (bukan unit baru buatan admin)
            if (defaultIds.includes(item.id)) {
                const def = KATALOG_DEFAULT.find(d => d.id === item.id);
                // Jika hanya salinan dari mutasi status 'booked' masa lalu tanpa perubahan nama/tarif
                if (def && def.nama === item.nama && JSON.stringify(def.paketOpsi) === JSON.stringify(item.paketOpsi)) {
                    return; // Bersihkan dari customList agar kembali murni ke master default
                }
            }
            cleaned.push(item);
        });

        localStorage.setItem(STORAGE_CUSTOM_ASET, JSON.stringify(cleaned));
    } catch (e) {}
}

// Jalankan pembersihan saat inisialisasi
try {
    bersihkanDuplikasiAsetLokal();
} catch (e) {}

// Mengambil seluruh aset (Gabungan Bawaan + Aset Baru dari Panel Admin)
// Dijamin DEDUPLIKASI: Setiap ID aset HANYA muncul 1 kali (tidak pernah dobel)
function ambilSemuaKatalog() {
    let list = [];
    try {
        const deletedDefaultRaw = localStorage.getItem(STORAGE_DELETED_DEFAULT);
        const deletedIds = deletedDefaultRaw ? JSON.parse(deletedDefaultRaw) : [];

        // Gunakan Map ber-key ID aset untuk menjamin keunikan 100%
        const itemMap = new Map();

        // 1. Masukkan aset bawaan yang tidak dihapus
        KATALOG_DEFAULT.forEach(item => {
            if (!deletedIds.includes(item.id)) {
                itemMap.set(item.id, { ...item });
            }
        });

        // 2. Masukkan / Override aset dari panel admin
        const customRaw = localStorage.getItem(STORAGE_CUSTOM_ASET);
        if (customRaw) {
            const customList = JSON.parse(customRaw);
            if (Array.isArray(customList)) {
                customList.forEach(c => {
                    if (c && c.id) {
                        // Timpa item bawaan jika diedit, atau tambahkan jika aset baru
                        itemMap.set(c.id, { ...c });
                    }
                });
            }
        }

        list = Array.from(itemMap.values());

        // Sinkronisasi dinamis kategori & label ke seluruh unit alat (Bawaan & Kustom)
        const daftarKat = ambilDaftarKategori();
        const mapKat = new Map();
        daftarKat.forEach(k => {
            if (k && k.id) mapKat.set(k.id, k.label);
        });
        const fallback = daftarKat.length > 0 ? daftarKat[0] : { id: 'sarana', label: 'Sarana & Perlengkapan Acara' };

        list.forEach(ast => {
            if (ast.kategori && mapKat.has(ast.kategori)) {
                ast.kategoriLabel = mapKat.get(ast.kategori);
            } else if (daftarKat.length > 0) {
                // Jika kategori aset telah dihapus oleh admin, otomatis dialihkan ke kategori yang masih ada
                ast.kategori = fallback.id;
                ast.kategoriLabel = fallback.label;
            }
        });
    } catch (e) {
        console.error("Gagal memuat katalog lengkap:", e);
        list = [...KATALOG_DEFAULT];
    }
    if (!list || list.length === 0) {
        list = [...KATALOG_DEFAULT];
    }
    return list;
}

// Menyimpan atau Mengupdate Aset Kustom Admin
async function simpanAsetKustom(asetData) {
    try {
        let customList = [];
        const customRaw = localStorage.getItem(STORAGE_CUSTOM_ASET);
        if (customRaw) customList = JSON.parse(customRaw);
        if (!Array.isArray(customList)) customList = [];

        if (!asetData.id) {
            asetData.id = "ast-custom-" + Date.now().toString(36);
            customList.push(asetData);
        } else {
            const idx = customList.findIndex(x => x.id === asetData.id);
            if (idx >= 0) {
                customList[idx] = asetData;
            } else {
                // Jika mengedit bawaan, simpan override
                customList.push(asetData);
            }
        }

        // Deduplikasi ID sebelum disimpan ke localStorage
        const uniqueCustom = [];
        const seenIds = new Set();
        customList.forEach(c => {
            if (c && c.id && !seenIds.has(c.id)) {
                seenIds.add(c.id);
                uniqueCustom.push(c);
            }
        });

        localStorage.setItem(STORAGE_CUSTOM_ASET, JSON.stringify(uniqueCustom));

        // Ambil token admin untuk otorisasi server
        const token = ambilAdminToken();

        // Sinkronkan ke server api-service.php
        let serverSuccess = false;
        try {
            const endpoint = dapatkanApiEndpoint(`action=simpan_aset&token=${encodeURIComponent(token)}`);
            const headers = ambilHeaderAdminAuth();
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    assets: uniqueCustom,
                    admin_token: token
                })
            });
            if (res.ok) {
                const resJson = await res.json();
                serverSuccess = !!(resJson && resJson.success);
            } else {
                console.error("HTTP error simpan aset ke server:", res.status, res.statusText);
            }
        } catch (err) {
            console.error("Gagal koneksi simpan aset ke server:", err);
        }

        return serverSuccess;
    } catch (e) {
        console.error("Gagal simpan aset:", e);
        return false;
    }
}

// Menghapus Aset
async function hapusAset(id) {
    try {
        let customList = [];
        const customRaw = localStorage.getItem(STORAGE_CUSTOM_ASET);
        if (customRaw) customList = JSON.parse(customRaw);

        const customIdx = customList.findIndex(x => x.id === id);
        if (customIdx >= 0) {
            customList.splice(customIdx, 1);
            localStorage.setItem(STORAGE_CUSTOM_ASET, JSON.stringify(customList));

            const token = ambilAdminToken();
            try {
                const endpoint = dapatkanApiEndpoint(`action=simpan_aset&token=${encodeURIComponent(token)}`);
                await fetch(endpoint, {
                    method: 'POST',
                    headers: ambilHeaderAdminAuth(),
                    body: JSON.stringify({
                        assets: customList,
                        admin_token: token
                    })
                });
            } catch (err) {}

            return true;
        }

        // Jika ID adalah bawaan
        let deletedIds = [];
        const deletedRaw = localStorage.getItem(STORAGE_DELETED_DEFAULT);
        if (deletedRaw) deletedIds = JSON.parse(deletedRaw);
        if (!deletedIds.includes(id)) {
            deletedIds.push(id);
            localStorage.setItem(STORAGE_DELETED_DEFAULT, JSON.stringify(deletedIds));
        }
        return true;
    } catch (e) {
        return false;
    }
}

// Mengubah status ketersediaan aset (available / booked)
async function ubahStatusAset(id, statusBaru) {
    try {
        const semua = ambilSemuaKatalog();
        const item = semua.find(x => x.id === id);
        if (item) {
            item.status = statusBaru;
            await simpanAsetKustom(item);
            return true;
        }
    } catch (e) {}
    return false;
}

// Menghitung sisa stok fisik unit yang belum disewa saat ini (real-time)
// Catatan Presisi: Hanya menghitung booking yang AKTIF SEDANG BERJALAN SAAT INI (now >= waktuAmbil).
// Booking untuk jam/hari berikutnya tidak menghabiskan stok fisik saat ini di lemari.
function hitungSisaStokAset(asetId) {
    try {
        const semua = ambilSemuaKatalog();
        const item = semua.find(x => x.id === asetId);
        if (!item) return 0;
        const total = Math.max(1, parseInt(item.stokTotal || 1));
        const riwayat = ambilRiwayatBooking();
        const now = Date.now();
        const countBookedNow = riwayat.filter(b => {
            if (b.asetId !== asetId) return false;
            // HANYA booking yang SUDAH DISETUJUI / DI-ACC (status 'active' atau 'booked') yang mengurangi stok fisik saat ini.
            // Booking dengan status 'pending' (menunggu persetujuan pengurus) BELUM disetujui, unit fisik masih ada di tempat,
            // dan TIDAK boleh terhitung sebagai 'Aset Disewa' di dashboard sampai benar-benar di-ACC.
            if (b.status !== "active" && b.status !== "booked") return false;
            const bStartRaw = b.waktuAmbilRaw || b.waktuAmbil;
            if (!bStartRaw) return true;
            const bStart = new Date(bStartRaw).getTime();
            if (isNaN(bStart)) return true;
            return now >= bStart; // Hanya dihitung jika sudah masuk waktu sewa atau sedang berjalan
        }).length;
        return Math.max(0, total - countBookedNow);
    } catch (e) {
        return 0;
    }
}

// Waktu jeda/persiapan unit antar penyewa (30 menit untuk cek fisik/swap baterai)
const JEDA_PERSIAPAN_MENIT = 30;

// Memeriksa tabrakan jadwal sewa (Time-Overlap Conflict Checking + Buffer Jeda Persiapan)
// Formula: Rentang [mulaiBaru, selesaiBaru] bentrok dengan [mulaiLama, selesaiLama] jika:
// mulaiBaru < (selesaiLama + buffer) && (selesaiBaru + buffer) > mulaiLama
function cekBentrokJadwalAset(asetId, mulaiBaruStrOrDate, selesaiBaruStrOrDate, excludeBookingId = null) {
    try {
        if (!asetId || !mulaiBaruStrOrDate || !selesaiBaruStrOrDate) {
            return { available: true, bentrokCount: 0, sisaStok: 1, stokTotal: 1, jadwalBentrok: [] };
        }

        const semua = ambilSemuaKatalog();
        const item = semua.find(x => x.id === asetId);
        const stokTotal = item ? Math.max(1, parseInt(item.stokTotal || 1)) : 1;

        const newStart = new Date(mulaiBaruStrOrDate).getTime();
        const newEnd = new Date(selesaiBaruStrOrDate).getTime();

        if (isNaN(newStart) || isNaN(newEnd) || newStart >= newEnd) {
            return {
                available: false,
                bentrokCount: 0,
                sisaStok: 0,
                stokTotal: stokTotal,
                error: "Rentang waktu peminjaman tidak valid",
                jadwalBentrok: []
            };
        }

        const riwayat = ambilRiwayatBooking();
        const bentrokBookings = [];
        const bufferMs = JEDA_PERSIAPAN_MENIT * 60 * 1000;

        riwayat.forEach(b => {
            if (b.asetId !== asetId) return;
            if (b.status === "completed" || b.status === "rejected" || b.status === "cancelled") return; // Jika selesai/ditolak/dibatalkan, tidak bentrok
            if (excludeBookingId && ((b.bookingId || '').toUpperCase() === (excludeBookingId || '').toUpperCase() || (b.id || '').toUpperCase() === (excludeBookingId || '').toUpperCase())) return;

            const bStartRaw = b.waktuAmbilRaw || b.waktuAmbil;
            const bEndRaw = b.waktuSelesaiRaw || b.waktuSelesai;
            if (!bStartRaw || !bEndRaw) return;

            const bStart = new Date(bStartRaw).getTime();
            const bEnd = new Date(bEndRaw).getTime();
            if (isNaN(bStart) || isNaN(bEnd)) return;

            const bEndWithBuffer = bEnd + bufferMs;
            const bStartWithBuffer = bStart - bufferMs;

            // Pengecekan irisan waktu dengan toleransi jeda persiapan 30 menit
            if (newStart < bEndWithBuffer && newEnd > bStartWithBuffer) {
                const readyDate = new Date(bEndWithBuffer);
                const jamReady = readyDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':');
                bentrokBookings.push({
                    bookingId: b.bookingId || b.id || 'INV-0000',
                    nama: b.nama || 'Santri',
                    waktuAmbil: b.waktuAmbil || '',
                    waktuSelesai: b.waktuSelesai || '',
                    startMs: bStart,
                    endMs: bEnd,
                    readyAfterStr: `${jamReady} WIB (termasuk jeda 30 mnt)`
                });
            }
        });

        const bentrokCount = bentrokBookings.length;
        const sisaStok = Math.max(0, stokTotal - bentrokCount);
        const available = bentrokCount < stokTotal;

        return {
            available: available,
            stokTotal: stokTotal,
            bentrokCount: bentrokCount,
            sisaStok: sisaStok,
            jadwalBentrok: bentrokBookings
        };
    } catch (e) {
        console.error("Gagal memeriksa bentrok jadwal aset:", e);
        return { available: true, bentrokCount: 0, sisaStok: 1, stokTotal: 1, jadwalBentrok: [] };
    }
}

// Mendapatkan jadwal peminjaman aktif aset tertentu untuk ditampilkan informatif
function ambilJadwalBookingAset(asetId) {
    try {
        const riwayat = ambilRiwayatBooking();
        return riwayat.filter(b => b.asetId === asetId && b.status === "booked");
    } catch (e) {
        return [];
    }
}

// Mengambil status booking paling mutakhir langsung dari server atau cache
async function ambilStatusBookingTerbaru(bookingId) {
    if (!bookingId) return null;
    const bIdClean = bookingId.trim().toUpperCase();

    // Cek server api.php terlebih dahulu
    try {
        const headers = (typeof ambilHeaderAdminAuth === "function") ? ambilHeaderAdminAuth() : {};
        const res = await fetch(dapatkanApiEndpoint('action=ambil_booking&id=${encodeURIComponent(bIdClean)}'), { headers });
        if (res.ok) {
            const json = await res.json();
            if (json && json.success && Array.isArray(json.data) && json.data.length > 0) {
                const foundServer = json.data[0];
                if (foundServer) {
                    // Update cache lokal untuk booking ini
                    try {
                        let localList = ambilRiwayatBooking();
                        const idx = localList.findIndex(b => (b.bookingId || '').toUpperCase() === bIdClean || (b.id || '').toUpperCase() === bIdClean);
                        if (idx >= 0) {
                            localList[idx] = { ...localList[idx], ...foundServer };
                        } else {
                            localList.unshift(foundServer);
                        }
                        localStorage.setItem(STORAGE_BOOKING_HISTORY, JSON.stringify(localList));
                    } catch (err) {}
                    return foundServer;
                }
            }
        }
    } catch (e) {}

    // Fallback ke localStorage
    const localHistory = ambilRiwayatBooking();
    return localHistory.find(b => (b.bookingId || '').toUpperCase() === bIdClean || (b.id || '').toUpperCase() === bIdClean) || null;
}

// Menolak / Membatalkan Booking oleh Admin dan membebaskan slot jadwal
async function tolakBookingAdminAsync(bookingId, alasan = 'Unit tidak dapat disewakan pada jam tersebut') {
    if (!bookingId) return false;
    const bIdClean = bookingId.trim().toUpperCase();

    // 1. Update di local storage
    try {
        let list = ambilRiwayatBooking();
        const item = list.find(b => (b.bookingId || '').toUpperCase() === bIdClean || (b.id || '').toUpperCase() === bIdClean);
        if (item) {
            item.status = 'rejected';
            item.alasanTolak = alasan;
            item.waktuDitolak = new Date().toISOString();
            localStorage.setItem(STORAGE_BOOKING_HISTORY, JSON.stringify(list));
        }
    } catch (e) {}

    // 2. Kirim ke server api.php
    try {
        const token = ambilAdminToken();
        const res = await fetch(dapatkanApiEndpoint(`action=tolak_booking&token=${encodeURIComponent(token)}`), {
            method: 'POST',
            headers: ambilHeaderAdminAuth(),
            body: JSON.stringify({ bookingId: bIdClean, alasan: alasan, admin_token: token })
        });
        if (res.ok) {
            const json = await res.json();
            return json && json.success;
        }
    } catch (err) {}

    return true;
}

// ACC / Setujui Permohonan Sewa oleh Admin
async function accBookingAdminAsync(bookingId, opsi = {}) {
    if (!bookingId) return false;
    const bIdClean = bookingId.trim().toUpperCase();

    // 1. Update di local storage
    try {
        let list = ambilRiwayatBooking();
        const item = list.find(b => (b.bookingId || '').toUpperCase() === bIdClean || (b.id || '').toUpperCase() === bIdClean);
        if (item) {
            item.status = 'active';
            item.waktuDiAcc = new Date().toISOString();
            if (opsi.isDinas) {
                item.isDinas = true;
                if (!item.biayaSewaAsli) item.biayaSewaAsli = item.biayaSewa || 0;
                item.biayaSewa = 0;
            } else {
                item.isDinas = false;
                if (typeof opsi.biayaFinal !== 'undefined' && opsi.biayaFinal !== null) {
                    item.biayaSewa = parseInt(opsi.biayaFinal);
                } else if (item.biayaSewaAsli) {
                    item.biayaSewa = parseInt(item.biayaSewaAsli);
                }
            }
            if (opsi.catatanAcc) item.catatanAcc = opsi.catatanAcc;
            if (opsi.jaminanIdentitas) item.jaminanIdentitas = opsi.jaminanIdentitas;

            // Jika admin memilih opsi penyesuaian jam sewa mulai sekarang (Handover riil)
            if (opsi.mulaiSekarang) {
                let durasiMs = 2 * 3600 * 1000;
                if (item.waktuAmbilRaw && item.waktuSelesaiRaw) {
                    const t1 = new Date(item.waktuAmbilRaw).getTime();
                    const t2 = new Date(item.waktuSelesaiRaw).getTime();
                    if (!isNaN(t1) && !isNaN(t2) && t2 > t1) durasiMs = t2 - t1;
                } else if (item.paketJam) {
                    durasiMs = parseInt(item.paketJam) * 3600 * 1000;
                }
                const now = new Date();
                const tSelesai = new Date(now.getTime() + durasiMs);
                item.waktuAmbilRaw = now.toISOString();
                item.waktuSelesaiRaw = tSelesai.toISOString();
                item.waktuAmbil = (typeof formatWaktuIndo === 'function' ? formatWaktuIndo(now) : now.toLocaleString('id-ID')) + ' WIB';
                item.waktuSelesai = (typeof formatWaktuIndo === 'function' ? formatWaktuIndo(tSelesai) : tSelesai.toLocaleString('id-ID')) + ' WIB';
                item.handoverRiil = true;
            }

            localStorage.setItem(STORAGE_BOOKING_HISTORY, JSON.stringify(list));
        }
        const cur = ambilDataBooking();
        if (cur && ((cur.bookingId || '').toUpperCase() === bIdClean || (cur.id || '').toUpperCase() === bIdClean)) {
            cur.status = 'active';
            cur.waktuDiAcc = new Date().toISOString();
            if (opsi.isDinas) {
                cur.isDinas = true;
                if (!cur.biayaSewaAsli) cur.biayaSewaAsli = cur.biayaSewa || 0;
                cur.biayaSewa = 0;
            } else {
                cur.isDinas = false;
                if (typeof opsi.biayaFinal !== 'undefined' && opsi.biayaFinal !== null) {
                    cur.biayaSewa = parseInt(opsi.biayaFinal);
                } else if (cur.biayaSewaAsli) {
                    cur.biayaSewa = parseInt(cur.biayaSewaAsli);
                }
            }
            if (opsi.jaminanIdentitas) cur.jaminanIdentitas = opsi.jaminanIdentitas;
            if (opsi.mulaiSekarang && item) {
                cur.waktuAmbilRaw = item.waktuAmbilRaw;
                cur.waktuSelesaiRaw = item.waktuSelesaiRaw;
                cur.waktuAmbil = item.waktuAmbil;
                cur.waktuSelesai = item.waktuSelesai;
                cur.handoverRiil = true;
            }
            simpanDataBooking(cur);
        }
    } catch (e) {}

    // 2. Kirim ke server api.php
    try {
        const token = ambilAdminToken();
        const res = await fetch(dapatkanApiEndpoint(`action=acc_booking&token=${encodeURIComponent(token)}`), {
            method: 'POST',
            headers: ambilHeaderAdminAuth(),
            body: JSON.stringify({
                bookingId: bIdClean,
                isDinas: !!opsi.isDinas,
                biayaFinal: opsi.biayaFinal,
                catatanAcc: opsi.catatanAcc || '',
                mulaiSekarang: !!opsi.mulaiSekarang,
                jaminanIdentitas: opsi.jaminanIdentitas || '',
                admin_token: token
            })
        });
        if (res.ok) {
            const json = await res.json();
            return json && json.success;
        }
    } catch (err) {}

    return true;
}

// Konfirmasi Pengembalian Fisik Alat oleh Admin (Denda Bebas Edit + Foto Bukti Opsional)
async function kembalikanBookingAdminAsync(bookingId, returnData = {}) {
    if (!bookingId) return false;
    const bIdClean = bookingId.trim().toUpperCase();

    // 1. Update di local storage
    try {
        let list = ambilRiwayatBooking();
        const item = list.find(b => (b.bookingId || '').toUpperCase() === bIdClean || (b.id || '').toUpperCase() === bIdClean);
        if (item) {
            item.status = 'completed';
            item.waktuDikembalikan = returnData.waktuDikembalikan || new Date().toISOString();
            item.dendaKeterlambatan = parseInt(returnData.dendaKeterlambatan || 0);
            item.dendaKerusakan = parseInt(returnData.dendaKerusakan || 0);
            item.denda = item.dendaKeterlambatan + item.dendaKerusakan;
            item.kondisiFisik = returnData.kondisiFisik || 'normal';
            item.catatanPengembalian = returnData.catatanPengembalian || '';
            if (returnData.buktiFoto) item.buktiFoto = returnData.buktiFoto;
            localStorage.setItem(STORAGE_BOOKING_HISTORY, JSON.stringify(list));
        }
        const cur = ambilDataBooking();
        if (cur && ((cur.bookingId || '').toUpperCase() === bIdClean || (cur.id || '').toUpperCase() === bIdClean)) {
            cur.status = 'completed';
            cur.waktuDikembalikan = returnData.waktuDikembalikan || new Date().toISOString();
            cur.denda = parseInt(returnData.dendaKeterlambatan || 0) + parseInt(returnData.dendaKerusakan || 0);
            cur.dendaKeterlambatan = parseInt(returnData.dendaKeterlambatan || 0);
            if (returnData.buktiFoto) cur.buktiFoto = returnData.buktiFoto;
            simpanDataBooking(cur);
        }
    } catch (e) {}

    // 2. Kirim ke server api.php
    try {
        const payload = {
            bookingId: bIdClean,
            waktuDikembalikan: returnData.waktuDikembalikan || new Date().toISOString(),
            dendaKeterlambatan: parseInt(returnData.dendaKeterlambatan || 0),
            dendaKerusakan: parseInt(returnData.dendaKerusakan || 0),
            kondisiFisik: returnData.kondisiFisik || 'normal',
            catatanPengembalian: returnData.catatanPengembalian || '',
            nonaktifkanAsetServis: !!returnData.nonaktifkanAsetServis
        };
        if (returnData.buktiFoto) payload.buktiFoto = returnData.buktiFoto;

        const token = ambilAdminToken();
        payload.admin_token = token;

        const res = await fetch(dapatkanApiEndpoint(`action=kembalikan_booking&token=${encodeURIComponent(token)}`), {
            method: 'POST',
            headers: ambilHeaderAdminAuth(),
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            const json = await res.json();
            return json && json.success;
        }
    } catch (err) {}

    return true;
}

// Utility kompresi gambar client-side (HTML5 Canvas -> JPEG Base64 ringan <100KB)
function kompresGambarClient(file, maxWidth = 800, quality = 0.6) {
    return new Promise((resolve, reject) => {
        if (!file) return resolve(null);
        if (!file.type || !file.type.startsWith('image/')) return resolve(null);

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let width = img.width;
                let height = img.height;
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
                resolve(compressedDataUrl);
            };
            img.onerror = () => resolve(e.target.result);
            img.src = e.target.result;
        };
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(file);
    });
}

// Auto-fill Profil Penyewa untuk kemudahan sewa banyak barang
const STORAGE_RENTER_PROFILE = "rental_profil_penyewa_terakhir";

function simpanProfilPenyewa(data) {
    if (!data) return;
    try {
        const profil = {
            nama: data.nama || '',
            noWa: data.noWa || '',
            komunitas: data.komunitas || '',
            departemen: data.departemen || '',
            alamat: data.alamat || ''
        };
        localStorage.setItem(STORAGE_RENTER_PROFILE, JSON.stringify(profil));
    } catch (e) {}
}

function ambilProfilPenyewa() {
    try {
        const raw = localStorage.getItem(STORAGE_RENTER_PROFILE);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}


// Master Aset murni daftar inventaris, tidak dimutasi oleh transaksi booking sewa
function sinkronkanStatusSemuaAset() {
    return;
}

// Riwayat Booking untuk Admin (Tersimpan di LocalStorage & Otomatis Terkirim ke Server api.php)
function catatRiwayatBooking(booking) {
    try {
        if (!booking || !booking.nama) return;

        // Jamin setiap booking memiliki ID unik permanen
        if (!booking.bookingId) {
            const inisial = (booking.nama || 'MHT').replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase() || 'MHT';
            booking.bookingId = 'INV-' + inisial + '-' + Date.now().toString(36).toUpperCase();
        }
        booking.id = booking.bookingId;
        booking.recordedAt = new Date().toISOString();

        let history = ambilRiwayatBooking();
        const existingIdx = history.findIndex(b => (b.bookingId || '').toUpperCase() === booking.bookingId.toUpperCase());
        if (existingIdx >= 0) {
            history[existingIdx] = { ...history[existingIdx], ...booking };
        } else {
            history.unshift(booking);
        }
        if (history.length > 150) history = history.slice(0, 150);
        localStorage.setItem(STORAGE_BOOKING_HISTORY, JSON.stringify(history));

        // Sinkronkan status stok ketersediaan aset
        sinkronkanStatusSemuaAset();
    } catch (e) {}

    // Kirim sinkronisasi otomatis ke backend cPanel (api.php)
    try {
        fetch(dapatkanApiEndpoint('action=simpan_booking'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(booking),
            keepalive: true
        }).then(r => r.json()).then(res => {
            console.log("Server response simpan_booking:", res);
        }).catch(err => {
            console.log("Mode offline / lokal tanpa PHP:", err);
        });
    } catch (e) {}
}

function ambilRiwayatBooking() {
    try {
        const raw = localStorage.getItem(STORAGE_BOOKING_HISTORY);
        let list = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(list)) list = [];

        // Jamin integritas: pastikan setiap item memiliki bookingId unik & nama tidak tersensor
        let modified = false;
        list.forEach((b, idx) => {
            if (!b.bookingId) {
                const inisial = (b.nama || 'MHT').replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase() || 'MHT';
                b.bookingId = 'INV-' + inisial + '-' + (idx + 1).toString().padStart(4, '0');
                b.id = b.bookingId;
                modified = true;
            }
            if (b.nama && b.nama.includes('***')) {
                b.nama = b.nama.replace(/\*+/g, '').trim();
                modified = true;
            }
        });
        if (modified) {
            localStorage.setItem(STORAGE_BOOKING_HISTORY, JSON.stringify(list));
        }
        return list;
    } catch (e) {
        return [];
    }
}

async function ambilRiwayatBookingAsync() {
    try {
        const headers = (typeof ambilHeaderAdminAuth === "function") ? ambilHeaderAdminAuth() : { 'Content-Type': 'application/json' };
        const token = headers['X-Admin-Token'] || 'metahati2026';
        const res = await fetch(dapatkanApiEndpoint(`action=ambil_booking&token=${encodeURIComponent(token)}`), { headers });
        if (res.ok) {
            const resJson = await res.json();
            if (resJson && resJson.success && Array.isArray(resJson.data)) {
                // Jangan timpa field lengkap di cache lokal (seperti nama/noWa pada santri) dengan data teredaksi
                let localList = ambilRiwayatBooking();
                const mergedList = resJson.data.map(serverItem => {
                    const localItem = localList.find(b => (b.bookingId || '').toUpperCase() === (serverItem.bookingId || '').toUpperCase());
                    if (localItem) {
                        return { ...localItem, ...serverItem };
                    }
                    return serverItem;
                });
                // Pertahankan juga booking lokal yang belum tersinkron
                localList.forEach(loc => {
                    if (!mergedList.some(m => (m.bookingId || '').toUpperCase() === (loc.bookingId || '').toUpperCase())) {
                        mergedList.push(loc);
                    }
                });
                localStorage.setItem(STORAGE_BOOKING_HISTORY, JSON.stringify(mergedList));
                return mergedList;
            }
        }
    } catch (e) {}
    return ambilRiwayatBooking();
}

async function hapusBookingServer(bookingId) {
    try {
        let history = ambilRiwayatBooking();
        history = history.filter(b => (b.bookingId || '') !== bookingId);
        localStorage.setItem(STORAGE_BOOKING_HISTORY, JSON.stringify(history));

        const token = ambilAdminToken();
        await fetch(dapatkanApiEndpoint(`action=hapus_booking&token=${encodeURIComponent(token)}`), {
            method: 'POST',
            headers: ambilHeaderAdminAuth(),
            body: JSON.stringify({ bookingId: bookingId, admin_token: token }),
            keepalive: true
        });
        return true;
    } catch (e) {
        return false;
    }
}

// Backward compatibility: KATALOG_ASET mengarah ke ambilSemuaKatalog()
const KATALOG_ASET = ambilSemuaKatalog();

// ==========================================
// 1. FUNGSI HITUNG WAKTU SELESAI
// ==========================================
function hitungWaktuSelesai(waktuMulaiStr, paketJam) {
    if (!waktuMulaiStr || !paketJam) return null;
    
    const waktuMulai = new Date(waktuMulaiStr);
    if (isNaN(waktuMulai.getTime())) return null;

    const durasiMs = parseInt(paketJam, 10) * 60 * 60 * 1000;
    const waktuSelesai = new Date(waktuMulai.getTime() + durasiMs);
    
    return waktuSelesai;
}

// ==========================================
// 2. FUNGSI HITUNG DENDA KETERLAMBATAN
// ==========================================
function hitungDenda(waktuSelesaiStr, waktuPengembalianStr) {
    const selesai = new Date(waktuSelesaiStr);
    const kembali = new Date(waktuPengembalianStr);
    
    if (isNaN(selesai.getTime()) || isNaN(kembali.getTime())) {
        return {
            terlambat: false,
            menitTerlambat: 0,
            jamDihitung: 0,
            totalDenda: 0,
            pesan: "Format waktu pengembalian tidak valid."
        };
    }

    const selisihMenit = Math.floor((kembali - selesai) / (1000 * 60));
    
    // Toleransi keterlambatan maksimal 15 menit
    if (selisihMenit <= 15) {
        return {
            terlambat: false,
            menitTerlambat: Math.max(0, selisihMenit),
            jamDihitung: 0,
            totalDenda: 0,
            pesan: selisihMenit <= 0 
                ? "Pengembalian tepat waktu sebelum batas sewa berakhir." 
                : "Pengembalian tepat waktu (dalam masa toleransi 15 menit bebas denda)."
        };
    }
    
    // Keterlambatan lebih dari 15 menit -> Dikenakan denda Rp 10.000 berlaku kelipatan per jam
    const jamDihitung = Math.ceil(selisihMenit / 60);
    const totalDenda = jamDihitung * 10000;
    
    return {
        terlambat: true,
        menitTerlambat: selisihMenit,
        jamDihitung: jamDihitung,
        totalDenda: totalDenda,
        pesan: `Terlambat ${selisihMenit} menit (lewat toleransi 15 menit). Denda: ${jamDihitung} jam x Rp 10.000 = Rp ${totalDenda.toLocaleString('id-ID')} (berlaku kelipatan per jam)`
    };
}

// Format Nomor WhatsApp untuk Tampilan Santri & Invoice (Awalan 08...)
function formatNomorWaLokal(no) {
    if (!no) return "-";
    let clean = String(no).replace(/[^0-9]/g, '');
    if (clean.startsWith("62")) {
        clean = "0" + clean.substring(2);
    } else if (clean.startsWith("8")) {
        clean = "0" + clean;
    }
    return clean;
}

// Format Nomor WhatsApp ke Standar Internasional untuk Tautan wa.me (628...)
function formatNomorWa(no) {
    if (!no) return "";
    let clean = String(no).replace(/[^0-9]/g, '');
    if (clean.startsWith("0")) {
        clean = "62" + clean.substring(1);
    } else if (clean.startsWith("8")) {
        clean = "62" + clean;
    }
    return clean;
}

// Helper Encoding/Decoding Data Booking ke URL Parameter Ringkas
function encodeBookingToParam(data) {
    try {
        let namaBersih = (data.nama || "").replace(/\*+/g, '').trim();
        const compact = {
            id: data.bookingId || ("INV-" + Date.now().toString(36).toUpperCase()),
            aid: data.asetId || "",
            st: data.status || "active",
            nb: data.namaBarang || "",
            pl: data.paketLabel || (data.paketJam ? data.paketJam + " Jam" : ""),
            pj: data.paketJam || 12,
            bs: data.biayaSewa || 0,
            n: namaBersih,
            k: data.komunitas || "",
            d: data.departemen || "",
            a: data.alamat || "",
            w: data.noWa || "",
            wa: data.waktuAmbil || "",
            ws: data.waktuSelesai || "",
            war: data.waktuAmbilRaw || "",
            wsr: data.waktuSelesaiRaw || ""
        };
        const jsonStr = JSON.stringify(compact);
        return encodeURIComponent(btoa(unescape(encodeURIComponent(jsonStr))));
    } catch (e) {
        return "";
    }
}

function decodeBookingFromParam(paramStr) {
    try {
        if (!paramStr) return null;
        const decodedStr = decodeURIComponent(escape(atob(decodeURIComponent(paramStr))));
        const c = JSON.parse(decodedStr);
        let namaBersih = (c.n || "").replace(/\*+/g, '').trim();
        return {
            bookingId: c.id,
            asetId: c.aid || "",
            status: c.st || "active",
            namaBarang: c.nb,
            paketLabel: c.pl,
            paketJam: c.pj,
            biayaSewa: c.bs,
            nama: namaBersih,
            komunitas: c.k,
            departemen: c.d,
            alamat: c.a,
            noWa: c.w,
            waktuAmbil: c.wa,
            waktuSelesai: c.ws,
            waktuAmbilRaw: c.war,
            waktuSelesaiRaw: c.wsr
        };
    } catch (e) {
        return null;
    }
}

function dapatkanBaseUrl() {
    try {
        if (typeof window !== "undefined" && window.location) {
            const loc = window.location;
            if (loc.protocol.startsWith("http")) {
                const pathParts = loc.pathname.split('/');
                pathParts.pop(); // hapus nama file (misal 4-persetujuan.html)
                return loc.origin + pathParts.join('/');
            }
        }
    } catch (e) {}
    return "";
}

// Helper loader booking dari URL (?id= atau ?data=)
async function muatBookingDariQuery() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const dataParam = urlParams.get("data");
        const idParam = urlParams.get("id");

        // 1. Jika ada param id (short URL - format paling bersih dan direkomendasikan)
        if (idParam) {
            const idClean = idParam.trim().toUpperCase();

            // Prioritaskan ambil data paling segar langsung dari server api.php
            try {
                const headers = (typeof ambilHeaderAdminAuth === "function") ? ambilHeaderAdminAuth() : {};
                const res = await fetch(dapatkanApiEndpoint('action=ambil_booking&id=${encodeURIComponent(idClean)}'), { headers });
                if (res.ok) {
                    const json = await res.json();
                    if (json && json.success && Array.isArray(json.data) && json.data.length > 0) {
                        const serverFound = json.data[0];
                        if (serverFound) {
                            if (serverFound.nama && serverFound.nama.includes('***')) {
                                serverFound.nama = serverFound.nama.replace(/\*+/g, '').trim();
                            }
                            // Sinkronkan ke local cache & lengkapi field identitas jika server belum memilikinya
                            try {
                                let localList = ambilRiwayatBooking();
                                const idx = localList.findIndex(b => (b.bookingId || '').toUpperCase() === idClean || (b.id || '').toUpperCase() === idClean);
                                if (idx >= 0) {
                                    const localItem = localList[idx];
                                    if (!serverFound.nama && localItem.nama) serverFound.nama = localItem.nama;
                                    if (!serverFound.noWa && localItem.noWa) serverFound.noWa = localItem.noWa;
                                    if (!serverFound.komunitas && localItem.komunitas) serverFound.komunitas = localItem.komunitas;
                                    if (!serverFound.departemen && localItem.departemen) serverFound.departemen = localItem.departemen;
                                    if (!serverFound.alamat && localItem.alamat) serverFound.alamat = localItem.alamat;
                                    localList[idx] = { ...localItem, ...serverFound };
                                } else {
                                    localList.unshift(serverFound);
                                }
                                localStorage.setItem(STORAGE_BOOKING_HISTORY, JSON.stringify(localList));
                            } catch (err) {}

                            // Fallback jika masih kosong, lengkapi dari profil tersimpan di browser
                            try {
                                const profil = (typeof ambilProfilPenyewa === 'function') ? ambilProfilPenyewa() : null;
                                if (profil) {
                                    if (!serverFound.nama && profil.nama) serverFound.nama = profil.nama;
                                    if (!serverFound.noWa && profil.noWa) serverFound.noWa = profil.noWa;
                                    if (!serverFound.komunitas && profil.komunitas) serverFound.komunitas = profil.komunitas;
                                    if (!serverFound.departemen && profil.departemen) serverFound.departemen = profil.departemen;
                                    if (!serverFound.alamat && profil.alamat) serverFound.alamat = profil.alamat;
                                }
                            } catch (e) {}

                            return serverFound;
                        }
                    }
                }
            } catch (err) {}

            // Cari di booking aktif lokal
            const cur = ambilDataBooking();
            if (cur && ((cur.bookingId || '').toUpperCase() === idClean || (cur.id || '').toUpperCase() === idClean)) {
                if (cur.nama && cur.nama.includes('***')) cur.nama = cur.nama.replace(/\*+/g, '').trim();
                return cur;
            }

            // Cari di riwayat lokal
            const history = ambilRiwayatBooking();
            const foundHist = history.find(b => (b.bookingId || '').toUpperCase() === idClean || (b.id || '').toUpperCase() === idClean);
            if (foundHist) {
                if (foundHist.nama && foundHist.nama.includes('***')) foundHist.nama = foundHist.nama.replace(/\*+/g, '').trim();
                return foundHist;
            }
        }

        // 2. Jika ada param data (base64 backward-compatible)
        if (dataParam) {
            const decoded = decodeBookingFromParam(dataParam);
            if (decoded && decoded.namaBarang) {
                // Cek apakah ada data terbarui di server berdasarkan bookingId
                const targetId = (decoded.bookingId || '').trim().toUpperCase();
                if (targetId) {
                    try {
                        const res = await fetch(dapatkanApiEndpoint('action=ambil_booking&id=${encodeURIComponent(targetId)}'));
                        if (res.ok) {
                            const json = await res.json();
                            if (json && json.success && Array.isArray(json.data) && json.data.length > 0) {
                                const serverFound = json.data[0];
                                if (serverFound && serverFound.nama && !serverFound.nama.includes('***')) {
                                    return serverFound;
                                }
                            }
                        }
                    } catch (e) {}
                }
                if (decoded.nama && decoded.nama.includes('***')) {
                    decoded.nama = decoded.nama.replace(/\*+/g, '').trim();
                }
                return decoded;
            }
        }

        // 3. Fallback ke booking aktif saat ini
        const defaultCur = ambilDataBooking();
        if (defaultCur && defaultCur.nama && defaultCur.nama.includes('***')) {
            defaultCur.nama = defaultCur.nama.replace(/\*+/g, '').trim();
        }
        return defaultCur;
    } catch (e) {
        return ambilDataBooking();
    }
}

// ==========================================
// 3. GENERATOR FORMAT PESAN WHATSAPP RESMI
// ==========================================
function buatPesanWhatsApp(dataSewa, baseUrl = null) {
    const lamaSewaTeks = dataSewa.paketLabel || (dataSewa.paketJam + " Jam");
    const domainUrl = baseUrl || dapatkanBaseUrl();
    const bId = dataSewa.bookingId || ('INV-' + Math.floor(1000 + Math.random() * 9000));

    const keperluanTeks = dataSewa.keperluan ? `\nTujuan/Keperluan: ${dataSewa.keperluan}` : '';
    const tipeDinasTeks = dataSewa.isDinas ? `\nTipe Peminjaman: *TUGAS RESMI PONDOK (Bebas Biaya / Rp 0)*` : '';

    let teks = `*FORMAT BOOKING PEMINJAMAN & SEWA ASET MA'HAD ALY AMTSILATI*
(Mohon konfirmasi persetujuan / ACC Pengurus Ma'had Aly Amtsilati)

Nama Lengkap: ${dataSewa.nama}
Asal Media/Komunitas: ${dataSewa.komunitas}
Asrama/Departemen: ${dataSewa.departemen}
Alamat: ${dataSewa.alamat}${keperluanTeks}${tipeDinasTeks}
No HP Aktif: ${dataSewa.noWa}
Barang yang Dipinjam/Disewa: ${dataSewa.namaBarang}
Lama Sewa: ${lamaSewaTeks}
Waktu Ambil: ${dataSewa.waktuAmbil}
Waktu Kembali: ${dataSewa.waktuSelesai}
Status: *MENUNGGU KONFIRMASI (ACC) PENGURUS*

*KESEPAKATAN PENYEWA:*
_"Dengan mengirimkan format ini, saya menyatakan bertanggung jawab penuh atas keamanan alat, sanggup mengoperasikan alat dengan benar, dan bersedia membayar denda sesuai ketentuan jika terjadi keterlambatan atau kerusakan."_`;

    if (domainUrl) {
        teks += `

*PANTAU STATUS & HITUNG MUNDUR:*
${domainUrl}/status.html?id=${bId}`;
    }

    // Normalisasi line breaks ke CRLF (\r\n) agar format chat di WhatsApp Android/iOS tidak gepeng/menumpuk
    const safeTeks = teks.replace(/\r?\n/g, "\r\n");
    return encodeURIComponent(safeTeks);
}

// ==========================================
// 4. HITUNG MUNDUR (COUNTDOWN TIMER) CERDAS
// ==========================================
let _activeCountdownInterval = null;

function hentikanCountdown() {
    if (_activeCountdownInterval) {
        clearInterval(_activeCountdownInterval);
        _activeCountdownInterval = null;
    }
}

function parseTanggalKeMillis(val) {
    if (!val) return null;
    if (typeof val === 'number') return isNaN(val) ? null : val;
    let d = new Date(val);
    if (!isNaN(d.getTime())) return d.getTime();
    
    if (typeof val === 'string') {
        const cleanIso = val.trim().replace(' ', 'T');
        d = new Date(cleanIso);
        if (!isNaN(d.getTime())) return d.getTime();

        const parts = val.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})[ T](\d{1,2}):(\d{1,2})/);
        if (parts) {
            d = new Date(parts[1], parts[2] - 1, parts[3], parts[4], parts[5]);
            if (!isNaN(d.getTime())) return d.getTime();
        }
    }
    return null;
}

function jalankanCountdown(waktuSelesaiStr, elementId, waktuAmbilStr = null, paketDurasiLabel = null) {
    hentikanCountdown();

    let selesaiTime = parseTanggalKeMillis(waktuSelesaiStr);
    let ambilTime = parseTanggalKeMillis(waktuAmbilStr);

    // Fallback darurat jika tanggal selesai gagal diparsing:
    if (!selesaiTime) {
        if (ambilTime) {
            selesaiTime = ambilTime + (12 * 3600 * 1000);
        } else {
            selesaiTime = Date.now() + (12 * 3600 * 1000);
        }
    }

    function formatDigitBoxes(days, hours, minutes, seconds, statusType) {
        const pad = n => String(Math.max(0, n)).padStart(2, '0');
        let html = '<div class="countdown-digits-wrapper">';
        if (days > 0) {
            html += `
                <div class="countdown-box ${statusType}">
                    <div class="countdown-val">${pad(days)}</div>
                    <div class="countdown-lbl">Hari</div>
                </div>
                <div class="countdown-sep">:</div>
            `;
        }
        html += `
            <div class="countdown-box ${statusType}">
                <div class="countdown-val">${pad(hours)}</div>
                <div class="countdown-lbl">Jam</div>
            </div>
            <div class="countdown-sep">:</div>
            <div class="countdown-box ${statusType}">
                <div class="countdown-val">${pad(minutes)}</div>
                <div class="countdown-lbl">Menit</div>
            </div>
            <div class="countdown-sep">:</div>
            <div class="countdown-box ${statusType}">
                <div class="countdown-val">${pad(seconds)}</div>
                <div class="countdown-lbl">Detik</div>
            </div>
        </div>`;
        return html;
    }

    function perbaruiTimer() {
        const el = document.getElementById(elementId);
        if (!el) {
            if (_activeCountdownInterval) clearInterval(_activeCountdownInterval);
            return;
        }

        const now = new Date().getTime();

        // =========================================================================
        // BAGIAN 1: SEBELUM WAKTU SEWA (Menuju Jam Pengambilan Barang)
        // =========================================================================
        if (ambilTime && now < ambilTime) {
            const distance = ambilTime - now;
            const days = Math.floor(distance / (1000 * 60 * 60 * 24));
            const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((distance % (1000 * 60)) / 1000);

            el.innerHTML = `
                <div class="countdown-hero">
                    <span class="badge text-white countdown-badge-status mb-1" style="background: linear-gradient(135deg, #0066ff 0%, #00d2d3 100%); box-shadow: 0 4px 12px rgba(0, 102, 255, 0.25);">
                        <i class="bi bi-hourglass-top me-1"></i> FASE 1: MENUJU JAM PENGAMBILAN UNIT
                    </span>
                    ${formatDigitBoxes(days, hours, minutes, seconds, 'status-info')}
                    <div class="text-secondary fw-semibold small mt-1">
                        Durasi Paket: <strong class="text-dark">${paketDurasiLabel || 'Sesuai Paket'}</strong> &bull; Sisa waktu sewa akan otomatis mulai berjalan saat jam ambil tiba.
                    </div>
                </div>
            `;
            return;
        }

        // =========================================================================
        // BAGIAN 2: SEDANG WAKTU SEWA (Antara Waktu Ambil s.d. Batas Selesai)
        // =========================================================================
        if (now <= selesaiTime) {
            const distance = selesaiTime - now;
            const days = Math.floor(distance / (1000 * 60 * 60 * 24));
            const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((distance % (1000 * 60)) / 1000);

            el.innerHTML = `
                <div class="countdown-hero">
                    <span class="badge text-white countdown-badge-status mb-1" style="background: linear-gradient(135deg, #0066ff 0%, #7928ca 50%, #d60099 100%); box-shadow: 0 4px 12px rgba(0, 102, 255, 0.25);">
                        <i class="bi bi-clock-history me-1"></i> FASE 2: SEWA SEDANG BERJALAN &bull; SISA WAKTU
                    </span>
                    ${formatDigitBoxes(days, hours, minutes, seconds, 'status-warning')}
                    <div class="text-dark fw-bold small mt-1">
                        <i class="bi bi-shield-check me-1" style="color: #00d2d3;"></i> Unit sedang disewa. Harap kembalikan unit tepat waktu sebelum batas akhir.
                    </div>
                </div>
            `;
            return;
        }

        // =========================================================================
        // BAGIAN 3: SESUDAH WAKTU SEWA (Waktu Habis / Melewati Batas Pengembalian)
        // =========================================================================
        const overdue = now - selesaiTime;
        const days = Math.floor(overdue / (1000 * 60 * 60 * 24));
        const hours = Math.floor((overdue % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((overdue % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((overdue % (1000 * 60)) / 1000);

        let overdueText = "";
        if (days > 0) overdueText += `${days} hari `;
        if (hours > 0) overdueText += `${hours} jam `;
        overdueText += `${minutes} menit ${seconds} detik`;

        el.innerHTML = `
            <div class="countdown-hero">
                <span class="badge text-white countdown-badge-status mb-1" style="background: #d60099; box-shadow: 0 4px 14px rgba(214, 0, 153, 0.35);">
                    <i class="bi bi-exclamation-octagon-fill me-1"></i> FASE 3: WAKTU SEWA TELAH BERAKHIR &bull; LEWAT ${overdueText.toUpperCase()}
                </span>
                ${formatDigitBoxes(days, hours, minutes, seconds, 'status-danger')}
                <div class="fw-bold small mt-1" style="color: #d60099;">
                    <i class="bi bi-exclamation-triangle-fill me-1"></i> Toleransi 15 menit. Denda keterlambatan berlaku Rp 10.000 / Jam (berlaku kelipatan).
                </div>
            </div>
        `;
    }

    perbaruiTimer();
    _activeCountdownInterval = setInterval(perbaruiTimer, 1000);
}

// ==========================================
// HELPER STORAGE & FORMATTER
// ==========================================
const STORAGE_KEY = "rental_aset_current_booking";

function simpanDataBooking(data) {
    try {
        const existing = ambilDataBooking() || {};

        // Kondisi 1: Reset eksplisit dari form (bookingId: null)
        const isExplicitReset = Object.prototype.hasOwnProperty.call(data, 'bookingId') && !data.bookingId;

        // Kondisi 2: Memilih aset yang berbeda dari booking sebelumnya
        const isDifferentAsset = data.asetId && existing.asetId && data.asetId !== existing.asetId;

        // Kondisi 3: Booking sebelumnya sudah berstatus (sudah diajukan / pending / active / completed / rejected)
        const isPreviousAlreadySubmitted = !!existing.status;

        if (isExplicitReset || isDifferentAsset || isPreviousAlreadySubmitted) {
            delete existing.bookingId;
            delete existing.id;
            delete existing.status;
            delete existing.serverTimestamp;
            delete existing.waktuDiAcc;
            delete existing.recordedAt;
            delete existing.jaminanIdentitas;
            delete existing.alasanTolak;
            delete existing.catatanAcc;
            delete existing.handoverRiil;
            delete existing.waktuDikembalikan;
            delete existing.denda;
            delete existing.dendaKeterlambatan;
            delete existing.dendaKerusakan;
            delete existing.buktiFoto;
            delete existing.biayaSewaAsli;
            if (isDifferentAsset || isPreviousAlreadySubmitted) {
                delete existing.waktuAmbilRaw;
                delete existing.waktuSelesaiRaw;
                delete existing.waktuAmbil;
                delete existing.waktuSelesai;
            }
        }

        const merged = { ...existing, ...data };

        // Hapus key null/undefined dari merged agar tidak ada field null menggantung
        if (!merged.bookingId) {
            delete merged.bookingId;
        }
        if (!merged.id) {
            delete merged.id;
        }

        // Generate bookingId baru yang unik jika belum ada
        if (!merged.bookingId) {
            const inisial = (merged.nama || 'MHT').replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase() || 'MHT';
            const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
            merged.bookingId = 'INV-' + inisial + '-' + Date.now().toString(36).toUpperCase() + randomPart;
        }
        merged.id = merged.bookingId;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        return true;
    } catch (e) {
        console.error("Gagal menyimpan ke localStorage:", e);
        return false;
    }
}

function ambilDataBooking() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        console.error("Gagal membaca localStorage:", e);
        return null;
    }
}

function bersihkanDataBooking() {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
}

function cariAset(id) {
    return ambilSemuaKatalog().find(item => item.id === id) || null;
}

function formatWaktuIndo(dateInput) {
    if (!dateInput) return "-";
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return String(dateInput);

    const pad = n => String(n).padStart(2, "0");
    const tgl = pad(date.getDate());
    const bln = pad(date.getMonth() + 1);
    const thn = date.getFullYear();
    const jam = pad(date.getHours());
    const mnt = pad(date.getMinutes());

    return `${tgl}/${bln}/${thn} ${jam}:${mnt} WIB`;
}

function formatRupiah(angka) {
    if (angka === null || angka === undefined) return "Rp 0";
    return "Rp " + Number(angka).toLocaleString("id-ID");
}

function toDatetimeLocalString(date) {
    if (!date) return "";
    const pad = n => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// ==========================================
// SINKRONISASI SERVER LATAR BELAKANG (cPanel)
// ==========================================
async function sinkronisasiDataServerLatarBelakang() {
    try {
        // 1. Sinkronisasi Pengaturan Admin WA
        const resPengaturan = await fetch(dapatkanApiEndpoint('action=ambil_pengaturan'));
        if (resPengaturan.ok) {
            const jsonP = await resPengaturan.json();
            if (jsonP && jsonP.success && jsonP.data) {
                localStorage.setItem(STORAGE_ADMIN_CONFIG, JSON.stringify(jsonP.data));
            }
        }
    } catch (e) {}

    try {
        // 2. Sinkronisasi Aset Tambahan dari Admin
        const resAset = await fetch(dapatkanApiEndpoint('action=ambil_aset'));
        if (resAset.ok) {
            const jsonA = await resAset.json();
            if (jsonA && jsonA.success && Array.isArray(jsonA.data)) {
                // Deduplikasi ID server dan bersihkan salinan default yang tidak diubah
                const defaultIds = KATALOG_DEFAULT.map(k => k.id);
                const seenServer = new Set();
                const cleanServer = [];
                jsonA.data.forEach(item => {
                    if (!item || !item.id || seenServer.has(item.id)) return;
                    seenServer.add(item.id);
                    if (defaultIds.includes(item.id)) {
                        const def = KATALOG_DEFAULT.find(d => d.id === item.id);
                        if (def && def.nama === item.nama && JSON.stringify(def.paketOpsi) === JSON.stringify(item.paketOpsi)) {
                            return;
                        }
                    }
                    cleanServer.push(item);
                });

                // SMART MERGE: Gabungkan data server dengan data lokal agar aset baru tidak pernah hilang saat refresh
                const localRaw = localStorage.getItem(STORAGE_CUSTOM_ASET);
                let localList = [];
                try { localList = localRaw ? JSON.parse(localRaw) : []; } catch(e) {}

                const mapAssets = new Map();
                // 1. Masukkan data server
                cleanServer.forEach(item => {
                    if (item && item.id) mapAssets.set(item.id, item);
                });
                // 2. Jika ada aset lokal yang belum tersimpan di server, pertahankan!
                let adaAsetLokalTertinggal = false;
                if (Array.isArray(localList)) {
                    localList.forEach(item => {
                        if (item && item.id && !mapAssets.has(item.id)) {
                            mapAssets.set(item.id, item);
                            adaAsetLokalTertinggal = true;
                        }
                    });
                }

                const mergedAssets = Array.from(mapAssets.values());
                localStorage.setItem(STORAGE_CUSTOM_ASET, JSON.stringify(mergedAssets));

                // Jika ada aset lokal yang belum tersimpan di database server dan admin sedang login, auto-sinkron ke server sekarang!
                if (adaAsetLokalTertinggal && typeof sessionStorage !== 'undefined' && sessionStorage.getItem('admin_auth') === 'true') {
                    const token = ambilAdminToken();
                    fetch(dapatkanApiEndpoint(`action=simpan_aset&token=${encodeURIComponent(token)}`), {
                        method: 'POST',
                        headers: ambilHeaderAdminAuth(),
                        body: JSON.stringify({ assets: mergedAssets, admin_token: token })
                    }).catch(() => {});
                }
            }
        }
    } catch (e) {}

    try {
        // 3. Sinkronisasi Kategori Dinamis
        const resKat = await fetch(dapatkanApiEndpoint('action=ambil_kategori'));
        if (resKat.ok) {
            const jsonK = await resKat.json();
            if (jsonK && jsonK.success && Array.isArray(jsonK.data) && jsonK.data.length > 0) {
                localStorage.setItem(STORAGE_CATEGORIES, JSON.stringify(jsonK.data));
            }
        }
    } catch (e) {}

    // Beritahukan ke seluruh antarmuka UI bahwa sinkronisasi data server telah selesai
    try {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('sinkronisasi-selesai'));
        }
    } catch (e) {}
}

if (typeof window !== 'undefined') {
    sinkronisasiDataServerLatarBelakang();
}

// =========================================================
// PENGIRIMAN PESAN WHATSAPP MULTI SESSION OTOMATIS (DUAL-MODE)
// =========================================================
async function kirimWaGatewayOtomatis(nomorTujuan, pesan, customSessionId = null) {
    if (!nomorTujuan || !pesan) return false;

    const cfg = ambilPengaturanAdmin();
    const gw = cfg.waGateway || {};
    if (gw.enabled === false) return false;

    const apiUrl = (gw.apiUrl || "https://wa-multi-session.amtsilatipusat.com/api/v1").replace(/\/+$/, "");
    const apiKey = gw.apiKey || "1fcea2a9-6c3d-4158-8280-76ccdb9d9f66";
    const sessionId = customSessionId || gw.sessionIdAdmin || "0ab9413c-aab1-4705-bd92-3e4b0a8c5426";

    let cleanNo = String(nomorTujuan).replace(/[^0-9]/g, "");
    if (cleanNo.startsWith("0")) cleanNo = "62" + cleanNo.slice(1);
    else if (cleanNo.startsWith("8")) cleanNo = "62" + cleanNo;
    if (!cleanNo) return false;

    try {
        const res = await fetch(`${apiUrl}/sessions/${encodeURIComponent(sessionId)}/send`, {
            method: "POST",
            headers: {
                "X-API-Key": apiKey,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                to: cleanNo,
                message: pesan
            })
        });
        return res.ok;
    } catch (e) {
        console.warn("[WA Gateway Client] Gagal mengirim langsung dari browser:", e);
        return false;
    }
}

async function kirimNotifikasiBookingOtomatis(booking) {
    if (!booking) return;
    const cfg = ambilPengaturanAdmin();
    const gw = cfg.waGateway || {};

    const bId = booking.bookingId || "INV-0000";
    const nama = booking.nama || "Santri";
    const noWa = booking.noWa || "";
    const namaBarang = booking.namaBarang || "Aset";
    const waktuAmbil = booking.waktuAmbil || "-";
    const waktuKembali = booking.waktuSelesai || "-";
    const komunitas = booking.komunitas || (booking.departemen || "-");

    const isDinas = booking.isDinas || (parseInt(booking.biayaSewa || 0) === 0 && !!booking.biayaSewaAsli);
    const biayaTeks = isDinas ? "Gratis (Khusus Tugas Resmi Pondok)" : formatRupiah(booking.biayaSewa || 0);

    const baseUrl = (typeof dapatkanBaseUrl === "function" && dapatkanBaseUrl()) ? dapatkanBaseUrl() : window.location.origin;
    // 1. Pesan Otomatis ke Santri / Peminjam (MENUNGGU KONFIRMASI & MURNI TANPA LINK)
    if (noWa && gw.notifySantriBooking !== false) {
        const pesanSantri = `Assalamu'alaikum wr. wb. Saudara/i *${nama}*,\n\n` +
            `Alhamdulillah, pengajuan sewa aset *${namaBarang}* (*${bId}*) telah kami terima di sistem dan saat ini sedang *MENUNGGU KONFIRMASI (ACC)* dari Pengurus Ma'had Aly Amtsilati.\n\n` +
            `*Rincian Peminjaman:*\n` +
            `- No. Transaksi: *${bId}*\n` +
            `- Aset: *${namaBarang}*\n` +
            `- Jadwal Pengambilan: *${waktuAmbil}*\n` +
            `- Batas Pengembalian: *${waktuKembali}*\n` +
            `- Biaya Sewa: *${biayaTeks}*\n\n` +
            `_Mohon menunggu konfirmasi persetujuan resmi (ACC) via WhatsApp sebelum mengambil unit ke Kantor Ma'had Aly Amtsilati._\n\n` +
            `Wassalamu'alaikum wr. wb.\n` +
            `*Pengurus Ma'had Aly Amtsilati*`;
        await kirimWaGatewayOtomatis(noWa, pesanSantri);
    }

    // Jeda 3 detik
    await new Promise(r => setTimeout(r, 3000));

    // 2. Pesan Otomatis ke Admin Pengurus (Mas Ganteng untuk Admin 1 / Mbak Cantik untuk Admin 2)
    const isAdm2 = (booking && (booking.adminPic === "admin2" || booking.adminPic === "2"));
    const sapaanAdmin = isAdm2 ? "Mbak Cantik" : "Mas Ganteng";
    const adminPhone = (typeof dapatkanNomorWaAdmin === "function") ? dapatkanNomorWaAdmin(booking) : (gw.phonePengantara || "628812762520");
    if (adminPhone && gw.notifyAdminNewBooking !== false) {
        const pesanAdmin = `🔔 *PERMOHONAN SEWA / PINJAM ASET BARU*\n\n` +
            `Assalamu'alaikum ${sapaanAdmin},\n` +
            `Terdapat pengajuan sewa unit baru masuk ke sistem yang memerlukan konfirmasi & persetujuan (ACC / Tolak):\n\n` +
            `- No. Transaksi: *${bId}*\n` +
            `- Peminjam: *${nama}* (${noWa})\n` +
            `- Asrama/Dept: *${komunitas}*\n` +
            `- Aset: *${namaBarang}*\n` +
            `- Jadwal: *${waktuAmbil}* s.d *${waktuKembali}*\n` +
            `- Biaya: *${biayaTeks}*\n\n` +
            `👉 *Buka Dashboard Admin untuk Verifikasi & ACC / Tolak:*\n` +
            `${baseUrl}/admin-dashboard.html`;
        await kirimWaGatewayOtomatis(adminPhone, pesanAdmin);
    }
}

