// Configuration
const API_URL = 'https://21-chat.vercel.app';
let currentUser = null;
let currentConversation = null;
let sessionId = localStorage.getItem('sessionId');
let pollingInterval = null;

// Éléments DOM
const elements = {
    themeToggle: document.getElementById('themeToggle'),
    conversationsList: document.getElementById('conversationsList'),
    messagesContainer: document.getElementById('messagesContainer'),
    messageInput: document.getElementById('messageInput'),
    sendMessageBtn: document.getElementById('sendMessageBtn'),
    messageInputArea: document.getElementById('messageInputArea'),
    currentChatName: document.getElementById('currentChatName'),
    username: document.getElementById('username'),
    userStatus: document.getElementById('userStatus'),
    loginBtn: document.getElementById('loginBtn'),
    logoutBtn: document.getElementById('logoutBtn'),
    newConversationBtn: document.getElementById('newConversationBtn'),
    loginModal: document.getElementById('loginModal'),
    newConversationModal: document.getElementById('newConversationModal'),
    loginForm: document.getElementById('loginForm'),
    registerForm: document.getElementById('registerForm'),
    authTabs: document.querySelectorAll('.auth-tab'),
    searchUser: document.getElementById('searchUser'),
    usersList: document.getElementById('usersList'),
    loginEmail: document.getElementById('loginEmail'),
    loginPassword: document.getElementById('loginPassword'),
    registerUsername: document.getElementById('registerUsername'),
    registerEmail: document.getElementById('registerEmail'),
    registerPassword: document.getElementById('registerPassword'),
    mobileMenuBtn: document.getElementById('mobileMenuBtn'),
    sidebar: document.getElementById('sidebar')
};

// ==================== API REQUESTS ====================
async function apiRequest(endpoint, method = 'GET', data = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json'
        }
    };
    
    if (sessionId) {
        options.headers['X-Session-Id'] = sessionId;
    }
    
    if (data) {
        options.body = JSON.stringify(data);
    }
    
    try {
        const response = await fetch(`${API_URL}/api${endpoint}`, options);
        const result = await response.json();
        
        if (!result.success) {
            if (response.status === 401) {
                logout();
                throw new Error('Session expirée');
            }
            throw new Error(result.message);
        }
        
        return result.data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// ==================== AUTHENTIFICATION ====================
async function login(email, password) {
    try {
        const data = await apiRequest('/login', 'POST', { email, password });
        sessionId = data.sessionId;
        currentUser = data.user;
        localStorage.setItem('sessionId', sessionId);
        localStorage.setItem('user', JSON.stringify(currentUser));
        
        updateAuthUI(true);
        closeModal(elements.loginModal);
        await loadConversations();
        showNotification('Connecté avec succès!', 'success');
        
        startPolling();
        
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

async function register(username, email, password) {
    try {
        const data = await apiRequest('/register', 'POST', { username, email, password });
        sessionId = data.sessionId;
        currentUser = data.user;
        localStorage.setItem('sessionId', sessionId);
        localStorage.setItem('user', JSON.stringify(currentUser));
        
        updateAuthUI(true);
        closeModal(elements.loginModal);
        await loadConversations();
        showNotification('Inscription réussie!', 'success');
        
        startPolling();
        
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

function logout() {
    if (pollingInterval) clearInterval(pollingInterval);
    
    localStorage.removeItem('sessionId');
    localStorage.removeItem('user');
    sessionId = null;
    currentUser = null;
    currentConversation = null;
    
    updateAuthUI(false);
    if (elements.conversationsList) {
        elements.conversationsList.innerHTML = '<div class="empty-state">Aucune conversation</div>';
    }
    if (elements.messagesContainer) {
        elements.messagesContainer.innerHTML = '<div class="empty-chat-state"><i class="fas fa-comment-dots"></i><h3>Bienvenue</h3><p>Connectez-vous pour commencer</p></div>';
    }
    if (elements.messageInputArea) {
        elements.messageInputArea.style.display = 'none';
    }
    showNotification('Déconnecté', 'info');
}

function updateAuthUI(isLoggedIn) {
    if (isLoggedIn && currentUser) {
        elements.loginBtn.style.display = 'none';
        elements.logoutBtn.style.display = 'flex';
        elements.newConversationBtn.style.display = 'block';
        elements.username.textContent = currentUser.username;
        elements.userStatus.innerHTML = '<i class="fas fa-circle"></i> En ligne';
    } else {
        elements.loginBtn.style.display = 'flex';
        elements.logoutBtn.style.display = 'none';
        elements.newConversationBtn.style.display = 'none';
        elements.username.textContent = 'Invité';
        elements.userStatus.innerHTML = '<i class="fas fa-circle"></i> Déconnecté';
    }
}

// ==================== POLLING ====================
function startPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(async () => {
        if (currentUser) {
            await loadConversations();
            if (currentConversation) {
                await loadMessages();
            }
        }
    }, 3000);
}

// ==================== CONVERSATIONS ====================
async function loadConversations() {
    if (!currentUser) return;
    
    try {
        const conversations = await apiRequest('/conversations', 'GET');
        
        if (!conversations.length) {
            elements.conversationsList.innerHTML = '<div class="empty-state">Aucune conversation<br><small>Cliquez sur + pour en créer une</small></div>';
            return;
        }
        
        elements.conversationsList.innerHTML = conversations.map(conv => `
            <div class="conversation-item" data-id="${conv.id}" data-other-user-id="${conv.other_user_id}">
                <div class="conversation-avatar">
                    <i class="fas fa-${conv.other_avatar || 'user-circle'}"></i>
                    ${conv.unread_count > 0 ? `<span class="unread-badge">${conv.unread_count}</span>` : ''}
                    ${conv.other_status === 'online' ? '<span class="online-indicator"></span>' : ''}
                </div>
                <div class="conversation-info">
                    <h4>${escapeHtml(conv.other_username)}</h4>
                    <p>${escapeHtml(conv.last_message || 'Nouvelle conversation')}</p>
                </div>
            </div>
        `).join('');
        
        document.querySelectorAll('.conversation-item').forEach(item => {
            item.addEventListener('click', () => selectConversation(parseInt(item.dataset.id)));
        });
    } catch (error) {
        console.error('Error loading conversations:', error);
    }
}

async function selectConversation(conversationId) {
    currentConversation = conversationId;
    
    document.querySelectorAll('.conversation-item').forEach(item => {
        item.classList.remove('active');
        if (parseInt(item.dataset.id) === conversationId) {
            item.classList.add('active');
            const name = item.querySelector('h4').textContent;
            elements.currentChatName.textContent = name;
        }
    });
    
    elements.messageInputArea.style.display = 'flex';
    await loadMessages();
}

async function loadMessages() {
    if (!currentConversation) return;
    
    try {
        const messages = await apiRequest(`/messages/${currentConversation}`, 'GET');
        displayMessages(messages);
    } catch (error) {
        console.error('Error loading messages:', error);
    }
}

function displayMessages(messages) {
    if (!messages.length) {
        elements.messagesContainer.innerHTML = '<div class="empty-chat-state">Aucun message</div>';
        return;
    }
    
    elements.messagesContainer.innerHTML = messages.map(msg => `
        <div class="message ${msg.user_id === currentUser.id ? 'sent' : 'received'}">
            <div class="message-content">
                ${msg.user_id !== currentUser.id ? `<span class="message-username">${escapeHtml(msg.username)}</span>` : ''}
                <div class="message-text">${escapeHtml(msg.message)}</div>
                <span class="message-time">${new Date(msg.created_at).toLocaleTimeString()}</span>
            </div>
        </div>
    `).join('');
    
    scrollToBottom();
}

async function sendMessage() {
    const text = elements.messageInput?.value.trim();
    if (!text || !currentConversation) return;
    
    // Afficher temporairement
    const tempMessage = `
        <div class="message sent">
            <div class="message-content">
                <div class="message-text">${escapeHtml(text)}</div>
                <span class="message-time">Envoi...</span>
            </div>
        </div>
    `;
    elements.messagesContainer.innerHTML += tempMessage;
    scrollToBottom();
    elements.messageInput.value = '';
    
    try {
        await apiRequest('/messages', 'POST', {
            conversationId: currentConversation,
            message: text
        });
        await loadMessages();
        await loadConversations();
    } catch (error) {
        showNotification('Erreur lors de l\'envoi', 'error');
        await loadMessages();
    }
}

async function createConversation(otherUserId) {
    try {
        const data = await apiRequest('/conversations', 'POST', { otherUserId });
        await loadConversations();
        selectConversation(data.conversationId);
        closeModal(elements.newConversationModal);
        showNotification('Conversation créée!', 'success');
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

async function searchUsers(searchTerm) {
    if (!searchTerm || searchTerm.length < 2) {
        elements.usersList.innerHTML = '';
        return;
    }
    
    try {
        const users = await apiRequest(`/users/search?q=${encodeURIComponent(searchTerm)}`, 'GET');
        
        if (!users.length) {
            elements.usersList.innerHTML = '<div class="empty-state">Aucun utilisateur</div>';
            return;
        }
        
        elements.usersList.innerHTML = users.map(user => `
            <div class="user-item">
                <div class="user-item-info">
                    <i class="fas fa-${user.avatar || 'user-circle'}"></i>
                    <div>
                        <strong>${escapeHtml(user.username)}</strong>
                        <div style="font-size: 12px;">${user.status === 'online' ? '🟢 En ligne' : '⚫ Hors ligne'}</div>
                    </div>
                </div>
                <button class="start-chat-btn" data-id="${user.id}">Discuter</button>
            </div>
        `).join('');
        
        document.querySelectorAll('.start-chat-btn').forEach(btn => {
            btn.addEventListener('click', () => createConversation(btn.dataset.id));
        });
    } catch (error) {
        console.error('Search error:', error);
    }
}

// ==================== UTILITAIRES ====================
function scrollToBottom() {
    if (elements.messagesContainer) {
        elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `<i class="fas fa-info-circle"></i> ${escapeHtml(message)}`;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

function autoResizeTextarea() {
    if (elements.messageInput) {
        elements.messageInput.style.height = 'auto';
        elements.messageInput.style.height = Math.min(elements.messageInput.scrollHeight, 100) + 'px';
    }
}

// ==================== THEME ====================
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light-theme';
    document.body.className = savedTheme;
    const icon = savedTheme === 'dark-theme' ? 'fa-sun' : 'fa-moon';
    if (elements.themeToggle) {
        const iconEl = elements.themeToggle.querySelector('i');
        if (iconEl) iconEl.className = `fas ${icon}`;
    }
}

function toggleTheme() {
    const isDark = document.body.classList.contains('dark-theme');
    const newTheme = isDark ? 'light-theme' : 'dark-theme';
    document.body.className = newTheme;
    localStorage.setItem('theme', newTheme);
    const icon = isDark ? 'fa-moon' : 'fa-sun';
    if (elements.themeToggle) {
        const iconEl = elements.themeToggle.querySelector('i');
        if (iconEl) iconEl.className = `fas ${icon}`;
    }
}

// ==================== MODALS ====================
function openModal(modal) {
    if (modal) modal.classList.add('active');
}

function closeModal(modal) {
    if (modal) modal.classList.remove('active');
}

function switchAuthTab(tab) {
    elements.loginForm.style.display = tab === 'login' ? 'block' : 'none';
    elements.registerForm.style.display = tab === 'register' ? 'block' : 'none';
    elements.authTabs.forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tab);
    });
}

// ==================== MOBILE MENU ====================
function initMobileMenu() {
    if (elements.mobileMenuBtn && elements.sidebar) {
        elements.mobileMenuBtn.addEventListener('click', () => {
            elements.sidebar.classList.toggle('open');
        });
        
        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 768 && 
                !elements.sidebar.contains(e.target) && 
                !elements.mobileMenuBtn.contains(e.target) &&
                elements.sidebar.classList.contains('open')) {
                elements.sidebar.classList.remove('open');
            }
        });
    }
}

// ==================== INIT ====================
async function init() {
    initTheme();
    initMobileMenu();
    
    if (elements.themeToggle) {
        elements.themeToggle.addEventListener('click', toggleTheme);
    }
    
    const savedUser = localStorage.getItem('user');
    if (sessionId && savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            updateAuthUI(true);
            await loadConversations();
            startPolling();
        } catch (error) {
            logout();
        }
    }
    
    if (elements.messageInput) {
        elements.messageInput.addEventListener('input', autoResizeTextarea);
        elements.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }
    
    if (elements.sendMessageBtn) {
        elements.sendMessageBtn.addEventListener('click', sendMessage);
    }
    
    if (elements.searchUser) {
        elements.searchUser.addEventListener('input', (e) => searchUsers(e.target.value));
    }
}

// ==================== EVENT LISTENERS ====================
elements.loginBtn?.addEventListener('click', () => openModal(elements.loginModal));
elements.logoutBtn?.addEventListener('click', logout);
elements.newConversationBtn?.addEventListener('click', () => openModal(elements.newConversationModal));

elements.loginForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    login(elements.loginEmail?.value, elements.loginPassword?.value);
});

elements.registerForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    register(elements.registerUsername?.value, elements.registerEmail?.value, elements.registerPassword?.value);
});

elements.authTabs?.forEach(tab => {
    tab.addEventListener('click', () => switchAuthTab(tab.dataset.tab));
});

document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
        closeModal(elements.loginModal);
        closeModal(elements.newConversationModal);
    });
});

// Démarrer
init();