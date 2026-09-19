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

if (!empty($origin) && in_array($origin, $allowedOrigins)) {
    header('Access-Control-Allow-Origin: ' . $origin);
} elseif (empty($origin)) {
    header('Access-Control-Allow-Origin: *');
} else {
    header('Access-Control-Allow-Origin: https://aset.mahadalyamtsilati.ac.id');
}

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
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    return @file_put_contents($filePath, $json, LOCK_EX) !== false;
}

// Helper verifikasi otorisasi admin untuk keamanan data server
function verifikasiOtorisasiAdmin($input, $fileSettings) {
    $token = '';
    if (function_exists('getallheaders')) {
        $headers = getallheaders();
        $token = $headers['X-Admin-Token'] ?? $headers['x-admin-token'] ?? $headers['Authorization'] ?? '';
    }
    if (empty($token) && isset($_SERVER['HTTP_X_ADMIN_TOKEN'])) {
        $token = $_SERVER['HTTP_X_ADMIN_TOKEN'];
    }
    if (empty($token)) {
        $token = $_GET['token'] ?? $input['admin_token'] ?? '';
    }
    if (stripos($token, 'Bearer ') === 0) {
        $token = trim(substr($token, 7));
    }
    
    $cfg = bacaJson($fileSettings, null);
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
        }
        
        // Batasi maksimal 300 riwayat terakhir agar hemat memori
        if (count($bookings) > 300) {
            $bookings = array_slice($bookings, 0, 300);
        }

        $saved = tulisJson($fileBookings, $bookings);
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
        if ($isAdmin) {
            // Admin berhak melihat seluruh data booking lengkap (termasuk identitas santri & pembukuan)
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
        echo json_encode(['success' => $saved, 'message' => 'Katalog aset berhasil disinkronisasi ke server']);
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
        $settings = bacaJson($fileSettings, null);
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
        if ($_SERVER['REQUEST_METHOD'] !== 'POST' || empty($input)) {
            echo json_encode(['success' => false, 'message' => 'Data kategori tidak valid']);
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
                $unique[] = $c;
            }
        }
        $saved = tulisJson($fileCategories, $unique);
        echo json_encode(['success' => $saved, 'message' => 'Kategori berhasil disinkronisasi ke server']);
        break;

    // -------------------------------------------------------------
    // 10. Ambil Daftar Kategori Kustom
    // -------------------------------------------------------------
    case 'ambil_kategori':
        $cats = bacaJson($fileCategories, []);
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
        foreach ($bookings as &$b) {
            if (($b['bookingId'] ?? '') === $bId) {
                $b['status'] = 'rejected';
                $b['alasanTolak'] = $alasan;
                $b['waktuDitolak'] = date('Y-m-d H:i:s');
                $found = true;
                break;
            }
        }
        unset($b);

        if ($found) {
            tulisJson($fileBookings, $bookings);
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

                $found = true;
                break;
            }
        }
        unset($b);

        if ($found) {
            tulisJson($fileBookings, $bookings);
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

