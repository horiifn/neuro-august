@echo off
echo ========================================
echo Building neuro-august application
echo ========================================
echo.

REM Проверяем наличие PyInstaller
pip show pyinstaller >nul 2>&1
if errorlevel 1 (
    echo Installing PyInstaller...
    pip install pyinstaller
)

echo.
echo Building executable...
pyinstaller --onefile ^
    --windowed ^
    --icon=icon.ico ^
    --add-data "web;web" ^
    --add-data "version.json;." ^
    --hidden-import=eel ^
    --hidden-import=flask ^
    --hidden-import=requests ^
    --name "neuro-august" ^
    main.py

echo.
echo ========================================
echo Build complete!
echo Executable location: dist\neuro-august.exe
echo ========================================
pause
