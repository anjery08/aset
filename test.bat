@echo off
setlocal

:: Cek apakah 'node' sudah terbaca di PATH
where node >nul 2>nul
if %ERRORLEVEL% equ 0 (
    node tests\simulasi.cjs
    goto :selesai
)

:: Jika belum terbaca karena terminal belum di-restart, cari langsung di folder instalasi
set "NODE_PATH=%LOCALAPPDATA%\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.19.0-win-x64\node.exe"
if exist "%NODE_PATH%" (
    "%NODE_PATH%" tests\simulasi.cjs
    goto :selesai
)

echo [ERROR] Node.js belum ditemukan. Silakan buka terminal baru (restart terminal).
exit /b 1

:selesai
endlocal
