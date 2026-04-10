import requests
import json
import os
import sys
import subprocess
from pathlib import Path
import tempfile
import shutil

GITHUB_REPO = "horiifn/neuro-august"  # Замените на ваш репозиторий
CURRENT_VERSION = "1.0.0"  # Текущая версия приложения
VERSION_FILE = "version.json"

def get_current_version():
    """Получить текущую версию приложения"""
    if os.path.exists(VERSION_FILE):
        with open(VERSION_FILE, 'r') as f:
            data = json.load(f)
            return data.get('version', CURRENT_VERSION)
    return CURRENT_VERSION

def save_version(version):
    """Сохранить версию приложения"""
    with open(VERSION_FILE, 'w') as f:
        json.dump({'version': version}, f)

def check_for_updates():
    """Проверить наличие обновлений на GitHub"""
    try:
        url = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
        response = requests.get(url, timeout=10)
        
        if response.status_code == 200:
            release = response.json()
            latest_version = release['tag_name'].lstrip('v')
            current_version = get_current_version()
            
            if latest_version > current_version:
                return {
                    'available': True,
                    'version': latest_version,
                    'download_url': None,
                    'release_notes': release.get('body', ''),
                    'assets': release.get('assets', [])
                }
        
        return {'available': False}
    
    except Exception as e:
        print(f"Ошибка проверки обновлений: {e}")
        return {'available': False, 'error': str(e)}

def download_update(download_url, progress_callback=None):
    """Скачать обновление"""
    try:
        response = requests.get(download_url, stream=True, timeout=30)
        total_size = int(response.headers.get('content-length', 0))
        
        # Создаем временный файл
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.exe')
        downloaded = 0
        
        with temp_file as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)
                    if progress_callback and total_size > 0:
                        progress = (downloaded / total_size) * 100
                        progress_callback(progress)
        
        return temp_file.name
    
    except Exception as e:
        print(f"Ошибка загрузки обновления: {e}")
        return None

def install_update(update_file, new_version):
    """Установить обновление"""
    try:
        # Получаем путь к текущему exe
        if getattr(sys, 'frozen', False):
            current_exe = sys.executable
        else:
            current_exe = os.path.abspath(__file__)
        
        # Создаем bat-файл для обновления
        bat_content = f"""@echo off
timeout /t 2 /nobreak > nul
del /f /q "{current_exe}"
move /y "{update_file}" "{current_exe}"
start "" "{current_exe}"
del "%~f0"
"""
        
        bat_file = os.path.join(tempfile.gettempdir(), 'update.bat')
        with open(bat_file, 'w') as f:
            f.write(bat_content)
        
        # Сохраняем новую версию
        save_version(new_version)
        
        # Запускаем bat-файл и закрываем приложение
        subprocess.Popen(['cmd', '/c', bat_file], 
                        creationflags=subprocess.CREATE_NO_WINDOW)
        
        return True
    
    except Exception as e:
        print(f"Ошибка установки обновления: {e}")
        return False

def get_update_info():
    """Получить информацию об обновлении для отображения"""
    update_info = check_for_updates()
    
    if update_info.get('available'):
        # Ищем .exe файл в assets
        for asset in update_info.get('assets', []):
            if asset['name'].endswith('.exe'):
                update_info['download_url'] = asset['browser_download_url']
                update_info['file_size'] = asset['size']
                break
    
    return update_info
