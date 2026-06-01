@echo off

REM Redis broker
start "Redis" powershell -NoExit -Command ^
"cd 'C:\Users\d.yordanov\OneDrive - Intelligent Systems Bulgaria Ltd\Personal\Personal Projects\AirBnbMarketplace\airbnb_tax\backend\.tools\redis'; ^
redis-server.exe --bind 127.0.0.1 --port 6379 --appendonly no"

REM Backend
start "Backend" powershell -NoExit -Command ^
"cd 'C:\Users\d.yordanov\OneDrive - Intelligent Systems Bulgaria Ltd\Personal\Personal Projects\AirBnbMarketplace\airbnb_tax\backend'; ^
.\.venv\Scripts\Activate.ps1; ^
python manage.py migrate; ^
python manage.py runserver"

REM Celery worker
start "Celery" powershell -NoExit -Command ^
"cd 'C:\Users\d.yordanov\OneDrive - Intelligent Systems Bulgaria Ltd\Personal\Personal Projects\AirBnbMarketplace\airbnb_tax\backend'; ^
.\.venv\Scripts\Activate.ps1; ^
python -m celery -A config worker --loglevel=info --pool=solo"

REM Frontend
start "Frontend" powershell -NoExit -Command ^
"cd 'C:\Users\d.yordanov\OneDrive - Intelligent Systems Bulgaria Ltd\Personal\Personal Projects\AirBnbMarketplace\airbnb_tax\frontend'; ^
npm.cmd run dev -- --hostname 0.0.0.0"