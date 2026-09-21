@echo off
title Server Lokal Inventaris Aset Ma'had Aly Amtsilati
color 0b

echo ======================================================================
echo    SISTEM INFORMASI INVENTARIS ASET MA'HAD ALY AMTSILATI
echo               SERVER LOKAL & WHATSAPP OTOMATIS
echo ======================================================================
echo.
echo  Menyiapkan server lokal PHP...
echo  - Port: 8000
echo  - Alamat: http://localhost:8000
echo  - WA Gateway: AKTIF (Admin Ma'had Aly Amtsilati)
echo.

set PHP_EXE=
if exist "C:\xampp\php\php.exe" (
    set "PHP_EXE=C:\xampp\php\php.exe"
) else (
    where php >nul 2>nul
    if %ERRORLEVEL% equ 0 (
        set "PHP_EXE=php"
    )
)

if "%PHP_EXE%"=="" (
    echo [ERROR] PHP tidak ditemukan di C:\xampp\php\php.exe maupun system PATH!
    echo Silakan pastikan XAMPP terinstall di komputer Anda.
    pause
    exit /b 1
)

echo [OK] PHP terdeteksi: %PHP_EXE%
echo Membuka katalog peminjaman di browser...
echo.
start http://localhost:8000/1-katalog.html
echo ======================================================================
echo  SERVER SEDANG BERJALAN!
echo  JANGAN TUTUP JENDELA INI SELAMA ANDA MENCOBA SISTEM.
echo  Untuk menghentikan server, tekan Ctrl+C atau tutup jendela ini.
echo ======================================================================
echo.

"%PHP_EXE%" -S localhost:8000
pause

