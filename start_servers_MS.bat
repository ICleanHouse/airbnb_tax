@echo off
setlocal

REM Apply backend migrations first, synchronously, before starting long-running services.
cd /d "C:\Users\35987\Desktop\airbnb_tax\backend"
python manage.py migrate
if errorlevel 1 (
  echo Backend migrations failed. Aborting startup.
  pause
  exit /b 1
)

cd /d "C:\Users\35987\Desktop\airbnb_tax"

REM Redis broker
start "Redis" powershell -NoExit -Command ^
"cd 'C:\Users\35987\Desktop\airbnb_tax'; ^
.\.tools\redis\Redis-8.6.3-Windows-x64-msys2\redis-server.exe --bind 127.0.0.1 --port 6379 --appendonly no"

REM Backend
start "Backend" powershell -NoExit -Command ^
"cd 'C:\Users\35987\Desktop\airbnb_tax\backend'; ^
python manage.py runserver 127.0.0.1:8000 --noreload"

REM Celery worker
REM Disabled by default for local SQLite runs. Re-enable only when you need background tasks.
REM start "Celery" powershell -NoExit -Command ^
REM "cd 'C:\Users\35987\Desktop\airbnb_tax\backend'; ^
REM python -m celery -A config worker --loglevel=info --pool=solo"

REM Frontend
start "Frontend" powershell -NoExit -Command ^
"cd 'C:\Users\35987\Desktop\airbnb_tax\frontend'; ^
npm.cmd run dev -- --hostname 127.0.0.1"
