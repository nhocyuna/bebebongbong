@echo off
setlocal
cd /d "%~dp0"
set "MEMORY_HOST=127.0.0.1"
set "MEMORY_PORT=8765"

python -c "import cryptography, PIL" >nul 2>nul
if errorlevel 1 (
  echo Thieu Python hoac thu vien can thiet.
  echo Hay cai: python -m pip install cryptography pillow
  pause
  exit /b 1
)

echo Dang mo trang ky niem tai http://127.0.0.1:8765/
echo Dong cua so nay de dung may chu.
start "" "http://127.0.0.1:8765/"
python server.py
if errorlevel 1 (
  echo May chu khong khoi dong duoc. Co the cong 8765 dang duoc su dung.
  pause
)
endlocal
