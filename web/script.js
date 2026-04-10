const CHAT_API_URL = 'https://polza.ai/api/v1/chat/completions';
const MEDIA_API_URL = 'https://polza.ai/api/v1/media';
const MODEL = 'google/gemini-3-pro-image-preview';
const CHAT_MODEL = 'google/gemini-2.5-flash';

let API_KEY = ''; // Пользователь должен ввести свой ключ

const promptInput = document.getElementById('prompt');
const generateBtn = document.getElementById('generateBtn');
const attachBtn = document.getElementById('attachBtn');
const imageInput = document.getElementById('imageInput');
const messagesContainer = document.getElementById('messages');
const previewImagesContainer = document.getElementById('previewImages');
const balanceElement = document.getElementById('balance');
const newChatBtn = document.getElementById('newChatBtn');
const dialogsList = document.getElementById('dialogsList');
const settingsModal = document.getElementById('settingsModal');
const selectFolderBtn = document.getElementById('selectFolderBtn');
const closeModal = document.getElementById('closeModal');
const browseFolderBtn = document.getElementById('browseFolderBtn');
const folderPathInput = document.getElementById('folderPathInput');
const profileModal = document.getElementById('profileModal');
const closeProfileModal = document.getElementById('closeProfileModal');
const profileContent = document.getElementById('profileContent');
const userProfile = document.getElementById('userProfile');
const apiKeyInput = document.getElementById('apiKeyInput');
const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');

let attachedImages = [];
let isGenerating = false;
let editMode = false;
let currentResultUrl = null;
let currentMode = 'image'; // 'image' или 'prompt'
let currentUser = null;
let lastGeneratedImage = null; // Последнее сгенерированное изображение
let currentDialogId = null; // ID текущего диалога
let dialogMessages = []; // История сообщений текущего диалога

// Проверяем авторизацию при загрузке
checkAuthOnLoad();

async function checkAuthOnLoad() {
    const result = await eel.check_auth()();
    if (result.authenticated) {
        currentUser = result.user;
        updateUserProfile();
    }
    
    // Загружаем API ключ
    await loadApiKey();
    
    // Загружаем данные
    loadBalance();
    loadSavePath();
    loadDialogs();
    
    // Проверяем обновления
    checkForUpdates();
}

async function checkForUpdates() {
    try {
        const updateInfo = await eel.check_updates()();
        
        if (updateInfo.available && updateInfo.download_url) {
            showUpdateNotification(updateInfo);
        }
    } catch (error) {
        console.error('Ошибка проверки обновлений:', error);
    }
}

function showUpdateNotification(updateInfo) {
    const notification = document.createElement('div');
    notification.className = 'update-notification';
    notification.innerHTML = `
        <div class="update-content">
            <div class="update-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                    <path d="M3 3v5h5"/>
                    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
                    <path d="M16 21h5v-5"/>
                </svg>
            </div>
            <div class="update-text">
                <strong>Доступно обновление v${updateInfo.version}</strong>
                <p>Новая версия приложения готова к установке</p>
            </div>
            <div class="update-actions">
                <button class="update-btn" id="installUpdateBtn">Обновить</button>
                <button class="update-close" id="closeUpdateBtn">×</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Показываем уведомление
    setTimeout(() => notification.classList.add('show'), 100);
    
    // Обработчик установки
    document.getElementById('installUpdateBtn').addEventListener('click', async () => {
        const btn = document.getElementById('installUpdateBtn');
        btn.disabled = true;
        btn.textContent = 'Загрузка...';
        
        const result = await eel.download_and_install_update(updateInfo.download_url, updateInfo.version)();
        
        if (result.success) {
            btn.textContent = 'Перезапуск...';
            // Приложение перезапустится автоматически
        } else {
            btn.disabled = false;
            btn.textContent = 'Обновить';
            showCustomAlert('Ошибка установки обновления: ' + (result.error || 'Неизвестная ошибка'), 'Ошибка', 'error');
        }
    });
    
    // Обработчик закрытия
    document.getElementById('closeUpdateBtn').addEventListener('click', () => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    });
}

async function loadApiKey() {
    const config = await eel.get_config()();
    if (config && config.api_key) {
        API_KEY = config.api_key;
    }
    
    // Загружаем замаскированный ключ для отображения
    const result = await eel.get_api_key_masked()();
    if (result.success) {
        apiKeyInput.placeholder = result.api_key;
    }
}

function updateUserProfile() {
    if (currentUser) {
        userProfile.innerHTML = `
            <div class="user-profile-info">
                <img src="${currentUser.profile_image}" alt="${currentUser.display_name}" class="user-profile-avatar">
                <div class="user-profile-details">
                    <div class="user-profile-name">${currentUser.display_name}</div>
                    <div class="user-profile-status">Free</div>
                </div>
            </div>
        `;
    } else {
        userProfile.innerHTML = `
            <div class="user-profile-placeholder">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                </svg>
                <span>Войти</span>
            </div>
        `;
    }
}

// Клик по профилю в сайдбаре
userProfile.addEventListener('click', () => {
    profileModal.classList.add('active');
    showProfileModal();
});

async function showProfileModal() {
    if (currentUser) {
        // Получаем список диалогов
        const dialogs = await eel.get_dialogs_list()();
        
        // Проверяем наличие API ключа
        const hasApiKey = API_KEY && API_KEY.length > 0;
        
        // Показываем профиль авторизованного пользователя
        let dialogsHtml = '';
        if (dialogs.length > 0) {
            dialogsHtml = dialogs.map(dialog => `
                <div class="profile-dialog-item" data-path="${dialog.path}">
                    <div class="profile-dialog-name">${dialog.name.replace('Dialog_', '').replace(/_/g, ' ')}</div>
                    <div class="profile-dialog-preview">${dialog.prompt}</div>
                </div>
            `).join('');
        } else {
            dialogsHtml = '<p class="no-dialogs">Диалогов пока нет</p>';
        }
        
        // Предупреждение об отсутствии API ключа
        let apiKeyWarning = '';
        if (!hasApiKey) {
            apiKeyWarning = `
                <div class="api-key-warning">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                        <line x1="12" y1="9" x2="12" y2="13"/>
                        <line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    <div>
                        <strong>API ключ не установлен</strong>
                        <p>Для использования генерации изображений необходимо ввести API ключ в настройках</p>
                        <button class="open-settings-btn" id="openSettingsFromProfile">Открыть настройки</button>
                    </div>
                </div>
            `;
        }
        
        profileContent.innerHTML = `
            <div class="profile-info">
                ${apiKeyWarning}
                <div class="profile-header">
                    <img src="${currentUser.profile_image}" alt="${currentUser.display_name}" class="profile-avatar">
                    <div class="profile-user-info">
                        <h3 class="profile-name">${currentUser.display_name}</h3>
                        <p class="profile-username">@${currentUser.username}</p>
                    </div>
                </div>
                
                <div class="profile-stats">
                    <div class="profile-stat">
                        <span class="stat-value">${dialogs.length}</span>
                        <span class="stat-label">Диалогов</span>
                    </div>
                </div>
                
                <div class="profile-dialogs-section">
                    <h4>Недавние диалоги</h4>
                    <div class="profile-dialogs-list">
                        ${dialogsHtml}
                    </div>
                </div>
                
                <button class="logout-btn-full" id="logoutBtnFull">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                        <polyline points="16 17 21 12 16 7"/>
                        <line x1="21" y1="12" x2="9" y2="12"/>
                    </svg>
                    Выйти из аккаунта
                </button>
            </div>
        `;
        
        // Обработчик открытия настроек
        const openSettingsBtn = document.getElementById('openSettingsFromProfile');
        if (openSettingsBtn) {
            openSettingsBtn.addEventListener('click', () => {
                profileModal.classList.remove('active');
                settingsModal.classList.add('active');
            });
        }
        
        // Обработчик выхода
        document.getElementById('logoutBtnFull').addEventListener('click', async () => {
            await eel.logout()();
            currentUser = null;
            updateUserProfile();
            profileModal.classList.remove('active');
        });
        
        // Обработчики кликов по диалогам
        document.querySelectorAll('.profile-dialog-item').forEach(item => {
            item.addEventListener('click', async () => {
                const dialogPath = item.dataset.path;
                await loadDialogByPath(dialogPath);
                profileModal.classList.remove('active');
            });
        });
    } else {
        // Показываем форму входа
        profileContent.innerHTML = `
            <div class="profile-login">
                <svg class="profile-logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512">
                    <path fill="#ff3b3b" d="M320 0c17.7 0 32 14.3 32 32V96H472c39.8 0 72 32.2 72 72V440c0 39.8-32.2 72-72 72H168c-39.8 0-72-32.2-72-72V168c0-39.8 32.2-72 72-72H288V32c0-17.7 14.3-32 32-32zM208 384c-8.8 0-16 7.2-16 16s7.2 16 16 16h32c8.8 0 16-7.2 16-16s-7.2-16-16-16H208zm96 0c-8.8 0-16 7.2-16 16s7.2 16 16 16h32c8.8 0 16-7.2 16-16s-7.2-16-16-16H304zm96 0c-8.8 0-16 7.2-16 16s7.2 16 16 16h32c8.8 0 16-7.2 16-16s-7.2-16-16-16H400zM264 256a40 40 0 1 0 -80 0 40 40 0 1 0 80 0zm152 40a40 40 0 1 0 0-80 40 40 0 1 0 0 80zM48 224H64V416H48c-26.5 0-48-21.5-48-48V272c0-26.5 21.5-48 48-48zm544 0c26.5 0 48 21.5 48 48v96c0 26.5-21.5 48-48 48H576V224h16z"/>
                </svg>
                <h3>Для использования необходимо авторизоваться</h3>
                <p class="profile-description">Войдите через Twitch, чтобы получить доступ к генерации изображений</p>
                <button class="twitch-login-btn" id="loginBtnModal">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/>
                    </svg>
                    Войти через Twitch
                </button>
                <p class="profile-note">Доступ только для авторизованных пользователей</p>
            </div>
        `;
        
        document.getElementById('loginBtnModal').addEventListener('click', async () => {
            const btn = document.getElementById('loginBtnModal');
            btn.disabled = true;
            btn.textContent = 'Открываем браузер...';
            
            const result = await eel.start_auth()();
            
            if (result.success) {
                // Проверяем авторизацию каждые 2 секунды
                const checkInterval = setInterval(async () => {
                    const authResult = await eel.check_auth()();
                    if (authResult.authenticated) {
                        clearInterval(checkInterval);
                        currentUser = authResult.user;
                        updateUserProfile();
                        profileModal.classList.remove('active');
                        loadBalance();
                    }
                }, 2000);
                
                // Останавливаем проверку через 2 минуты
                setTimeout(() => {
                    clearInterval(checkInterval);
                    btn.disabled = false;
                    btn.innerHTML = `
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/>
                        </svg>
                        Войти через Twitch
                    `;
                }, 120000);
            }
        });
    }
}

closeProfileModal.addEventListener('click', () => {
    profileModal.classList.remove('active');
});

profileModal.addEventListener('click', (e) => {
    if (e.target === profileModal) {
        profileModal.classList.remove('active');
    }
});

// Переключение режимов
document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentMode = btn.dataset.mode;
        
        // Показываем/скрываем кнопку прикрепления
        if (currentMode === 'prompt') {
            attachBtn.style.display = 'none';
        } else {
            attachBtn.style.display = 'flex';
        }
        
        // Меняем placeholder
        if (currentMode === 'prompt') {
            promptInput.placeholder = 'Опишите, какой промпт нужен (например: "Создай промпт для фото кота в космосе")...';
        } else {
            promptInput.placeholder = 'Опишите изображение...';
        }
    });
});

// Модальное окно
selectFolderBtn.addEventListener('click', () => {
    settingsModal.classList.add('active');
});

closeModal.addEventListener('click', () => {
    settingsModal.classList.remove('active');
});

settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
        settingsModal.classList.remove('active');
    }
});

browseFolderBtn.addEventListener('click', async () => {
    const folder = await eel.select_folder()();
    if (folder) {
        folderPathInput.value = folder;
    }
});

// Сохранение API ключа
saveApiKeyBtn.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
        showCustomAlert('Введите API ключ', 'Ошибка', 'error');
        return;
    }
    
    const result = await eel.save_api_key(apiKey)();
    if (result.success) {
        API_KEY = apiKey;
        apiKeyInput.value = '';
        await loadApiKey();
        showCustomAlert('API ключ успешно сохранен', 'Успешно', 'success');
        loadBalance(); // Обновляем баланс с новым ключом
    } else {
        showCustomAlert('Ошибка сохранения API ключа: ' + result.error, 'Ошибка', 'error');
    }
});

// Новый диалог
newChatBtn.addEventListener('click', () => {
    messagesContainer.innerHTML = '';
    attachedImages = [];
    lastGeneratedImage = null; // Сбрасываем последнее изображение
    currentDialogId = null; // Сбрасываем ID диалога
    dialogMessages = []; // Очищаем историю
    updatePreview();
    document.querySelectorAll('.dialog-item').forEach(item => item.classList.remove('active'));
});

async function loadSavePath() {
    const path = await eel.get_save_path()();
    if (path) {
        folderPathInput.value = path;
    }
}

async function loadBalance() {
    const result = await eel.get_balance()();
    if (result.success) {
        balanceElement.textContent = `${result.balance.toFixed(2)} ₽`;
    } else {
        balanceElement.textContent = '—';
    }
}

async function loadDialogs() {
    const dialogs = await eel.get_dialogs_list()();
    dialogsList.innerHTML = '';
    
    dialogs.forEach((dialog, index) => {
        const item = document.createElement('div');
        item.className = 'dialog-item';
        
        // Форматируем название диалога
        let displayName = dialog.name;
        
        // Убираем префикс Dialog_ если есть
        if (displayName.startsWith('Dialog_')) {
            displayName = displayName.replace('Dialog_', '');
        }
        
        // Убираем timestamp в конце (формат: _YYYY-MM-DD_HH-MM-SS)
        const timestampPattern = /_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/;
        displayName = displayName.replace(timestampPattern, '');
        
        // Заменяем подчеркивания на пробелы
        displayName = displayName.replace(/_/g, ' ');
        
        // Если название пустое, используем дату
        if (!displayName.trim()) {
            displayName = dialog.name;
        }
        
        item.innerHTML = `
            <div class="dialog-name">${displayName}</div>
            <div class="dialog-preview">${dialog.prompt}</div>
        `;
        item.addEventListener('click', () => loadDialog(dialog));
        dialogsList.appendChild(item);
        
        // Автоматически загружаем первый (последний) диалог при запуске
        if (index === 0 && !currentDialogId) {
            loadDialog(dialog);
        }
    });
}

async function loadDialog(dialog) {
    try {
        const result = await eel.load_dialog(dialog.path)();
        
        if (!result.success) {
            console.error('Ошибка загрузки диалога:', result.error);
            return;
        }
        
        const dialogData = result.dialog;
        
        // Очищаем текущий диалог
        messagesContainer.innerHTML = '';
        attachedImages = [];
        updatePreview();
        
        // Устанавливаем ID диалога
        currentDialogId = dialogData.dialog_id;
        dialogMessages = dialogData.messages || [];
        
        // Отображаем все сообщения
        for (const message of dialogMessages) {
            if (message.role === 'user') {
                // Отображаем сообщение пользователя
                const messageDiv = document.createElement('div');
                messageDiv.className = 'message user';
                
                let content = '<div class="message-content">';
                
                if (message.images && message.images.length > 0) {
                    content += '<div class="attached-images">';
                    message.images.forEach(imgData => {
                        content += `<div class="attached-image"><img src="${imgData}" alt="Attached"></div>`;
                    });
                    content += '</div>';
                }
                
                if (message.prompt) {
                    content += `<div class="prompt-text">${escapeHtml(message.prompt)}</div>`;
                }
                
                content += '</div>';
                messageDiv.innerHTML = content;
                messagesContainer.appendChild(messageDiv);
                
            } else if (message.role === 'assistant') {
                // Отображаем ответ ассистента
                const messageDiv = document.createElement('div');
                messageDiv.className = 'message assistant';
                
                let content = '<div class="message-content"><div class="generated-images">';
                content += `
                    <div class="generated-image">
                        <img src="${message.image_url}" alt="Generated image" loading="lazy">
                    </div>
                `;
                content += '</div></div>';
                messageDiv.innerHTML = content;
                messagesContainer.appendChild(messageDiv);
                
                // Сохраняем последнее изображение
                lastGeneratedImage = message.image_url;
            }
        }
        
        scrollToBottom();
        
        // Подсвечиваем активный диалог
        document.querySelectorAll('.dialog-item').forEach(item => item.classList.remove('active'));
        
    } catch (error) {
        console.error('Ошибка загрузки диалога:', error);
    }
}

async function loadDialogByPath(dialogPath) {
    const dialogs = await eel.get_dialogs_list()();
    const dialog = dialogs.find(d => d.path === dialogPath);
    if (dialog) {
        await loadDialog(dialog);
    }
}

// Автоматическое изменение высоты textarea
promptInput.addEventListener('input', () => {
    promptInput.style.height = 'auto';
    promptInput.style.height = promptInput.scrollHeight + 'px';
});

// Отправка по Enter (без Shift)
promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

generateBtn.addEventListener('click', sendMessage);
attachBtn.addEventListener('click', () => imageInput.click());
imageInput.addEventListener('change', handleImageSelect);

async function loadBalance() {
    const result = await eel.get_balance()();
    if (result.success) {
        balanceElement.textContent = `${result.balance.toFixed(2)} ₽`;
    } else {
        balanceElement.textContent = '—';
    }
}

function handleImageSelect(e) {
    const files = Array.from(e.target.files);
    
    files.forEach(file => {
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (event) => {
                attachedImages.push({
                    file: file,
                    dataUrl: event.target.result
                });
                updatePreview();
            };
            reader.readAsDataURL(file);
        }
    });
    
    imageInput.value = '';
}

function updatePreview() {
    previewImagesContainer.innerHTML = '';
    const inputWrapper = document.querySelector('.input-wrapper');
    
    if (attachedImages.length > 0) {
        inputWrapper.classList.add('has-preview');
    } else {
        inputWrapper.classList.remove('has-preview');
    }
    
    attachedImages.forEach((img, index) => {
        const previewDiv = document.createElement('div');
        previewDiv.className = 'preview-image';
        previewDiv.innerHTML = `
            <img src="${img.dataUrl}" alt="Preview">
            <button class="remove-image" data-index="${index}">×</button>
        `;
        previewImagesContainer.appendChild(previewDiv);
    });
    
    // Обработчики удаления
    document.querySelectorAll('.remove-image').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index);
            attachedImages.splice(index, 1);
            updatePreview();
            updateEditMode();
        });
    });
    
    updateEditMode();
}

function updateEditMode() {
    editMode = attachedImages.length > 0;
    const inputWrapper = document.querySelector('.input-wrapper');
    
    if (editMode) {
        promptInput.placeholder = 'Опишите, что нужно изменить на изображении...';
        inputWrapper.classList.add('edit-mode');
    } else {
        promptInput.placeholder = 'Введите запрос...';
        inputWrapper.classList.remove('edit-mode');
    }
}

async function sendMessage() {
    const prompt = promptInput.value.trim();
    
    if (!prompt && attachedImages.length === 0) {
        return;
    }
    
    // Проверяем авторизацию
    if (!currentUser) {
        profileModal.classList.add('active');
        showProfileModal();
        return;
    }
    
    // Проверяем наличие API ключа
    if (!API_KEY) {
        showCustomAlert('Пожалуйста, введите API ключ в настройках');
        settingsModal.classList.add('active');
        return;
    }
    
    if (isGenerating) return;

    // Если нет прикрепленных изображений, но есть последнее сгенерированное - используем его
    if (attachedImages.length === 0 && lastGeneratedImage && currentMode === 'image') {
        await loadImageForEdit(lastGeneratedImage, true);
    }

    // Сохраняем данные сообщения
    const messageData = {
        prompt: prompt,
        images: [...attachedImages]
    };
    
    // Добавляем сообщение пользователя
    addUserMessage(messageData);
    
    // Очищаем поля ввода
    promptInput.value = '';
    promptInput.style.height = 'auto';
    attachedImages = [];
    updatePreview();
    
    // Показываем индикатор загрузки
    const loadingId = addLoadingMessage();
    
    isGenerating = true;
    generateBtn.disabled = true;

    try {
        // Если режим "Промпты" - используем Chat API для генерации промпта
        if (currentMode === 'prompt') {
            console.log('Генерация промпта через Chat API');
            
            const response = await fetch(CHAT_API_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: CHAT_MODEL,
                    messages: [
                        {
                            role: 'system',
                            content: 'Ты - эксперт по созданию промптов для генерации изображений. Твоя задача - создавать детальные, качественные промпты на английском языке для AI-генераторов изображений. Промпт должен быть подробным, включать стиль, освещение, композицию, детали. Отвечай только промптом, без дополнительных объяснений.'
                        },
                        {
                            role: 'user',
                            content: messageData.prompt
                        }
                    ],
                    temperature: 0.8,
                    max_tokens: 500
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || errorData.error || `Ошибка API: ${response.status}`);
            }

            const data = await response.json();
            
            // Удаляем индикатор загрузки
            removeLoadingMessage(loadingId);
            
            // Получаем сгенерированный промпт
            const generatedPrompt = data.choices[0].message.content.trim();
            
            // Добавляем ответ с промптом
            addPromptMessage(generatedPrompt);
            
            // Обновляем баланс
            loadBalance();
            
        } else {
            // Режим "Изображения" - генерируем изображение
            let response, data;
            
            // Если есть изображения, используем Media API
            if (messageData.images.length > 0) {
                const imagesArray = messageData.images.map(img => ({
                    type: 'base64',
                    data: img.dataUrl
                }));
                
                console.log('Отправка через Media API с изображениями');
                
                response = await fetch(MEDIA_API_URL, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: MODEL,
                        input: {
                            prompt: messageData.prompt,
                            images: imagesArray,
                            aspect_ratio: '16:9',
                            image_resolution: '2K',
                            output_format: 'png'
                        }
                    })
                });
            } else {
                // Без изображений тоже используем Media API
                console.log('Отправка через Media API без изображений');
                
                response = await fetch(MEDIA_API_URL, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: MODEL,
                        input: {
                            prompt: messageData.prompt,
                            aspect_ratio: '16:9',
                            image_resolution: '2K',
                            output_format: 'png'
                        }
                    })
                });
            }

            const responseText = await response.text();
            console.log('Ответ сервера:', responseText);

            if (!response.ok) {
                let errorData;
                try {
                    errorData = JSON.parse(responseText);
                } catch (e) {
                    errorData = { message: responseText };
                }
                throw new Error(errorData.message || errorData.error || `Ошибка API: ${response.status} - ${responseText}`);
            }

            data = JSON.parse(responseText);
            
            // Удаляем индикатор загрузки
            removeLoadingMessage(loadingId);
            
            // Проверяем формат ответа
            if (data.status === 'pending' || data.status === 'processing') {
                const result = await pollForResult(data.id);
                addAssistantMessage(result.images, result.usage);
            } else if (data.id && !data.data) {
                const result = await pollForResult(data.id);
                addAssistantMessage(result.images, result.usage);
            } else if (data.data && data.data.length > 0) {
                addAssistantMessage(data.data, data.usage);
            } else if (data.url) {
                addAssistantMessage([{ url: data.url }], data.usage);
            } else {
                console.error('Неожиданный формат:', data);
                throw new Error('Неожиданный формат ответа');
            }
            
            // Обновляем баланс после генерации
            loadBalance();
        }

    } catch (error) {
        console.error('Ошибка:', error);
        removeLoadingMessage(loadingId);
        
        // Обрабатываем специфичные ошибки
        let errorMessage = error.message;
        
        if (errorMessage.includes('FORBIDDEN') || errorMessage.includes('safety filters')) {
            errorMessage = 'Контент заблокирован фильтрами безопасности. Попробуйте изменить запрос или изображение.';
        } else if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
            errorMessage = 'Ошибка авторизации. Проверьте API ключ в настройках.';
        } else if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
            errorMessage = 'Превышен лимит запросов. Подождите немного и попробуйте снова.';
        } else if (errorMessage.includes('insufficient')) {
            errorMessage = 'Недостаточно средств на балансе. Пополните баланс на Polza.ai';
        }
        
        addErrorMessage(errorMessage);
    } finally {
        isGenerating = false;
        generateBtn.disabled = false;
    }
}

async function pollForResult(taskId) {
    const maxAttempts = 40;
    let attempts = 0;

    while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        try {
            const response = await fetch(`https://polza.ai/api/v1/media/${taskId}`, {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`
                }
            });

            if (!response.ok) {
                throw new Error(`Ошибка проверки статуса: ${response.status}`);
            }

            const data = await response.json();
            console.log('Статус задачи:', data);

            if (data.status === 'completed') {
                // Media API возвращает data.data с массивом изображений
                let images = [];
                if (data.data && Array.isArray(data.data)) {
                    images = data.data;
                } else if (data.data && data.data.url) {
                    images = [data.data];
                } else if (data.url) {
                    images = [{ url: data.url }];
                } else {
                    console.error('Неожиданный формат completed:', data);
                    throw new Error('Не удалось получить URL изображения');
                }
                
                return { images, usage: data.usage };
            } else if (data.status === 'failed') {
                const errorMsg = data.error ? `${data.error.code}: ${data.error.message}` : 'Генерация не удалась';
                throw new Error(errorMsg);
            }

            attempts++;
        } catch (error) {
            throw error;
        }
    }

    throw new Error('Превышено время ожидания генерации');
}

function addUserMessage(data) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message user';
    
    let content = '<div class="message-content">';
    
    if (data.images.length > 0) {
        content += '<div class="attached-images">';
        data.images.forEach(img => {
            content += `<div class="attached-image"><img src="${img.dataUrl}" alt="Attached"></div>`;
        });
        content += '</div>';
    }
    
    if (data.prompt) {
        content += `<div class="prompt-text">${escapeHtml(data.prompt)}</div>`;
    }
    
    content += '</div>';
    messageDiv.innerHTML = content;
    
    messagesContainer.appendChild(messageDiv);
    scrollToBottom();
    
    // Добавляем в историю диалога
    dialogMessages.push({
        role: 'user',
        prompt: data.prompt,
        images: data.images.map(img => img.dataUrl),
        timestamp: new Date().toISOString()
    });
    
    // Сохраняем диалог
    saveCurrentDialog();
}

function addAssistantMessage(images, usage) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message assistant';
    
    let content = '<div class="message-content"><div class="generated-images">';
    
    images.forEach(img => {
        const imageUrl = img.url || img;
        currentResultUrl = imageUrl; // Сохраняем URL результата
        lastGeneratedImage = imageUrl; // Сохраняем для автоматического использования
        content += `
            <div class="generated-image">
                <img src="${imageUrl}" alt="Generated image" loading="lazy">
            </div>
        `;
    });
    
    content += '</div></div>';
    messageDiv.innerHTML = content;
    
    messagesContainer.appendChild(messageDiv);
    
    scrollToBottom();
    
    // Добавляем в историю диалога
    dialogMessages.push({
        role: 'assistant',
        image_url: currentResultUrl,
        timestamp: new Date().toISOString()
    });
    
    // Сохраняем диалог
    saveCurrentDialog();
}

async function saveCurrentDialog() {
    if (dialogMessages.length === 0) return;
    
    const dialogData = {
        dialog_id: currentDialogId,
        messages: dialogMessages,
        created_at: dialogMessages[0].timestamp,
        updated_at: new Date().toISOString()
    };
    
    const result = await eel.save_full_dialog(dialogData)();
    if (result.success && !currentDialogId) {
        currentDialogId = result.dialog_id;
        // Обновляем список диалогов сразу после создания нового
        loadDialogs();
    }
}

function addPromptMessage(promptText) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message assistant';
    
    const content = `
        <div class="message-content">
            <div class="generated-prompt">
                <div class="prompt-header">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                    </svg>
                    <span>Сгенерированный промпт</span>
                </div>
                <div class="prompt-text-box">${escapeHtml(promptText)}</div>
                <div class="prompt-actions">
                    <button class="copy-prompt-btn" data-prompt="${escapeHtml(promptText)}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        </svg>
                        Копировать
                    </button>
                    <button class="use-prompt-btn" data-prompt="${escapeHtml(promptText)}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                            <circle cx="8.5" cy="8.5" r="1.5"/>
                            <polyline points="21 15 16 10 5 21"/>
                        </svg>
                        Использовать для генерации
                    </button>
                </div>
            </div>
        </div>
    `;
    
    messageDiv.innerHTML = content;
    messagesContainer.appendChild(messageDiv);
    
    // Обработчик копирования
    messageDiv.querySelector('.copy-prompt-btn').addEventListener('click', (e) => {
        const prompt = e.currentTarget.dataset.prompt;
        navigator.clipboard.writeText(prompt).then(() => {
            const btn = e.currentTarget;
            const originalText = btn.innerHTML;
            btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Скопировано!';
            setTimeout(() => {
                btn.innerHTML = originalText;
            }, 2000);
        });
    });
    
    // Обработчик использования промпта
    messageDiv.querySelector('.use-prompt-btn').addEventListener('click', (e) => {
        const prompt = e.currentTarget.dataset.prompt;
        // Переключаемся на режим изображений
        document.querySelector('.mode-btn[data-mode="image"]').click();
        // Вставляем промпт в поле ввода
        promptInput.value = prompt;
        promptInput.style.height = 'auto';
        promptInput.style.height = promptInput.scrollHeight + 'px';
        promptInput.focus();
        scrollToBottom();
    });
    
    scrollToBottom();
}

async function loadImageForEdit(imageUrl, silent = false) {
    try {
        // Загружаем изображение как blob
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        
        // Конвертируем в data URL
        const reader = new FileReader();
        reader.onload = (event) => {
            attachedImages.push({
                file: new File([blob], 'image.jpg', { type: blob.type }),
                dataUrl: event.target.result
            });
            updatePreview();
            if (!silent) {
                promptInput.focus();
            }
        };
        reader.readAsDataURL(blob);
    } catch (error) {
        console.error('Ошибка загрузки изображения:', error);
    }
}

function addLoadingMessage() {
    const id = 'loading-' + Date.now();
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message assistant';
    messageDiv.id = id;
    messageDiv.innerHTML = `
        <div class="loading-message">
            <div class="loader"></div>
            <span>Генерирую изображение...</span>
        </div>
    `;
    
    messagesContainer.appendChild(messageDiv);
    scrollToBottom();
    return id;
}

function removeLoadingMessage(id) {
    const element = document.getElementById(id);
    if (element) {
        element.remove();
    }
}

function addErrorMessage(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message assistant';
    messageDiv.innerHTML = `
        <div class="message-content">
            <div class="error-message">Ошибка: ${escapeHtml(message)}</div>
        </div>
    `;
    
    messagesContainer.appendChild(messageDiv);
    scrollToBottom();
}

function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Кастомное уведомление
function showCustomAlert(message, title = 'Внимание', type = 'warning') {
    const alertElement = document.getElementById('customAlert');
    const titleElement = document.getElementById('customAlertTitle');
    const messageElement = document.getElementById('customAlertMessage');
    const btnElement = document.getElementById('customAlertBtn');
    const iconElement = alertElement.querySelector('.custom-alert-icon');
    
    titleElement.textContent = title;
    messageElement.textContent = message;
    
    // Меняем иконку в зависимости от типа
    if (type === 'success') {
        iconElement.style.background = '#065f46';
        iconElement.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
        `;
        iconElement.querySelector('svg').style.color = '#34d399';
    } else if (type === 'error') {
        iconElement.style.background = '#7f1d1d';
        iconElement.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
        `;
        iconElement.querySelector('svg').style.color = '#f87171';
    } else {
        iconElement.style.background = '#422006';
        iconElement.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
        `;
        iconElement.querySelector('svg').style.color = '#fbbf24';
    }
    
    alertElement.classList.add('active');
    
    // Обработчик закрытия
    const closeAlert = () => {
        alertElement.classList.remove('active');
        btnElement.removeEventListener('click', closeAlert);
        alertElement.removeEventListener('click', outsideClick);
    };
    
    // Закрытие по клику на кнопку
    btnElement.addEventListener('click', closeAlert);
    
    // Закрытие по клику вне окна
    const outsideClick = (e) => {
        if (e.target === alertElement) {
            closeAlert();
        }
    };
    alertElement.addEventListener('click', outsideClick);
}
