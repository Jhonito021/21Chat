// Configuration
const API_URL = 'http://localhost:3000'; // Assurez-vous que cela correspond à l'URL de votre backend
let socket = null;
let currentUser = null;
let currentConversation = null;
let sessionId = localStorage.getItem('sessionId');

// Éléments DOM
const elements = {
    themeToggle: document.getElementById('themeToggle'),
    themeToggleMobile: document.getElementById('themeToggleMobile'),
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
    sidebar: document.getElementById('sidebar'),
    mobileMenuBtn: document.getElementById('mobileMenuBtn'),
    sidebarOverlay: document.getElementById('sidebarOverlay'),
    closeSidebarBtn: document.getElementById('closeSidebarBtn')
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
}

// ==================== GESTION MOBILE ====================
function initMobileMenu() {
    if (!elements.mobileMenuBtn || !elements.sidebar) return;
    
    // Ouvrir le sidebar
    elements.mobileMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        elements.sidebar.classList.add('open');
        if (elements.sidebarOverlay) {
            elements.sidebarOverlay.classList.add('active');
        }
        document.body.style.overflow = 'hidden';
    });
    
    // Fermer avec l'overlay
    if (elements.sidebarOverlay) {
        elements.sidebarOverlay.addEventListener('click', () => {
            elements.sidebar.classList.remove('open');
            elements.sidebarOverlay.classList.remove('active');
            document.body.style.overflow = '';
        });
    }
    
    // Fermer avec le bouton de fermeture
    if (elements.closeSidebarBtn) {
        elements.closeSidebarBtn.addEventListener('click', () => {
            elements.sidebar.classList.remove('open');
            if (elements.sidebarOverlay) {
                elements.sidebarOverlay.classList.remove('active');
            }
            document.body.style.overflow = '';
        });
    }
    
    // Fermer quand on sélectionne une conversation sur mobile
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768) {
            const conversationItem = e.target.closest('.conversation-item');
            if (conversationItem && elements.sidebar.classList.contains('open')) {
                setTimeout(() => {
                    elements.sidebar.classList.remove('open');
                    if (elements.sidebarOverlay) {
                        elements.sidebarOverlay.classList.remove('active');
                    }
                    document.body.style.overflow = '';
                }, 300);
            }
        }
    });
    
    // Gérer le redimensionnement
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) {
            elements.sidebar.classList.remove('open');
            if (elements.sidebarOverlay) {
                elements.sidebarOverlay.classList.remove('active');
            }
            document.body.style.overflow = '';
        }
    });
}

// ==================== SOCKET ====================
function initSocket() {
    if (socket) {
        socket.disconnect();
    }
    
    socket = io(API_URL || window.location.origin, {
        auth: { userId: currentUser?.id },
        transports: ['websocket', 'polling']
    });
    
    socket.on('connect', () => {
        console.log('Socket connecté');
    });
    
    socket.on('connect_error', (error) => {
        console.error('Socket error:', error);
    });
    
    socket.on('new_message', (message) => {
        if (message.conversation_id === currentConversation) {
            addMessageToChat(message);
            socket.emit('mark_read', currentConversation);
        } else {
            loadConversations();
            showNotification(`Nouveau message de ${message.username}`, 'info');
        }
    });
    
    socket.on('user_typing', (data) => {
        const typingIndicator = document.getElementById('typingIndicator');
        if (data.conversationId === currentConversation && data.isTyping) {
            if (!typingIndicator && elements.messagesContainer) {
                const indicator = document.createElement('div');
                indicator.id = 'typingIndicator';
                indicator.className = 'typing-indicator';
                indicator.innerHTML = 'Quelqu\'un écrit...';
                elements.messagesContainer.appendChild(indicator);
                scrollToBottom();
            }
        } else if (typingIndicator) {
            typingIndicator.remove();
        }
    });
    
    socket.on('user_status_change', (data) => {
        updateUserStatusUI(data.userId, data.status);
    });
    
    socket.on('message_error', (error) => {
        showNotification(error.error, 'error');
    });
}

// ==================== AUTH ====================
async function login(email, password) {
    try {
        const data = await apiRequest('/login', 'POST', { email, password });
        sessionId = data.sessionId;
        currentUser = data.user;
        localStorage.setItem('sessionId', sessionId);
        localStorage.setItem('user', JSON.stringify(currentUser));
        
        initSocket();
        updateAuthUI(true);
        closeModal(elements.loginModal);
        await loadConversations();
        showNotification('Connecté avec succès!', 'success');
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
        
        initSocket();
        updateAuthUI(true);
        closeModal(elements.loginModal);
        await loadConversations();
        showNotification('Inscription réussie!', 'success');
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

function logout() {
    if (socket) socket.disconnect();
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
        elements.messagesContainer.innerHTML = '<div class="empty-chat-state">Connectez-vous pour commencer</div>';
    }
    if (elements.messageInputArea) {
        elements.messageInputArea.style.display = 'none';
    }
    showNotification('Déconnecté', 'info');
}

function updateAuthUI(isLoggedIn) {
    if (isLoggedIn && currentUser) {
        if (elements.loginBtn) elements.loginBtn.style.display = 'none';
        if (elements.logoutBtn) elements.logoutBtn.style.display = 'flex';
        if (elements.newConversationBtn) elements.newConversationBtn.style.display = 'block';
        if (elements.username) elements.username.textContent = currentUser.username;
        if (elements.userStatus) elements.userStatus.innerHTML = '<i class="fas fa-circle"></i> En ligne';
    } else {
        if (elements.loginBtn) elements.loginBtn.style.display = 'flex';
        if (elements.logoutBtn) elements.logoutBtn.style.display = 'none';
        if (elements.newConversationBtn) elements.newConversationBtn.style.display = 'none';
        if (elements.username) elements.username.textContent = 'Invité';
        if (elements.userStatus) elements.userStatus.innerHTML = '<i class="fas fa-circle"></i> Déconnecté';
    }
}

// ==================== CONVERSATIONS ====================
async function loadConversations() {
    if (!currentUser) return;
    
    try {
        const conversations = await apiRequest('/conversations', 'GET');
        
        if (!conversations.length) {
            elements.conversationsList.innerHTML = '<div class="empty-state">Aucune conversation</div>';
            return;
        }
        
        elements.conversationsList.innerHTML = conversations.map(conv => `
            <div class="conversation-item" data-id="${conv.id}" data-other-user-id="${conv.other_user_id}">
                <div class="conversation-avatar">
                    <i class="fas fa-user-circle"></i>
                    ${conv.unread_count > 0 ? `<span class="unread-badge">${conv.unread_count}</span>` : ''}
                    ${conv.other_is_online ? '<span class="online-indicator"></span>' : ''}
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
            if (elements.currentChatName) elements.currentChatName.textContent = name;
        }
    });
    
    if (elements.messageInputArea) {
        elements.messageInputArea.style.display = 'flex';
    }
    
    if (socket) {
        socket.emit('join_conversation', conversationId);
        socket.emit('mark_read', conversationId);
    }
    
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

function addMessageToChat(message) {
    const messageHtml = `
        <div class="message ${message.user_id === currentUser.id ? 'sent' : 'received'}">
            <div class="message-content">
                ${message.user_id !== currentUser.id ? `<span class="message-username">${escapeHtml(message.username)}</span>` : ''}
                <div class="message-text">${escapeHtml(message.message)}</div>
                <span class="message-time">${new Date(message.created_at).toLocaleTimeString()}</span>
            </div>
        </div>
    `;
    elements.messagesContainer.innerHTML += messageHtml;
    scrollToBottom();
}

function sendMessage() {
    const text = elements.messageInput?.value.trim();
    if (!text || !socket || !currentConversation) return;
    
    socket.emit('send_message', {
        conversationId: currentConversation,
        message: text
    });
    
    elements.messageInput.value = '';
    elements.messageInput.style.height = 'auto';
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
                    <i class="fas fa-user-circle"></i>
                    <strong>${escapeHtml(user.username)}</strong>
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
let typingTimeout = null;

function initTypingIndicator() {
    if (elements.messageInput) {
        elements.messageInput.addEventListener('input', () => {
            if (socket && currentConversation) {
                socket.emit('typing', { conversationId: currentConversation, isTyping: true });
                clearTimeout(typingTimeout);
                typingTimeout = setTimeout(() => {
                    socket.emit('typing', { conversationId: currentConversation, isTyping: false });
                }, 1000);
            }
        });
    }
}

function updateUserStatusUI(userId, status) {
    const conversationItems = document.querySelectorAll('.conversation-item');
    conversationItems.forEach(item => {
        if (parseInt(item.dataset.otherUserId) === userId) {
            const avatar = item.querySelector('.conversation-avatar');
            const existingIndicator = avatar.querySelector('.online-indicator');
            
            if (status === 'online') {
                if (!existingIndicator) {
                    const indicator = document.createElement('span');
                    indicator.className = 'online-indicator';
                    avatar.appendChild(indicator);
                }
            } else if (existingIndicator) {
                existingIndicator.remove();
            }
        }
    });
}

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
    const toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) return;
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-info-circle'}"></i> ${escapeHtml(message)}`;
    toastContainer.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
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
    if (elements.themeToggleMobile) {
        const iconEl = elements.themeToggleMobile.querySelector('i');
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
    if (elements.loginForm) {
        elements.loginForm.style.display = tab === 'login' ? 'block' : 'none';
    }
    if (elements.registerForm) {
        elements.registerForm.style.display = tab === 'register' ? 'block' : 'none';
    }
    if (elements.authTabs) {
        elements.authTabs.forEach(t => {
            t.classList.toggle('active', t.dataset.tab === tab);
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
    if (elements.themeToggleMobile) {
        elements.themeToggleMobile.addEventListener('click', toggleTheme);
    }
    
    const savedUser = localStorage.getItem('user');
    if (sessionId && savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            updateAuthUI(true);
            initSocket();
            await loadConversations();
        } catch (error) {
            logout();
        }
    }
    
    initTypingIndicator();
}

// ==================== EVENT LISTENERS ====================
if (elements.loginBtn) {
    elements.loginBtn.addEventListener('click', () => openModal(elements.loginModal));
}
if (elements.logoutBtn) {
    elements.logoutBtn.addEventListener('click', logout);
}
if (elements.newConversationBtn) {
    elements.newConversationBtn.addEventListener('click', () => openModal(elements.newConversationModal));
}

if (elements.loginForm) {
    elements.loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = elements.loginEmail?.value;
        const password = elements.loginPassword?.value;
        if (email && password) login(email, password);
    });
}

if (elements.registerForm) {
    elements.registerForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const username = elements.registerUsername?.value;
        const email = elements.registerEmail?.value;
        const password = elements.registerPassword?.value;
        if (username && email && password) register(username, email, password);
    });
}

if (elements.authTabs) {
    elements.authTabs.forEach(tab => {
        tab.addEventListener('click', () => switchAuthTab(tab.dataset.tab));
    });
}

if (elements.sendMessageBtn) {
    elements.sendMessageBtn.addEventListener('click', sendMessage);
}
if (elements.messageInput) {
    elements.messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    elements.messageInput.addEventListener('input', autoResizeTextarea);
}

if (elements.searchUser) {
    elements.searchUser.addEventListener('input', (e) => searchUsers(e.target.value));
}

document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
        closeModal(elements.loginModal);
        closeModal(elements.newConversationModal);
    });
});

// Démarrer
init();