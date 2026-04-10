import eel
import os
import json
import base64
import requests
from datetime import datetime
from pathlib import Path
import tkinter as tk
from tkinter import filedialog
from flask import Flask, request, redirect
import threading
from auth import (
    generate_auth_url,
    exchange_code_for_token,
    get_user_info,
    is_user_allowed,
    validate_state
)
from updater import check_for_updates, get_update_info, download_update, install_update

# Инициализация Eel
eel.init('web')

# Flask для OAuth callback
flask_app = Flask(__name__)

# Конфигурация
CONFIG_FILE = 'config.json'
USER_FILE = 'user.json'
MODEL = 'google/gemini-3-pro-image-preview'
API_MEDIA_URL = 'https://polza.ai/api/v1/media'
API_BALANCE_URL = 'https://polza.ai/api/v1/balance'

def get_api_key():
    """Получить API ключ из конфигурации"""
    config = load_config()
    return config.get('api_key', '')

# Текущий пользователь
current_user = None

def load_user():
    """Загрузка данных пользователя"""
    global current_user
    if os.path.exists(USER_FILE):
        with open(USER_FILE, 'r', encoding='utf-8') as f:
            current_user = json.load(f)
            return current_user
    return None

def save_user(user_data):
    """Сохранение данных пользователя"""
    global current_user
    current_user = user_data
    with open(USER_FILE, 'w', encoding='utf-8') as f:
        json.dump(user_data, f, ensure_ascii=False, indent=2)

@flask_app.route('/auth/callback')
def auth_callback():
    """Обработка callback от Twitch"""
    code = request.args.get('code')
    state = request.args.get('state')
    error = request.args.get('error')
    
    if error:
        return f"<h1>Ошибка авторизации: {error}</h1><script>window.close()</script>"
    
    if not code or not state:
        return "<h1>Ошибка: отсутствуют параметры</h1><script>window.close()</script>"
    
    if not validate_state(state):
        return "<h1>Ошибка: неверный state</h1><script>window.close()</script>"
    
    # Обмен кода на токен
    token_data = exchange_code_for_token(code)
    if not token_data:
        return "<h1>Ошибка получения токена</h1><script>window.close()</script>"
    
    access_token = token_data.get('access_token')
    
    # Получение информации о пользователе
    user_info = get_user_info(access_token)
    if not user_info:
        return "<h1>Ошибка получения данных пользователя</h1><script>window.close()</script>"
    
    username = user_info.get('username')
    
    # Проверка доступа
    if not is_user_allowed(username):
        return f"<h1>Доступ запрещен</h1><p>Пользователь {username} не имеет доступа к приложению</p><script>setTimeout(() => window.close(), 3000)</script>"
    
    # Сохранение пользователя
    save_user(user_info)
    
    return f"<h1>Успешная авторизация!</h1><p>Добро пожаловать, {user_info.get('display_name')}!</p><script>window.close()</script>"

def start_flask():
    """Запуск Flask сервера в отдельном потоке"""
    flask_app.run(port=3939, debug=False, use_reloader=False)

@eel.expose
def start_auth():
    """Начало процесса авторизации"""
    auth_url, state = generate_auth_url()
    import webbrowser
    webbrowser.open(auth_url)
    return {'success': True, 'url': auth_url}

@eel.expose
def check_auth():
    """Проверка авторизации"""
    user = load_user()
    if user:
        return {'authenticated': True, 'user': user}
    return {'authenticated': False}

@eel.expose
def logout():
    """Выход из аккаунта"""
    global current_user
    current_user = None
    if os.path.exists(USER_FILE):
        os.remove(USER_FILE)
    return {'success': True}

def load_config():
    """Загрузка конфигурации"""
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {'save_path': os.path.join(os.path.expanduser('~'), 'neuro-august')}

def save_config(config):
    """Сохранение конфигурации"""
    with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
        json.dump(config, f, ensure_ascii=False, indent=2)

@eel.expose
def select_folder():
    """Выбор папки для сохранения диалогов"""
    root = tk.Tk()
    root.withdraw()
    root.wm_attributes('-topmost', 1)
    
    folder = filedialog.askdirectory(title='Выберите папку для сохранения диалогов')
    
    if folder:
        config = load_config()
        config['save_path'] = folder
        save_config(config)
        return folder
    return None

@eel.expose
def get_save_path():
    """Получить текущую папку сохранения"""
    config = load_config()
    return config.get('save_path', '')

@eel.expose
def get_config():
    """Загрузить конфигурацию для JavaScript"""
    return load_config()

@eel.expose
def save_dialog(prompt, images_data, result_url):
    """Сохранение диалога в папку"""
    try:
        config = load_config()
        base_path = config.get('save_path', os.path.join(os.path.expanduser('~'), 'neuro-august'))
        
        # Создаем папку для диалога
        timestamp = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
        dialog_folder = os.path.join(base_path, f'Dialog_{timestamp}')
        os.makedirs(dialog_folder, exist_ok=True)
        
        # Сохраняем промпт
        with open(os.path.join(dialog_folder, 'prompt.txt'), 'w', encoding='utf-8') as f:
            f.write(prompt)
        
        # Сохраняем прикрепленные изображения
        for idx, img_data in enumerate(images_data, 1):
            if img_data.startswith('data:image'):
                # Убираем префикс data:image/...;base64,
                img_base64 = img_data.split(',')[1]
                img_bytes = base64.b64decode(img_base64)
                
                # Определяем расширение
                if 'png' in img_data:
                    ext = 'png'
                elif 'jpeg' in img_data or 'jpg' in img_data:
                    ext = 'jpg'
                else:
                    ext = 'png'
                
                with open(os.path.join(dialog_folder, f'input_{idx}.{ext}'), 'wb') as f:
                    f.write(img_bytes)
        
        # Скачиваем и сохраняем результат
        if result_url:
            response = requests.get(result_url, timeout=30)
            if response.status_code == 200:
                with open(os.path.join(dialog_folder, 'result.png'), 'wb') as f:
                    f.write(response.content)
        
        return {'success': True, 'path': dialog_folder}
    
    except Exception as e:
        print(f'Ошибка сохранения: {e}')
        return {'success': False, 'error': str(e)}

@eel.expose
def save_full_dialog(dialog_data):
    """Сохранение полного диалога со всеми сообщениями"""
    try:
        config = load_config()
        base_path = config.get('save_path', os.path.join(os.path.expanduser('~'), 'neuro-august'))
        
        # Используем существующую папку диалога или создаем новую
        dialog_id = dialog_data.get('dialog_id')
        if dialog_id:
            dialog_folder = os.path.join(base_path, dialog_id)
        else:
            # Генерируем название из первого сообщения
            messages = dialog_data.get('messages', [])
            first_user_message = next((msg for msg in messages if msg.get('role') == 'user'), None)
            
            if first_user_message and first_user_message.get('prompt'):
                # Берем первые 3-5 слов из промпта
                prompt = first_user_message['prompt']
                words = prompt.split()[:5]  # Первые 5 слов
                dialog_name = '_'.join(words)
                
                # Очищаем от недопустимых символов для имени папки
                dialog_name = ''.join(c if c.isalnum() or c in (' ', '_', '-') else '_' for c in dialog_name)
                dialog_name = dialog_name.replace(' ', '_')
                
                # Ограничиваем длину
                if len(dialog_name) > 50:
                    dialog_name = dialog_name[:50]
                
                # Добавляем timestamp для уникальности
                timestamp = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
                dialog_id = f'{dialog_name}_{timestamp}'
            else:
                # Если нет промпта, используем просто дату
                timestamp = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
                dialog_id = f'Dialog_{timestamp}'
            
            dialog_folder = os.path.join(base_path, dialog_id)
        
        os.makedirs(dialog_folder, exist_ok=True)
        
        # Сохраняем JSON с полной историей диалога
        dialog_file = os.path.join(dialog_folder, 'dialog.json')
        with open(dialog_file, 'w', encoding='utf-8') as f:
            json.dump(dialog_data, f, ensure_ascii=False, indent=2)
        
        # Сохраняем изображения
        messages = dialog_data.get('messages', [])
        for msg_idx, message in enumerate(messages):
            # Сохраняем прикрепленные изображения пользователя
            if message.get('role') == 'user' and message.get('images'):
                for img_idx, img_data in enumerate(message['images']):
                    if img_data.startswith('data:image'):
                        img_base64 = img_data.split(',')[1]
                        img_bytes = base64.b64decode(img_base64)
                        
                        ext = 'png'
                        if 'jpeg' in img_data or 'jpg' in img_data:
                            ext = 'jpg'
                        
                        filename = f'msg{msg_idx}_input_{img_idx}.{ext}'
                        with open(os.path.join(dialog_folder, filename), 'wb') as f:
                            f.write(img_bytes)
            
            # Сохраняем сгенерированные изображения
            if message.get('role') == 'assistant' and message.get('image_url'):
                try:
                    response = requests.get(message['image_url'], timeout=30)
                    if response.status_code == 200:
                        filename = f'msg{msg_idx}_result.png'
                        with open(os.path.join(dialog_folder, filename), 'wb') as f:
                            f.write(response.content)
                except Exception as e:
                    print(f'Ошибка загрузки изображения: {e}')
        
        return {'success': True, 'dialog_id': dialog_id, 'path': dialog_folder}
    
    except Exception as e:
        print(f'Ошибка сохранения диалога: {e}')
        return {'success': False, 'error': str(e)}

@eel.expose
def get_balance():
    """Получение баланса"""
    try:
        api_key = get_api_key()
        headers = {'Authorization': f'Bearer {api_key}'}
        response = requests.get(API_BALANCE_URL, headers=headers, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            return {'success': True, 'balance': float(data.get('amount', 0))}
        else:
            return {'success': False, 'error': f'HTTP {response.status_code}'}
    
    except Exception as e:
        print(f'Ошибка получения баланса: {e}')
        return {'success': False, 'error': str(e)}

@eel.expose
def save_api_key(api_key):
    """Сохранение API ключа"""
    try:
        config = load_config()
        config['api_key'] = api_key
        save_config(config)
        return {'success': True}
    except Exception as e:
        print(f'Ошибка сохранения API ключа: {e}')
        return {'success': False, 'error': str(e)}

@eel.expose
def get_api_key_masked():
    """Получить замаскированный API ключ для отображения"""
    try:
        api_key = get_api_key()
        if len(api_key) > 8:
            return {'success': True, 'api_key': api_key[:4] + '...' + api_key[-4:]}
        return {'success': True, 'api_key': '***'}
    except Exception as e:
        return {'success': False, 'error': str(e)}

@eel.expose
def get_dialogs_list():
    """Получить список сохраненных диалогов"""
    try:
        config = load_config()
        base_path = config.get('save_path', '')
        
        if not os.path.exists(base_path):
            return []
        
        dialogs = []
        for folder_name in sorted(os.listdir(base_path), reverse=True):
            folder_path = os.path.join(base_path, folder_name)
            if os.path.isdir(folder_path):
                
                # Читаем dialog.json если есть
                dialog_file = os.path.join(folder_path, 'dialog.json')
                if os.path.exists(dialog_file):
                    with open(dialog_file, 'r', encoding='utf-8') as f:
                        dialog_data = json.load(f)
                        first_message = next((msg for msg in dialog_data.get('messages', []) if msg.get('role') == 'user'), None)
                        prompt = first_message.get('prompt', 'Без названия') if first_message else 'Без названия'
                else:
                    # Старый формат - читаем prompt.txt
                    prompt_file = os.path.join(folder_path, 'prompt.txt')
                    prompt = ''
                    if os.path.exists(prompt_file):
                        with open(prompt_file, 'r', encoding='utf-8') as f:
                            prompt = f.read()
                
                # Проверяем наличие результата
                result_file = os.path.join(folder_path, 'result.png')
                has_result = os.path.exists(result_file)
                
                dialogs.append({
                    'name': folder_name,
                    'path': folder_path,
                    'prompt': prompt[:100] + ('...' if len(prompt) > 100 else ''),
                    'has_result': has_result
                })
        
        return dialogs
    
    except Exception as e:
        print(f'Ошибка получения списка диалогов: {e}')
        return []

@eel.expose
def load_dialog(dialog_path):
    """Загрузить диалог из папки"""
    try:
        dialog_file = os.path.join(dialog_path, 'dialog.json')
        
        if os.path.exists(dialog_file):
            # Новый формат - загружаем JSON
            with open(dialog_file, 'r', encoding='utf-8') as f:
                dialog_data = json.load(f)
            
            # Конвертируем локальные пути изображений в data URLs
            for message in dialog_data.get('messages', []):
                if message.get('role') == 'user' and message.get('images'):
                    # Изображения уже в формате data URL, оставляем как есть
                    pass
                
                if message.get('role') == 'assistant' and message.get('image_url'):
                    # Проверяем, это локальный файл или URL
                    if not message['image_url'].startswith('http'):
                        # Это локальный файл, загружаем его
                        local_path = os.path.join(dialog_path, message['image_url'])
                        if os.path.exists(local_path):
                            with open(local_path, 'rb') as img_file:
                                img_data = base64.b64encode(img_file.read()).decode('utf-8')
                                message['image_url'] = f'data:image/png;base64,{img_data}'
            
            return {'success': True, 'dialog': dialog_data}
        else:
            # Старый формат - создаем структуру из отдельных файлов
            messages = []
            
            # Читаем промпт
            prompt_file = os.path.join(dialog_path, 'prompt.txt')
            if os.path.exists(prompt_file):
                with open(prompt_file, 'r', encoding='utf-8') as f:
                    prompt = f.read()
                
                # Загружаем прикрепленные изображения
                images = []
                for filename in os.listdir(dialog_path):
                    if filename.startswith('input_'):
                        img_path = os.path.join(dialog_path, filename)
                        with open(img_path, 'rb') as img_file:
                            img_data = base64.b64encode(img_file.read()).decode('utf-8')
                            ext = filename.split('.')[-1]
                            images.append(f'data:image/{ext};base64,{img_data}')
                
                messages.append({
                    'role': 'user',
                    'prompt': prompt,
                    'images': images,
                    'timestamp': datetime.now().isoformat()
                })
            
            # Загружаем результат
            result_file = os.path.join(dialog_path, 'result.png')
            if os.path.exists(result_file):
                with open(result_file, 'rb') as img_file:
                    img_data = base64.b64encode(img_file.read()).decode('utf-8')
                    messages.append({
                        'role': 'assistant',
                        'image_url': f'data:image/png;base64,{img_data}',
                        'timestamp': datetime.now().isoformat()
                    })
            
            dialog_data = {
                'dialog_id': os.path.basename(dialog_path),
                'messages': messages,
                'created_at': datetime.now().isoformat(),
                'updated_at': datetime.now().isoformat()
            }
            
            return {'success': True, 'dialog': dialog_data}
    
    except Exception as e:
        print(f'Ошибка загрузки диалога: {e}')
        return {'success': False, 'error': str(e)}

# Функции для обновления
@eel.expose
def check_updates():
    """Проверить наличие обновлений"""
    return get_update_info()

@eel.expose
def download_and_install_update(download_url, new_version):
    """Скачать и установить обновление"""
    try:
        # Скачиваем обновление
        update_file = download_update(download_url)
        
        if update_file:
            # Устанавливаем обновление
            success = install_update(update_file, new_version)
            return {'success': success}
        else:
            return {'success': False, 'error': 'Ошибка загрузки файла'}
    
    except Exception as e:
        return {'success': False, 'error': str(e)}

# Запуск приложения
if __name__ == '__main__':
    # Создаем папку по умолчанию если не существует
    config = load_config()
    default_path = config.get('save_path')
    if default_path and not os.path.exists(default_path):
        os.makedirs(default_path, exist_ok=True)
    
    # Запускаем Flask в отдельном потоке
    flask_thread = threading.Thread(target=start_flask, daemon=True)
    flask_thread.start()
    
    # Запускаем Eel
    try:
        eel.start('index.html', size=(1280, 720), port=8080)
    except:
        # Если порт занят, пробуем другой
        eel.start('index.html', size=(1280, 720), port=0)
