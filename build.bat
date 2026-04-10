@echo off
echo Сборка neuro august в .exe файл...
echo.

python -m eel main.py web --onefile --noconsole --name "neuro-august" --icon NONE

echo.
echo Готово! Файл neuro-august.exe находится в папке dist/
pause
