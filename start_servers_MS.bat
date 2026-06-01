@echo off

REM Redis broker
start "Redis" powershell -NoExit -Command ^
"cd 'C:\Users\35987\Desktop\airbnb_tax'; ^
.\.tools\redis\Redis-8.6.3-Windows-x64-msys2\redis-server.exe --bind 127.0.0.1 --port 6379 --appendonly no"

REM Backend
start "Backend" powershell -NoExit -Command ^
"cd 'C:\Users\35987\Desktop\airbnb_tax\backend'; ^
python manage.py runserver"

REM Celery worker
start "Celery" powershell -NoExit -Command ^
"cd 'C:\Users\35987\Desktop\airbnb_tax\backend'; ^
python -m celery -A config worker --loglevel=info --pool=solo"

REM Frontend
start "Frontend" powershell -NoExit -Command ^
"cd 'C:\Users\35987\Desktop\airbnb_tax\frontend'; ^
npm.cmd run dev -- --hostname 0.0.0.0"