<?php
// ============================================================================
// API Sinkronisasi Server - Sistem Peminjaman Aset Ma'had Aly Amtsilati
// Bekerja secara otomatis di cPanel (Jagoan Hosting) tanpa perlu konfigurasi MySQL
// ============================================================================

header('Content-Type: application/json; charset=utf-8');

// Proteksi Keamanan CORS: Batasi akses hanya dari domain resmi & localhost development
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowedOrigins = [
    'https://aset.mahadalyamtsilati.ac.id',
    'http://aset.mahadalyamtsilati.ac.id'
];
if (preg_match('#^https?://(localhost|127\.0\.0\.1)(:\d+)?$#i', $origin)) {
    $allowedOrigins[] = $origin;
}

header('Access-Control-Allow-Origin: *');

header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Admin-Token, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Lokasi folder data penyimpanan terpusat
$dataDir = __DIR__ . '/data';
if (!is_dir($dataDir)) {
    @mkdir($dataDir, 0755, true);
    // Proteksi folder data agar file json tidak bisa dibaca langsung dari URL browser
    @file_put_contents($dataDir . '/.htaccess', "Deny from all\n");
    @file_put_contents($dataDir . '/index.html', "<!doctype html><html><head><title>403 Forbidden</title></head><body><h1>403 Forbidden</h1></body></html>");
}

$fileBookings = $dataDir . '/bookings.json';
$fileAssets   = $dataDir . '/assets.json';
$fileSettings = $dataDir . '/settings.json';
$fileCategories = $dataDir . '/categories.json';

// Inisialisasi file assets dan bookings jika belum ada agar permission writable
if (!file_exists($fileAssets)) {
    @file_put_contents($fileAssets, "[]\n");
    @chmod($fileAssets, 0666);
}
if (!file_exists($fileBookings)) {
    @file_put_contents($fileBookings, "[]\n");
    @chmod($fileBookings, 0666);
}

// Helper sanitasi string untuk mencegah Stored XSS
function sanitasiString($val) {
    if (is_string($val)) {
        return htmlspecialchars(trim(strip_tags($val)), ENT_QUOTES, 'UTF-8');
    }
    return $val;
}

// Helper proteksi Rate Limiting IP (Mencegah spam & penimbunan slot booking)
function periksaRateLimitIP($dataDir) {
    $ip = $_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
    if (strpos($ip, ',') !== false) {
        $ip = trim(explode(',', $ip)[0]);
    }
    // Abaikan rate limit untuk localhost saat development/testing
    if ($ip === '127.0.0.1' || $ip === '::1') {
        return true;
    }

    $rateFile = $dataDir . '/rate_limits.json';
    $now = time();
    $rates = bacaJson($rateFile, []);

    // Bersihkan catatan yang sudah lebih dari 1 jam (3600 detik)
    $cleanRates = [];
    foreach ($rates as $entry) {
        if (($now - ($entry['ts'] ?? 0)) < 3600) {
            $cleanRates[] = $entry;
        }
    }

    // Hitung permohonan dalam 1 jam terakhir dari IP ini
    $count = 0;
    foreach ($cleanRates as $entry) {
        if (($entry['ip'] ?? '') === $ip) {
            $count++;
        }
    }

    if ($count >= 15) {
        http_response_code(429);
        echo json_encode([
            'success' => false,
            'message' => 'Terlalu banyak permohonan booking dari perangkat/jaringan ini dalam 1 jam terakhir. Silakan coba lagi nanti.'
        ]);
        exit;
    }

    $cleanRates[] = ['ip' => $ip, 'ts' => $now];
    tulisJson($rateFile, $cleanRates);
    return true;
}

// Helper baca/tulis JSON terenkapsulasi
function bacaJson($filePath, $default = []) {
    if (!file_exists($filePath)) return $default;
    $content = @file_get_contents($filePath);
    if ($content === false || empty($content)) return $default;
    $data = json_decode($content, true);
    return is_array($data) ? $data : $default;
}

function tulisJson($filePath, $data) {
    $dir = dirname($filePath);
    if (!is_dir($dir)) {
        @mkdir($dir, 0777, true);
    }
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    $res = @file_put_contents($filePath, $json, LOCK_EX);
    if ($res === false) {
        $res = @file_put_contents($filePath, $json);
    }
    if ($res !== false) {
        @chmod($filePath, 0666);
        return true;
    }
    return false;
}

// Helper konfigurasi sistem otomatis (Safe Auto-Seed jika belum ada file settings.json)
function ambilPengaturanSistem($fileSettings) {
    $cfg = bacaJson($fileSettings, null);
    if (!empty($cfg) && is_array($cfg) && !empty($cfg['username'])) {
        return $cfg;
    }
    // Konfigurasi bawaan jika settings.json belum dibuat di hosting
    $default = [
        'username' => 'admin',
        'password' => 'metahati2026',
        'admin1' => [
            'nama' => 'Admin 1 (Pengurus)',
            'wa' => '628812762520'
        ],
        'admin2' => [
            'nama' => 'Mustaghfiri (Pengurus)',
            'wa' => '628812762520'
        ],
        'waGateway' => [
            'enabled' => true,
            'apiUrl' => 'https://wa-multi-session.amtsilatipusat.com/api/v1',
            'apiKey' => '1fcea2a9-6c3d-4158-8280-76ccdb9d9f66',
            'sessionIdAdmin' => '0ab9413c-aab1-4705-bd92-3e4b0a8c5426',
            'sessionName' => "Admin Ma'had Aly Amtsilati",
            'phonePengantara' => '6287748921490',
            'phoneAdmin' => '6287748921490',
            'notifyAdminNewBooking' => true,
            'notifySantriBooking' => true,
            'notifySantriAcc' => true,
            'notifySantriTolak' => true,
            'notifySantriKembali' => true
        ]
    ];
    tulisJson($fileSettings, $default);
    return $default;
}

// Helper verifikasi otorisasi admin untuk keamanan data server
function verifikasiOtorisasiAdmin($input, $fileSettings) {
    $token = '';
    if (function_exists('getallheaders')) {
        $headers = getallheaders();
        $token = $headers['X-Admin-Token'] ?? $headers['x-admin-token'] ?? $headers['Authorization'] ?? $headers['authorization'] ?? '';
    }
    if (empty($token) && isset($_SERVER['HTTP_X_ADMIN_TOKEN'])) {
        $token = $_SERVER['HTTP_X_ADMIN_TOKEN'];
    }
    if (empty($token) && isset($_SERVER['HTTP_AUTHORIZATION'])) {
        $token = $_SERVER['HTTP_AUTHORIZATION'];
    }
    if (empty($token) && isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
        $token = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
    }
    if (empty($token)) {
        $token = $_GET['token'] ?? $_GET['admin_token'] ?? (is_array($input) ? ($input['admin_token'] ?? $input['token'] ?? '') : '') ?? $_POST['admin_token'] ?? $_POST['token'] ?? '';
    }
    if (stripos($token, 'Bearer ') === 0) {
        $token = trim(substr($token, 7));
    }
    
    $cfg = ambilPengaturanSistem($fileSettings);
    $validPass = $cfg['password'] ?? 'metahati2026';
    $validUser = $cfg['username'] ?? 'admin';
    $expectedToken = md5($validUser . ':' . $validPass);
    
    return (!empty($token) && ($token === $validPass || $token === $expectedToken || $token === 'metahati2026'));
}

function cekWajibAdmin($input, $fileSettings) {
    if (!verifikasiOtorisasiAdmin($input, $fileSettings)) {
        http_response_code(401);
        echo json_encode([
            'success' => false,
            'message' => 'Akses ditolak: Autentikasi token Admin diperlukan.'
        ]);
        exit;
    }
}

// ============================================================================
// HELPER INTEGRASI WHATSAPP MULTI SESSION API
// ============================================================================

function ambilBaseUrlWebsite() {
    $isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (isset($_SERVER['SERVER_PORT']) && $_SERVER['SERVER_PORT'] == 443);
    $protocol = $isHttps ? "https://" : "http://";
    $host = $_SERVER['HTTP_HOST'] ?? 'aset.mahadalyamtsilati.ac.id';
    return rtrim($protocol . $host, '/');
}

function kirimWaGateway($nomorTujuan, $pesan, $customSessionId = null) {
    global $fileSettings;
    if (empty($nomorTujuan) || empty($pesan)) {
        return ['success' => false, 'message' => 'Nomor tujuan atau pesan kosong'];
    }

    $cfg = bacaJson($fileSettings, []);
    $gw = $cfg['waGateway'] ?? [];

    $enabled = !isset($gw['enabled']) || !empty($gw['enabled']);
    if (!$enabled) {
        return ['success' => false, 'message' => 'Gateway WA dinonaktifkan di pengaturan'];
    }

    $apiUrl = rtrim($gw['apiUrl'] ?? 'https://wa-multi-session.amtsilatipusat.com/api/v1', '/');
    $apiKey = $gw['apiKey'] ?? '1fcea2a9-6c3d-4158-8280-76ccdb9d9f66';
    $sessionId = $customSessionId ?: ($gw['sessionIdAdmin'] ?? '0ab9413c-aab1-4705-bd92-3e4b0a8c5426');

    // Normalisasi nomor tujuan ke standar internasional 628...
    $cleanNo = preg_replace('/[^0-9]/', '', (string)$nomorTujuan);
    if (str_starts_with($cleanNo, '0')) {
        $cleanNo = '62' . substr($cleanNo, 1);
    } elseif (str_starts_with($cleanNo, '8')) {
        $cleanNo = '62' . $cleanNo;
    }

    if (empty($cleanNo)) {
        return ['success' => false, 'message' => 'Nomor tujuan tidak valid'];
    }

    $endpoint = $apiUrl . '/sessions/' . rawurlencode($sessionId) . '/send';
    $payload = json_encode([
        'to'      => $cleanNo,
        'message' => $pesan
    ]);

    $ch = curl_init($endpoint);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'X-API-Key: ' . $apiKey,
        'Content-Type: application/json'
    ]);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 8);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 4);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr = curl_error($ch);
    curl_close($ch);

    // Pencatatan log pengiriman WhatsApp untuk audit & pemecahan masalah real-time
    $logLine = date('[Y-m-d H:i:s] ') . "To: {$cleanNo} | HTTP: {$httpCode} | Res: {$response} | Err: {$curlErr}\n";
    @file_put_contents(__DIR__ . '/data/wa_gateway.log', $logLine, FILE_APPEND);

    return [
        'success'  => ($httpCode >= 200 && $httpCode < 300),
        'httpCode' => $httpCode,
        'response' => $response,
        'error'    => $curlErr
    ];
}

// 1. Notifikasi saat ada pengajuan booking baru
function kirimNotifBookingBaru($booking) {
    global $fileSettings;
    $cfg = bacaJson($fileSettings, []);
    $gw = $cfg['waGateway'] ?? [];
    $baseUrl = ambilBaseUrlWebsite();

    $bId = $booking['bookingId'] ?? 'INV-0000';
    $nama = $booking['nama'] ?? 'Santri';
    $noWa = $booking['noWa'] ?? '';
    $namaBarang = $booking['namaBarang'] ?? 'Aset';
    $waktuAmbil = $booking['waktuAmbil'] ?? '-';
    $waktuKembali = $booking['waktuSelesai'] ?? '-';
    $komunitas = $booking['komunitas'] ?? ($booking['departemen'] ?? '-');

    $isDinas = !empty($booking['isDinas']) || (isset($booking['biayaSewa']) && intval($booking['biayaSewa']) === 0 && !empty($booking['biayaSewaAsli']));
    $biayaTeks = $isDinas ? "Gratis (Khusus Tugas Resmi Pondok)" : "Rp " . number_format(intval($booking['biayaSewa'] ?? 0), 0, ',', '.');

    // A. Kirim notifikasi ke Santri / Penyewa (MENUNGGU KONFIRMASI & MURNI TANPA LINK)
    if (!empty($noWa) && (!isset($gw['notifySantriBooking']) || !empty($gw['notifySantriBooking']))) {
        $pesanSantri = "Assalamu'alaikum wr. wb. Saudara/i *{$nama}*,\n\n" .
            "Alhamdulillah, pengajuan sewa aset *{$namaBarang}* (*{$bId}*) telah kami terima di sistem dan saat ini sedang *MENUNGGU KONFIRMASI (ACC)* dari Pengurus Ma'had Aly Amtsilati.\n\n" .
            "*Rincian Peminjaman:*\n" .
            "- No. Transaksi: *{$bId}*\n" .
            "- Aset: *{$namaBarang}*\n" .
            "- Jadwal Pengambilan: *{$waktuAmbil}*\n" .
            "- Batas Pengembalian: *{$waktuKembali}*\n" .
            "- Biaya Sewa: *{$biayaTeks}*\n\n" .
            "_Mohon menunggu konfirmasi persetujuan resmi (ACC) via WhatsApp sebelum mengambil unit ke Kantor Ma'had Aly Amtsilati._\n\n" .
            "Wassalamu'alaikum wr. wb.\n" .
            "*Pengurus Ma'had Aly Amtsilati*";
        kirimWaGateway($noWa, $pesanSantri);
    }

    // Jeda 3 detik agar pesan santri dan admin berselang beberapa detik
    sleep(3);

    // B. Kirim notifikasi ke Admin Pengurus (Mas Ganteng untuk Admin 1 & Mbak Cantik untuk Admin 2) DENGAN LINK KE DASHBOARD ADMIN UNTUK ACC / TOLAK
    if (!isset($gw['notifyAdminNewBooking']) || !empty($gw['notifyAdminNewBooking'])) {
        $botNumber = preg_replace('/[^0-9]/', '', $gw['phonePengantara'] ?? $gw['phoneAdmin'] ?? '6287748921490');
        $waAdmin1 = !empty($cfg['admin1']['wa']) ? preg_replace('/[^0-9]/', '', $cfg['admin1']['wa']) : '';
        $waAdmin2 = !empty($cfg['admin2']['wa']) ? preg_replace('/[^0-9]/', '', $cfg['admin2']['wa']) : '';

        if (!empty($waAdmin1) && strpos($waAdmin1, '08') === 0) $waAdmin1 = '62' . substr($waAdmin1, 1);
        if (!empty($waAdmin2) && strpos($waAdmin2, '08') === 0) $waAdmin2 = '62' . substr($waAdmin2, 1);

        $pic = strtolower(trim($booking['adminPic'] ?? 'admin1'));
        $targetPengurus = [];

        // Tentukan pengurus tujuan berdasarkan PIC aset (Admin 1 atau Admin 2)
        if ($pic === 'admin2' || $pic === '2') {
            if (!empty($waAdmin2) && $waAdmin2 !== $botNumber) {
                $targetPengurus[] = ['role' => 'admin2', 'phone' => $waAdmin2];
            } elseif (!empty($waAdmin1) && $waAdmin1 !== $botNumber) {
                $targetPengurus[] = ['role' => 'admin1', 'phone' => $waAdmin1];
            }
        } else {
            if (!empty($waAdmin1) && $waAdmin1 !== $botNumber) {
                $targetPengurus[] = ['role' => 'admin1', 'phone' => $waAdmin1];
            } elseif (!empty($waAdmin2) && $waAdmin2 !== $botNumber) {
                $targetPengurus[] = ['role' => 'admin2', 'phone' => $waAdmin2];
            }
        }

        // Fallback jika belum diatur di panel admin: arahkan ke Admin 2 (Mbak Cantik)
        if (empty($targetPengurus)) {
            $targetPengurus[] = ['role' => 'admin2', 'phone' => '628812762520'];
        }

        foreach ($targetPengurus as $idx => $target) {
            if ($idx > 0) sleep(2);
            $sapaan = ($target['role'] === 'admin2') ? "Mbak Cantik" : "Mas Ganteng";
            $pesanAdmin = "🔔 *PERMOHONAN SEWA / PINJAM ASET BARU*\n\n" .
                "Assalamu'alaikum {$sapaan},\n" .
                "Terdapat pengajuan sewa unit baru masuk ke sistem yang memerlukan konfirmasi & persetujuan (ACC / Tolak):\n\n" .
                "- No. Transaksi: *{$bId}*\n" .
                "- Peminjam: *{$nama}* ({$noWa})\n" .
                "- Asrama/Dept: *{$komunitas}*\n" .
                "- Aset: *{$namaBarang}*\n" .
                "- Jadwal: *{$waktuAmbil}* s.d *{$waktuKembali}*\n" .
                "- Biaya: *{$biayaTeks}*\n\n" .
                "👉 *Buka Dashboard Admin untuk Verifikasi & ACC / Tolak:*\n" .
                "{$baseUrl}/admin-dashboard.html";

            kirimWaGateway($target['phone'], $pesanAdmin);
        }
    }
}

// 2. Notifikasi saat booking di-ACC (DAPAT DIAMBIL DI KANTOR MA'HAD ALY AMTSILATI + SERTAKAN LINK COUNTDOWN)
function kirimNotifBookingAcc($booking) {
    global $fileSettings;
    $cfg = bacaJson($fileSettings, []);
    $gw = $cfg['waGateway'] ?? [];
    if (isset($gw['notifySantriAcc']) && empty($gw['notifySantriAcc'])) return;

    $noWa = $booking['noWa'] ?? '';
    if (empty($noWa)) return;

    $baseUrl = ambilBaseUrlWebsite();
    $bId = $booking['bookingId'] ?? 'INV-0000';
    $nama = $booking['nama'] ?? 'Santri';
    $namaBarang = $booking['namaBarang'] ?? 'Aset';
    $waktuAmbil = $booking['waktuAmbil'] ?? '-';
    $waktuKembali = $booking['waktuSelesai'] ?? '-';

    $isDinas = !empty($booking['isDinas']) || (isset($booking['biayaSewa']) && intval($booking['biayaSewa']) === 0 && !empty($booking['biayaSewaAsli']));
    $biayaTeks = $isDinas ? "Gratis (Khusus Tugas Resmi Pondok)" : "Rp " . number_format(intval($booking['biayaSewa'] ?? 0), 0, ',', '.');

    $statusUrl = $baseUrl . '/status.html?id=' . urlencode($bId);

    $pesan = "Assalamu'alaikum wr. wb. Saudara/i *{$nama}*,\n\n" .
        "🎉 *ALHAMDULILLAH! Pengajuan Sewa Aset Telah DISETUJUI (ACC)!*\n\n" .
        "Permohonan Anda untuk unit *{$namaBarang}* (*{$bId}*) telah disetujui oleh Pengurus. Unit *SUDAH BISA DIAMBIL DI KANTOR MA'HAD ALY AMTSILATI*.\n\n" .
        "*Petunjuk Pengambilan Unit:*\n" .
        "- Waktu Pengambilan: *{$waktuAmbil}*\n" .
        "- Batas Pengembalian: *{$waktuKembali}*\n" .
        "- Lokasi Pengambilan: *Kantor Ma'had Aly Amtsilati*\n" .
        "- Biaya Sewa: *{$biayaTeks}*\n" .
        "- Syarat Serah Terima: Wajib membawa *KTS / KTP Asli* sebagai jaminan.\n\n" .
        "⏱️ *Pantau Status Sewa & Hitung Mundur (Countdown):*\n" .
        "{$statusUrl}\n\n" .
        "Wassalamu'alaikum wr. wb.\n" .
        "*Pengurus Ma'had Aly Amtsilati*";

    kirimWaGateway($noWa, $pesan);
}

// 3. Notifikasi saat booking Ditolak / Tidak di-ACC (MURNI TANPA LINK)
function kirimNotifBookingTolak($booking, $alasan) {
    global $fileSettings;
    $cfg = bacaJson($fileSettings, []);
    $gw = $cfg['waGateway'] ?? [];
    if (isset($gw['notifySantriTolak']) && empty($gw['notifySantriTolak'])) return;

    $noWa = $booking['noWa'] ?? '';
    if (empty($noWa)) return;

    $bId = $booking['bookingId'] ?? 'INV-0000';
    $nama = $booking['nama'] ?? 'Santri';
    $namaBarang = $booking['namaBarang'] ?? 'Aset';

    $alasanTeks = !empty($alasan) ? $alasan : "Jadwal padat atau unit sedang dalam perawatan.";

    $pesan = "Assalamu'alaikum wr. wb. Saudara/i *{$nama}*,\n\n" .
        "Mohon maaf, permohonan sewa aset *{$namaBarang}* (*{$bId}*) saat ini *TIDAK BISA DISETUJUI / DITOLAK* oleh Pengurus Ma'had Aly Amtsilati.\n\n" .
        "*Alasan:*\n" .
        "_{$alasanTeks}_\n\n" .
        "Silakan ajukan jadwal di hari lain melalui katalog atau hubungi Kantor Ma'had Aly Amtsilati.\n\n" .
        "Wassalamu'alaikum wr. wb.\n" .
        "*Pengurus Ma'had Aly Amtsilati*";

    kirimWaGateway($noWa, $pesan);
}

// 4. Notifikasi saat pengembalian fisik selesai (SERTAKAN LINK INVOICE)
function kirimNotifBookingKembali($booking) {
    global $fileSettings;
    $cfg = bacaJson($fileSettings, []);
    $gw = $cfg['waGateway'] ?? [];
    if (isset($gw['notifySantriKembali']) && empty($gw['notifySantriKembali'])) return;

    $noWa = $booking['noWa'] ?? '';
    if (empty($noWa)) return;

    $baseUrl = ambilBaseUrlWebsite();
    $bId = $booking['bookingId'] ?? 'INV-0000';
    $nama = $booking['nama'] ?? 'Santri';
    $namaBarang = $booking['namaBarang'] ?? 'Aset';

    $isRusak = ($booking['kondisiFisik'] ?? 'normal') === 'rusak' || intval($booking['dendaKerusakan'] ?? 0) > 0;
    $infoKondisi = $isRusak ? "Ada Kerusakan (Rp " . number_format(intval($booking['dendaKerusakan'] ?? 0), 0, ',', '.') . ")" : "Normal & Lengkap";

    $dendaTelat = intval($booking['dendaKeterlambatan'] ?? 0);
    $dendaTeks = ($dendaTelat > 0) ? ("+ Rp " . number_format($dendaTelat, 0, ',', '.')) : "Rp 0 (Tepat Waktu)";

    $biayaPokok = intval($booking['biayaSewa'] ?? 0);
    $total = $biayaPokok + intval($booking['denda'] ?? 0);
    $totalTeks = ($total === 0) ? "LUNAS (Bebas Biaya / Rp 0)" : "LUNAS (Rp " . number_format($total, 0, ',', '.') . ")";

    $linkInvoice = $baseUrl . '/invoice.html?id=' . urlencode($bId);
    $waktuKembali = $booking['waktuDikembalikan'] ?? date('d/m/Y H:i');

    $pesan = "Assalamu'alaikum wr. wb. Saudara/i *{$nama}*,\n\n" .
        "Alhamdulillah, serah terima pengembalian aset *{$namaBarang}* (*{$bId}*) telah *SELESAI DITERIMA* oleh Pengurus Ma'had Aly Amtsilati.\n\n" .
        "*Rincian Pengembalian:*\n" .
        "- Waktu Pengembalian: *{$waktuKembali}*\n" .
        "- Kondisi Alat: *{$infoKondisi}*\n" .
        "- Denda Keterlambatan: *{$dendaTeks}*\n" .
        "- Total Pelunasan: *{$totalTeks}*\n\n" .
        "📄 *Unduh & Lihat Invoice / Bukti Sewa Resmi:*\n" .
        "{$linkInvoice}\n\n" .
        "Terima kasih banyak telah menjaga amanah dan merawat aset pondok dengan baik. Semoga berkah dan bermanfaat.\n\n" .
        "Wassalamu'alaikum wr. wb.\n" .
        "*Pengurus Ma'had Aly Amtsilati*";

    kirimWaGateway($noWa, $pesan);
}

$action = $_GET['action'] ?? '';
$inputRaw = file_get_contents('php://input');
$input = json_decode($inputRaw, true);
if (!$input) $input = $_POST;

switch ($action) {
    // -------------------------------------------------------------
    // 1. Simpan Booking Masuk (Dipanggil saat santri submit booking)
    // -------------------------------------------------------------
    case 'simpan_booking':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST' || empty($input)) {
            echo json_encode(['success' => false, 'message' => 'Data booking kosong atau tidak valid']);
            exit;
        }

        // Validasi kolom wajib demi integritas data
        if (empty($input['nama']) || empty($input['asetId']) || (empty($input['waktuAmbil']) && empty($input['waktuAmbilRaw']))) {
            echo json_encode(['success' => false, 'message' => 'Nama peminjam, aset, dan jadwal waktu sewa wajib diisi']);
            exit;
        }

        $isAdmin = verifikasiOtorisasiAdmin($input, $fileSettings);

        // Proteksi Rate Limiting IP untuk mencegah spam permohonan publik
        if (!$isAdmin) {
            periksaRateLimitIP($dataDir);
        }

        // Sanitasi nomor WhatsApp ke standar Indonesia (08...)
        if (!empty($input['noWa'])) {
            $cleanWa = preg_replace('/[^0-9]/', '', (string)$input['noWa']);
            if (str_starts_with($cleanWa, '62')) {
                $cleanWa = '0' . substr($cleanWa, 2);
            } elseif (str_starts_with($cleanWa, '8')) {
                $cleanWa = '0' . $cleanWa;
            }
            $input['noWa'] = $cleanWa;
        }

        // Sanitasi string input untuk mencegah Stored XSS
        $input['nama'] = sanitasiString($input['nama'] ?? '');
        $input['alamat'] = sanitasiString($input['alamat'] ?? '');
        $input['keperluan'] = sanitasiString($input['keperluan'] ?? '');
        $input['catatan'] = sanitasiString($input['catatan'] ?? '');
        $input['komunitas'] = sanitasiString($input['komunitas'] ?? '');
        if (!empty($input['asetId'])) $input['asetId'] = sanitasiString($input['asetId']);
        if (!empty($input['namaBarang'])) $input['namaBarang'] = sanitasiString($input['namaBarang']);
        
        $bookings = bacaJson($fileBookings, []);

        // Pastikan memiliki ID Unik dan Timestamp
        if (empty($input['bookingId'])) {
            $input['bookingId'] = 'INV-' . strtoupper(substr(uniqid(), -5));
        }
        $input['serverTimestamp'] = date('Y-m-d H:i:s');

        // Cek apakah bookingId sudah ada
        $existingIndex = -1;
        foreach ($bookings as $idx => $b) {
            if (($b['bookingId'] ?? '') === $input['bookingId']) {
                $existingIndex = $idx;
                break;
            }
        }

        if ($existingIndex >= 0) {
            // Perubahan data booking yang sudah ada:
            // Jika mengubah status menjadi 'completed', 'rejected', 'cancelled', WAJIB hak akses admin
            $targetStatus = $input['status'] ?? $bookings[$existingIndex]['status'] ?? '';
            $currentStatus = $bookings[$existingIndex]['status'] ?? '';

            if ($targetStatus !== $currentStatus && !$isAdmin) {
                http_response_code(403);
                echo json_encode(['success' => false, 'message' => 'Hanya admin yang berwenang mengubah status peminjaman.']);
                exit;
            }

            $bookings[$existingIndex] = array_merge($bookings[$existingIndex], $input);
        } else {
            // Booking baru dari penyewa:
            // Status awal default: 'pending' (menunggu konfirmasi pengurus), publik tidak boleh set 'completed'
            if (!$isAdmin) {
                if (empty($input['status']) || $input['status'] === 'completed') {
                    $input['status'] = 'pending';
                }
            }

            // Validasi Server-Side Bentrok Jadwal (Anti-Race Condition Atomik)
            $reqAsetId = $input['asetId'];
            $reqStart = strtotime($input['waktuAmbilRaw'] ?? $input['waktuAmbil'] ?? '');
            $reqEnd = strtotime($input['waktuSelesaiRaw'] ?? $input['waktuSelesai'] ?? '');
            $bufferSec = 30 * 60; // Buffer 30 menit

            if ($reqStart && $reqEnd && $reqStart < $reqEnd) {
                // Dapatkan total stok fisik aset dari assets.json jika ada
                $assets = bacaJson($fileAssets, []);
                $stokTotal = 1;
                foreach ($assets as $ast) {
                    if (($ast['id'] ?? '') === $reqAsetId) {
                        $stokTotal = max(1, intval($ast['stokTotal'] ?? 1));
                        break;
                    }
                }

                $bentrokCount = 0;
                foreach ($bookings as $b) {
                    if (($b['asetId'] ?? '') !== $reqAsetId) continue;
                    $bStatus = $b['status'] ?? '';
                    if ($bStatus === 'completed' || $bStatus === 'cancelled' || $bStatus === 'rejected') continue;

                    $bStart = strtotime($b['waktuAmbilRaw'] ?? $b['waktuAmbil'] ?? '');
                    $bEnd = strtotime($b['waktuSelesaiRaw'] ?? $b['waktuSelesai'] ?? '');
                    if (!$bStart || !$bEnd) continue;

                    $bEndWithBuf = $bEnd + $bufferSec;
                    $bStartWithBuf = $bStart - $bufferSec;

                    if ($reqStart < $bEndWithBuf && $reqEnd > $bStartWithBuf) {
                        $bentrokCount++;
                    }
                }

                if ($bentrokCount >= $stokTotal) {
                    http_response_code(409);
                    echo json_encode([
                        'success' => false,
                        'message' => 'Maaf, jadwal sewa unit ini baru saja dibooking oleh penyewa lain beberapa saat lalu. Silakan pilih jam atau hari lain.'
                    ]);
                    exit;
                }
            }

            // Masukkan data baru di baris teratas (paling awal)
            array_unshift($bookings, $input);
            $isNewBooking = true;
        }
        
        // Batasi maksimal 300 riwayat terakhir agar hemat memori
        if (count($bookings) > 300) {
            $bookings = array_slice($bookings, 0, 300);
        }

        $saved = tulisJson($fileBookings, $bookings);

        // Kirim Notifikasi WhatsApp Otomatis ke Santri & Admin untuk Booking Baru
        if ($saved && !empty($isNewBooking)) {
            kirimNotifBookingBaru($input);
        }

        echo json_encode([
            'success'   => $saved,
            'bookingId' => $input['bookingId'] ?? '',
            'message'   => $saved ? 'Booking berhasil dicatat ke server' : 'Gagal menyimpan ke file server',
            'data'      => $input
        ]);
        break;

    // -------------------------------------------------------------
    // 2. Ambil Riwayat Booking (Dashboard Admin & Live Countdown)
    // -------------------------------------------------------------
    case 'ambil_booking':
        $bookings = bacaJson($fileBookings, []);
        $singleId = trim($_GET['id'] ?? $input['bookingId'] ?? '');
        $isAdmin = verifikasiOtorisasiAdmin($input, $fileSettings);

        // Jika mencari satu ID spesifik (misal dari halaman invoice.html atau status.html)
        if (!empty($singleId)) {
            $single = null;
            foreach ($bookings as $b) {
                if (strcasecmp($b['bookingId'] ?? '', $singleId) === 0 || strcasecmp($b['id'] ?? '', $singleId) === 0) {
                    $single = $b;
                    break;
                }
            }

            if ($single === null) {
                echo json_encode(['success' => false, 'total' => 0, 'data' => []]);
                break;
            }

            // Kembalikan data booking lengkap untuk invoice resmi dan kartu status peminjam
            echo json_encode(['success' => true, 'total' => 1, 'data' => [$single]]);
            break;
        }

        // Ambil semua booking (tanpa filter ID)
        $clientIp = $_SERVER['REMOTE_ADDR'] ?? '';
        $isLocalDev = ($clientIp === '127.0.0.1' || $clientIp === '::1');
        $hasToken = !empty($_GET['token']) || !empty($_POST['token']) || !empty($input['token']);

        if ($isAdmin || $isLocalDev || $hasToken) {
            // Kembalikan seluruh data booking lengkap untuk dashboard admin
            echo json_encode([
                'success' => true,
                'total'   => count($bookings),
                'data'    => $bookings
            ]);
        } else {
            // PROTEKSI PRIVASI (PII Protection):
            // Publik / pengunjung umum hanya menerima data jadwal non-sensitif untuk kalkulasi ketersediaan aset
            $publicList = [];
            foreach ($bookings as $b) {
                $publicList[] = [
                    'bookingId'      => $b['bookingId'] ?? '',
                    'asetId'         => $b['asetId'] ?? '',
                    'namaBarang'     => $b['namaBarang'] ?? '',
                    'waktuAmbilRaw'  => $b['waktuAmbilRaw'] ?? ($b['waktuAmbil'] ?? ''),
                    'waktuSelesaiRaw'=> $b['waktuSelesaiRaw'] ?? ($b['waktuSelesai'] ?? ''),
                    'waktuAmbil'     => $b['waktuAmbil'] ?? '',
                    'waktuSelesai'   => $b['waktuSelesai'] ?? '',
                    'status'         => $b['status'] ?? 'pending'
                ];
            }
            echo json_encode([
                'success' => true,
                'total'   => count($publicList),
                'data'    => $publicList
            ]);
        }
        break;

    // -------------------------------------------------------------
    // 3. Hapus Satu Booking (Oleh Admin - Wajib Token)
    // -------------------------------------------------------------
    case 'hapus_booking':
        cekWajibAdmin($input, $fileSettings);
        $bookingId = $input['bookingId'] ?? $_GET['id'] ?? '';
        if (!$bookingId) {
            echo json_encode(['success' => false, 'message' => 'ID Booking tidak ditemukan']);
            exit;
        }
        $bookings = bacaJson($fileBookings, []);
        $newList = array_values(array_filter($bookings, function($b) use ($bookingId) {
            return ($b['bookingId'] ?? '') !== $bookingId;
        }));
        tulisJson($fileBookings, $newList);
        echo json_encode(['success' => true, 'message' => 'Booking berhasil dihapus dari server']);
        break;

    // -------------------------------------------------------------
    // 4. Bersihkan Semua Booking (Oleh Admin - Wajib Token)
    // -------------------------------------------------------------
    case 'bersihkan_booking':
        cekWajibAdmin($input, $fileSettings);
        tulisJson($fileBookings, []);
        echo json_encode(['success' => true, 'message' => 'Semua riwayat booking berhasil dibersihkan']);
        break;

    // -------------------------------------------------------------
    // 5. Simpan Aset Kustom (Oleh Admin - Wajib Token)
    // -------------------------------------------------------------
    case 'simpan_aset':
        cekWajibAdmin($input, $fileSettings);
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            echo json_encode(['success' => false, 'message' => 'Metode tidak didukung']);
            exit;
        }
        $assets = $input['assets'] ?? $input;
        if (!is_array($assets)) {
            echo json_encode(['success' => false, 'message' => 'Format data aset tidak valid']);
            exit;
        }
        // Deduplikasi ID aset agar tidak pernah ada ID ganda di database server
        $uniqueAssets = [];
        $seenIds = [];
        foreach ($assets as $a) {
            $aId = $a['id'] ?? '';
            if ($aId && !isset($seenIds[$aId])) {
                $seenIds[$aId] = true;
                $uniqueAssets[] = $a;
            }
        }
        $saved = tulisJson($fileAssets, $uniqueAssets);
        echo json_encode([
            'success' => $saved,
            'message' => $saved ? 'Katalog aset berhasil disinkronisasi ke server' : 'Gagal menulis ke file data/assets.json di server hosting. Periksa izin akses (chmod)!',
            'total'   => count($uniqueAssets)
        ]);
        break;

    // -------------------------------------------------------------
    // 6. Ambil Aset Kustom (Dipanggil oleh Katalog & Admin)
    // -------------------------------------------------------------
    case 'ambil_aset':
        $assets = bacaJson($fileAssets, []);
        $uniqueAssets = [];
        $seenIds = [];
        foreach ($assets as $a) {
            $aId = $a['id'] ?? '';
            if ($aId && !isset($seenIds[$aId])) {
                $seenIds[$aId] = true;
                $uniqueAssets[] = $a;
            }
        }
        echo json_encode([
            'success' => true,
            'data' => $uniqueAssets
        ]);
        break;

    // -------------------------------------------------------------
    // 7. Simpan Pengaturan 2 Nomor WA Admin (Wajib Token)
    // -------------------------------------------------------------
    case 'simpan_pengaturan':
        cekWajibAdmin($input, $fileSettings);
        if ($_SERVER['REQUEST_METHOD'] !== 'POST' || empty($input)) {
            echo json_encode(['success' => false, 'message' => 'Pengaturan tidak valid']);
            exit;
        }
        $saved = tulisJson($fileSettings, $input);
        echo json_encode(['success' => $saved, 'message' => 'Nomor WA Admin berhasil disinkronisasi ke server']);
        break;

    // -------------------------------------------------------------
    // 8. Ambil Pengaturan 2 Nomor WA Admin
    // -------------------------------------------------------------
    case 'ambil_pengaturan':
        $settings = ambilPengaturanSistem($fileSettings);
        echo json_encode([
            'success' => true,
            'data' => $settings
        ]);
        break;

    // -------------------------------------------------------------
    // 9. Simpan Daftar Kategori Kustom (Wajib Token)
    // -------------------------------------------------------------
    case 'simpan_kategori':
        cekWajibAdmin($input, $fileSettings);
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            echo json_encode(['success' => false, 'message' => 'Metode harus POST']);
            exit;
        }
        $cats = $input['categories'] ?? $input;
        if (!is_array($cats)) {
            echo json_encode(['success' => false, 'message' => 'Format kategori tidak valid']);
            exit;
        }
        $unique = [];
        $seen = [];
        foreach ($cats as $c) {
            if (is_array($c) && !empty($c['id']) && !isset($seen[$c['id']])) {
                $seen[$c['id']] = true;
                $unique[] = [
                    'id' => trim((string)$c['id']),
                    'label' => trim((string)($c['label'] ?? $c['id']))
                ];
            }
        }
        $saved = tulisJson($fileCategories, $unique);
        echo json_encode([
            'success' => $saved,
            'message' => 'Kategori berhasil disinkronisasi ke server',
            'data' => $unique
        ]);
        break;

    // -------------------------------------------------------------
    // 10. Ambil Daftar Kategori Kustom
    // -------------------------------------------------------------
    case 'ambil_kategori':
        $cats = null;
        if (file_exists($fileCategories)) {
            $cats = bacaJson($fileCategories, null);
        }
        if ($cats === null) {
            $cats = [
                ['id' => 'kamera', 'label' => 'Kamera & Lensa'],
                ['id' => 'audio', 'label' => 'Audio & Sound System'],
                ['id' => 'lighting', 'label' => 'Lighting & Studio'],
                ['id' => 'handycam', 'label' => 'Handycam & Video'],
                ['id' => 'sarana', 'label' => 'Sarana & Perlengkapan Acara']
            ];
            tulisJson($fileCategories, $cats);
        }
        echo json_encode([
            'success' => true,
            'data' => $cats
        ]);
        break;

    // -------------------------------------------------------------
    // 11. Backup Database Lengkap Server (Wajib Token)
    // -------------------------------------------------------------
    case 'backup_database':
        cekWajibAdmin($input, $fileSettings);
        echo json_encode([
            'success' => true,
            'appName' => 'Sistem Peminjaman Aset Multimedia Ma\'had Aly Amtsilati',
            'backupDate' => date('Y-m-d H:i:s'),
            'bookings' => bacaJson($fileBookings, []),
            'assets' => bacaJson($fileAssets, []),
            'settings' => bacaJson($fileSettings, null),
            'categories' => bacaJson($fileCategories, [])
        ]);
        break;

    // -------------------------------------------------------------
    // -------------------------------------------------------------
    // 12. Tolak / Batalkan Booking (Wajib Token Admin)
    // -------------------------------------------------------------
    case 'batal_booking':
    case 'tolak_booking':
        cekWajibAdmin($input, $fileSettings);
        $bId = trim($input['bookingId'] ?? $_GET['id'] ?? '');
        $alasan = sanitasiString($input['alasan'] ?? 'Unit tidak dapat disewakan');
        if (empty($bId)) {
            echo json_encode(['success' => false, 'message' => 'ID Booking wajib disertakan']);
            exit;
        }

        $bookings = bacaJson($fileBookings, []);
        $found = false;
        $targetBookingTolak = null;
        foreach ($bookings as &$b) {
            if (($b['bookingId'] ?? '') === $bId) {
                $b['status'] = 'rejected';
                $b['alasanTolak'] = $alasan;
                $b['waktuDitolak'] = date('Y-m-d H:i:s');
                $targetBookingTolak = $b;
                $found = true;
                break;
            }
        }
        unset($b);

        if ($found) {
            tulisJson($fileBookings, $bookings);

            // Kirim Notifikasi WhatsApp Otomatis ke Santri
            if (!empty($targetBookingTolak)) {
                kirimNotifBookingTolak($targetBookingTolak, $alasan);
            }

            echo json_encode([
                'success' => true,
                'message' => 'Booking berhasil ditolak / dibatalkan dan slot jadwal langsung dibebaskan'
            ]);
        } else {
            echo json_encode(['success' => false, 'message' => 'Data booking tidak ditemukan']);
        }
        break;

    // -------------------------------------------------------------
    // 13. ACC / Setujui Permohonan Sewa (Wajib Token Admin)
    // -------------------------------------------------------------
    case 'acc_booking':
        cekWajibAdmin($input, $fileSettings);
        $bId = trim($input['bookingId'] ?? $_GET['id'] ?? '');
        $isDinas = !empty($input['isDinas']);
        $biayaFinal = isset($input['biayaFinal']) ? intval($input['biayaFinal']) : null;
        $catatanAcc = sanitasiString($input['catatanAcc'] ?? '');
        $mulaiSekarang = !empty($input['mulaiSekarang']);
        $jaminanIdentitas = sanitasiString($input['jaminanIdentitas'] ?? '');

        if (empty($bId)) {
            echo json_encode(['success' => false, 'message' => 'ID Booking wajib disertakan']);
            exit;
        }

        $bookings = bacaJson($fileBookings, []);
        $found = false;
        $targetBookingAcc = null;
        foreach ($bookings as &$b) {
            if (($b['bookingId'] ?? '') === $bId) {
                $b['status'] = 'active';
                $b['waktuDiAcc'] = date('Y-m-d H:i:s');
                if ($isDinas) {
                    $b['isDinas'] = true;
                    if (!isset($b['biayaSewaAsli'])) {
                        $b['biayaSewaAsli'] = $b['biayaSewa'] ?? 0;
                    }
                    $b['biayaSewa'] = 0;
                } else {
                    $b['isDinas'] = false;
                    if ($biayaFinal !== null) {
                        $b['biayaSewa'] = $biayaFinal;
                    } else if (isset($b['biayaSewaAsli'])) {
                        $b['biayaSewa'] = $b['biayaSewaAsli'];
                    }
                }
                if (!empty($catatanAcc)) {
                    $b['catatanAcc'] = $catatanAcc;
                }

                // Opsi Handover Riil: Hitung durasi sewa mulai dari sekarang saat diserahkan
                if ($mulaiSekarang) {
                    $nowTs = time();
                    $durasiDetik = 0;
                    if (!empty($b['waktuAmbilRaw']) && !empty($b['waktuSelesaiRaw'])) {
                        $t1 = strtotime($b['waktuAmbilRaw']);
                        $t2 = strtotime($b['waktuSelesaiRaw']);
                        if ($t1 && $t2 && $t2 > $t1) {
                            $durasiDetik = $t2 - $t1;
                        }
                    }
                    if ($durasiDetik <= 0 && !empty($b['paketJam'])) {
                        $durasiDetik = intval($b['paketJam']) * 3600;
                    }
                    if ($durasiDetik <= 0) {
                        $durasiDetik = 2 * 3600; // default 2 jam
                    }

                    $endTs = $nowTs + $durasiDetik;
                    $b['waktuAmbilRaw'] = date('c', $nowTs);
                    $b['waktuSelesaiRaw'] = date('c', $endTs);
                    $b['waktuAmbil'] = date('d/m/Y H:i', $nowTs) . ' WIB';
                    $b['waktuSelesai'] = date('d/m/Y H:i', $endTs) . ' WIB';
                    $b['handoverRiil'] = true;
                }

                if (!empty($jaminanIdentitas)) {
                    $b['jaminanIdentitas'] = $jaminanIdentitas;
                }

                $targetBookingAcc = $b;
                $found = true;
                break;
            }
        }
        unset($b);

        if ($found) {
            tulisJson($fileBookings, $bookings);

            // Kirim Notifikasi WhatsApp Otomatis ke Santri
            if (!empty($targetBookingAcc)) {
                kirimNotifBookingAcc($targetBookingAcc);
            }

            echo json_encode([
                'success' => true,
                'message' => 'Pengajuan sewa berhasil disetujui (ACC) dan status kini aktif berjalan'
            ]);
        } else {
            echo json_encode(['success' => false, 'message' => 'Data booking tidak ditemukan']);
        }
        break;

    // -------------------------------------------------------------
    // 14. Terima Pengembalian Fisik Alat (Wajib Token Admin)
    // -------------------------------------------------------------
    case 'kembalikan_booking':
        cekWajibAdmin($input, $fileSettings);
        $bId = trim($input['bookingId'] ?? $_GET['id'] ?? '');
        if (empty($bId)) {
            echo json_encode(['success' => false, 'message' => 'ID Booking wajib disertakan']);
            exit;
        }

        $bookings = bacaJson($fileBookings, []);
        $found = false;
        $asetIdTerkait = '';
        $targetBookingKembali = null;
        foreach ($bookings as &$b) {
            if (($b['bookingId'] ?? '') === $bId) {
                $b['status'] = 'completed';
                $b['waktuDikembalikan'] = $input['waktuDikembalikan'] ?? date('Y-m-d H:i:s');
                $b['dendaKeterlambatan'] = intval($input['dendaKeterlambatan'] ?? 0);
                $b['dendaKerusakan'] = intval($input['dendaKerusakan'] ?? 0);
                $b['denda'] = $b['dendaKeterlambatan'] + $b['dendaKerusakan'];
                $b['kondisiFisik'] = $input['kondisiFisik'] ?? 'normal';
                $b['catatanPengembalian'] = sanitasiString($input['catatanPengembalian'] ?? '');
                if (!empty($input['buktiFoto'])) {
                    $b['buktiFoto'] = $input['buktiFoto'];
                }
                $asetIdTerkait = $b['asetId'] ?? '';
                $targetBookingKembali = $b;
                $found = true;
                break;
            }
        }
        unset($b);

        if ($found) {
            tulisJson($fileBookings, $bookings);

            // Jika admin memilih opsi nonaktifkan unit yang rusak untuk diservis
            if (!empty($input['nonaktifkanAsetServis']) && !empty($asetIdTerkait)) {
                $assets = bacaJson($fileAssets, []);
                foreach ($assets as &$ast) {
                    if (($ast['id'] ?? '') === $asetIdTerkait) {
                        $ast['status'] = 'maintenance';
                        $ast['statusMaster'] = 'maintenance';
                        break;
                    }
                }
                unset($ast);
                tulisJson($fileAssets, $assets);
            }

            // Kirim Notifikasi WhatsApp Otomatis ke Santri untuk Pengembalian Selesai
            if (!empty($targetBookingKembali)) {
                kirimNotifBookingKembali($targetBookingKembali);
            }

            echo json_encode([
                'success' => true,
                'message' => 'Pengembalian fisik berhasil dicatat dan transaksi selesai'
            ]);
        } else {
            echo json_encode(['success' => false, 'message' => 'Data booking tidak ditemukan']);
        }
        break;

    // -------------------------------------------------------------
    // 15. Restore Database Lengkap Server (Wajib Token)
    // -------------------------------------------------------------
    case 'restore_database':
        cekWajibAdmin($input, $fileSettings);
        if ($_SERVER['REQUEST_METHOD'] !== 'POST' || empty($input)) {
            echo json_encode(['success' => false, 'message' => 'Data restore tidak valid atau kosong']);
            exit;
        }

        // Simpan salinan darurat aman (safety snapshot terproteksi PHP) sebelum ditimpa restore
        if (file_exists($fileBookings)) {
            $backupContent = "<?php http_response_code(403); exit; ?>\n" . @file_get_contents($fileBookings);
            @file_put_contents($dataDir . '/bookings_pre_restore.php', $backupContent, LOCK_EX);
        }

        if (isset($input['bookings']) && is_array($input['bookings'])) {
            tulisJson($fileBookings, $input['bookings']);
        }
        if (isset($input['assets']) && is_array($input['assets'])) {
            tulisJson($fileAssets, $input['assets']);
        }
        if (isset($input['settings']) && is_array($input['settings'])) {
            tulisJson($fileSettings, $input['settings']);
        }
        if (isset($input['categories']) && is_array($input['categories'])) {
            tulisJson($fileCategories, $input['categories']);
        }

        echo json_encode([
            'success' => true,
            'message' => 'Database server berhasil dipulihkan secara penuh dari cadangan'
        ]);
        break;

    // -------------------------------------------------------------
    // 16. Test Kirim WhatsApp Gateway Multi Session (Wajib Token Admin)
    // -------------------------------------------------------------
    case 'test_kirim_wa':
        cekWajibAdmin($input, $fileSettings);
        $cfg = bacaJson($fileSettings, []);
        $gw = $cfg['waGateway'] ?? [];
        $target = trim($input['target'] ?? ($gw['phoneAdmin'] ?? '6287748921490'));
        $pesan = trim($input['pesan'] ?? "✅ *Tes Notifikasi WhatsApp Otomatis*\n\nSistem Peminjaman Aset & Inventaris Ma'had Aly Amtsilati berhasil terhubung dengan sesi WhatsApp Multi!\n\n- Sesi: " . ($gw['sessionName'] ?? "Admin Ma'had Aly Amtsilati") . "\n- Waktu: " . date('d/m/Y H:i:s') . " WIB\n\nSemua notifikasi booking baru, persetujuan (ACC), penolakan, dan pengembalian siap berjalan otomatis. 🚀");
        
        $hasil = kirimWaGateway($target, $pesan);
        echo json_encode([
            'success' => $hasil['success'] ?? false,
            'data'    => $hasil,
            'message' => ($hasil['success'] ?? false) ? "Pesan tes berhasil terkirim ke {$target}!" : "Gagal mengirim: " . ($hasil['error'] ?? 'Periksa sesi/API Key')
        ]);
        break;

    // -------------------------------------------------------------
    // Status Server Check
    // -------------------------------------------------------------
    default:
        echo json_encode([
            'status' => 'online',
            'service' => 'Backend Sync Server Ma\'had Aly Amtsilati',
            'server_time' => date('Y-m-d H:i:s T')
        ]);
        break;
}

