@echo off

REM Redis broker
start "Redis" powershell -NoExit -Command ^
"cd 'C:\ProgramData\chocolatey\bin\redis-server.exe'; ^
.\.tools\redis\Redis-8.8.0-Windows-x64-msys2\redis-server.exe --bind 127.0.0.1 --port 6379 --appendonly no"

REM Backend
start "Backend" powershell -NoExit -Command ^
"cd 'C:\Users\misho\Desktop\airbnb_tax\backend'; ^
python manage.py runserver"

REM Celery worker
start "Celery" powershell -NoExit -Command ^
"cd 'C:\Users\misho\Desktop\airbnb_tax\backend'; ^
python -m celery -A config worker --loglevel=info --pool=solo"

REM Frontend
start "Frontend" powershell -NoExit -Command ^
"cd 'C:\Users\misho\Desktop\airbnb_tax\frontend'; ^
npm.cmd run dev -- --hostname 0.0.0.0"