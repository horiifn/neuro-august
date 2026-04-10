"""
Модуль авторизации через Twitch
"""
import requests
import secrets
import webbrowser
from urllib.parse import urlencode

# Twitch OAuth конфигурация
TWITCH_CLIENT_ID = '9ervabalf47j2rjlmhoebacsfgsrua'
TWITCH_CLIENT_SECRET = 'l6fuebd6dsvf9krowrefx69alwn1ea'
REDIRECT_URI = 'http://localhost:3939/auth/callback'
ALLOWED_USERS = ['horifin', 'horiifn', 'kos_teo']

# Временное хранилище состояний OAuth
oauth_states = {}

def generate_auth_url():
    """Генерация URL для авторизации через Twitch"""
    state = secrets.token_urlsafe(32)
    oauth_states[state] = True
    
    params = {
        'client_id': TWITCH_CLIENT_ID,
        'redirect_uri': REDIRECT_URI,
        'response_type': 'code',
        'scope': 'user:read:email',
        'state': state
    }
    
    auth_url = f"https://id.twitch.tv/oauth2/authorize?{urlencode(params)}"
    return auth_url, state

def exchange_code_for_token(code):
    """Обмен кода на токен доступа"""
    token_url = 'https://id.twitch.tv/oauth2/token'
    
    data = {
        'client_id': TWITCH_CLIENT_ID,
        'client_secret': TWITCH_CLIENT_SECRET,
        'code': code,
        'grant_type': 'authorization_code',
        'redirect_uri': REDIRECT_URI
    }
    
    response = requests.post(token_url, data=data)
    
    if response.status_code == 200:
        return response.json()
    else:
        print(f"Ошибка получения токена: {response.status_code}")
        return None

def get_user_info(access_token):
    """Получение информации о пользователе"""
    headers = {
        'Authorization': f'Bearer {access_token}',
        'Client-Id': TWITCH_CLIENT_ID
    }
    
    response = requests.get('https://api.twitch.tv/helix/users', headers=headers)
    
    if response.status_code == 200:
        data = response.json()
        if data.get('data'):
            user = data['data'][0]
            return {
                'username': user.get('login'),
                'display_name': user.get('display_name'),
                'profile_image': user.get('profile_image_url'),
                'id': user.get('id')
            }
    
    return None

def is_user_allowed(username):
    """Проверка, разрешен ли доступ пользователю"""
    return username.lower() in [u.lower() for u in ALLOWED_USERS]

def validate_state(state):
    """Проверка валидности state параметра"""
    return state in oauth_states
