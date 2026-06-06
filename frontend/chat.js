// chat.js - Interface de chat
(function() {
    let currentUser = null;
    let currentChatUser = null;
    let typingTimeout = null;
    
    // Initialisation
    document.addEventListener('DOMContentLoaded', async () => {
        await initChat();
        initTheme();
        setupEventListeners();
        
        // Menu mobile
        const menuToggle = document.getElementById('menuToggle');
        const sidebar = document.getElementById('sidebar');
        if (menuToggle) {
            menuToggle.addEventListener('click', () => {
                sidebar.classList.toggle('open');
            });
        }
        
        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 768 && sidebar && sidebar.classList.contains('open')) {
                if (!sidebar.contains(e.target) && !menuToggle.contains(e.target)) {
                    sidebar.classList.remove('open');
                }
            }
        });
    });
    
    async function initChat() {
        if (!window.api || !window.api.isAuthenticated()) {
            window.location.href = 'index.html';
            return;
        }
        
        try {
            // Récupérer l'utilisateur courant depuis le token
            const token = localStorage.getItem('token');
            if (!token) {
                throw new Error('Non authentifié');
            }
            
            // Simuler l'utilisateur courant (le backend nous donnera les infos)
            currentUser = { id: 'current' };
            
            // Charger les utilisateurs
            await loadUsers();
            
            // Configurer les callbacks socket
            window.api.onNewMessage = (message) => {
                if (currentChatUser && message.sender_id === currentChatUser.id) {
                    loadMessages();
                    showToast(`📩 Nouveau message de ${currentChatUser.username}`);
                } else if (message.sender_id !== currentUser.id) {
                    // Mettre à jour la liste des utilisateurs pour montrer un nouveau message
                    loadUsers();
                }
            };
            
            window.api.onUserTyping = (data) => {
                if (currentChatUser && data.sender_id === currentChatUser.id) {
                    const statusSpan = document.getElementById('chatUserStatus');
                    if (data.is_typing) {
                        statusSpan.innerHTML = '<i class="fas fa-circle"></i> En train d\'écrire...';
                    } else {
                        statusSpan.innerHTML = '<i class="fas fa-circle"></i> En ligne';
                    }
                }
            };
            
        } catch (error) {
            console.error('Erreur initChat:', error);
            showToast('Erreur de connexion', true);
        }
    }
    
    async function loadUsers() {
        try {
            const users = await window.api.getUsers();
            
            if (users.error) {
                throw new Error(users.error);
            }
            
            displayUsers(users);
            
            // Mettre à jour l'utilisateur courant avec les infos du premier utilisateur? 
            // Pour simplifier, on prend le premier utilisateur comme exemple
            if (users.length > 0 && !currentUser.username) {
                // On va chercher l'utilisateur courant via une requête spéciale
                // Pour l'instant, on garde l'ID du token
            }
        } catch (error) {
            console.error('Erreur loadUsers:', error);
        }
    }
    
    function displayUsers(users) {
        const usersList = document.getElementById('usersList');
        if (!usersList) return;
        
        if (users.length === 0) {
            usersList.innerHTML = '<div class="loading-users"><i class="fas fa-users"></i> Aucun utilisateur trouvé</div>';
            return;
        }
        
        usersList.innerHTML = users.map(user => `
            <div class="user-item" data-user-id="${user.id}" data-username="${escapeHtml(user.username)}">
                <div class="avatar small">
                    <i class="fas fa-user-circle"></i>
                </div>
                <div class="user-info-text">
                    <div class="user-name">${escapeHtml(user.username)}</div>
                    <div class="user-last-message">${user.is_online ? 'En ligne' : 'Hors ligne'}</div>
                </div>
                <div class="user-status ${user.is_online ? 'online' : 'offline'}">
                    <i class="fas fa-circle"></i>
                </div>
            </div>
        `).join('');
        
        document.querySelectorAll('.user-item').forEach(item => {
            item.addEventListener('click', () => {
                const userId = item.dataset.userId;
                const username = item.dataset.username;
                selectUser(userId, username);
                
                if (window.innerWidth <= 768) {
                    document.getElementById('sidebar').classList.remove('open');
                }
            });
        });
    }
    
    async function selectUser(userId, username) {
        currentChatUser = { id: userId, username };
        
        document.getElementById('chatHeader').style.display = 'flex';
        document.getElementById('chatInput').style.display = 'block';
        document.getElementById('chatUsername').textContent = username;
        document.getElementById('messagesContainer').innerHTML = '<div class="loading-users"><i class="fas fa-spinner fa-spin"></i> Chargement des messages...</div>';
        
        document.querySelectorAll('.user-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.userId === userId) {
                item.classList.add('active');
            }
        });
        
        const users = await window.api.getUsers();
        const user = users.find(u => u.id === userId);
        
        const statusSpan = document.getElementById('chatUserStatus');
        if (user && user.is_online) {
            statusSpan.innerHTML = '<i class="fas fa-circle"></i> En ligne';
            statusSpan.className = 'user-status online';
        } else {
            statusSpan.innerHTML = '<i class="fas fa-circle"></i> Hors ligne';
            statusSpan.className = 'user-status offline';
        }
        
        await loadMessages();
    }
    
    async function loadMessages() {
        if (!currentChatUser) return;
        
        const messages = await window.api.getMessages(currentChatUser.id);
        
        if (messages.error) {
            console.error('Erreur chargement messages:', messages.error);
            return;
        }
        
        displayMessages(messages);
    }
    
    function displayMessages(messages) {
        const container = document.getElementById('messagesContainer');
        if (!container) return;
        
        if (messages.length === 0) {
            container.innerHTML = '<div class="no-chat-selected"><i class="fas fa-comment-dots"></i><p>Aucun message, commencez la conversation !</p></div>';
            return;
        }
        
        container.innerHTML = messages.map(msg => `
            <div class="message ${msg.sender_id === currentChatUser.id ? 'received' : 'sent'}">
                <div class="message-bubble">
                    <div class="message-text">${escapeHtml(msg.message)}</div>
                    <div class="message-time">${formatTime(msg.created_at)}</div>
                </div>
            </div>
        `).join('');
        
        setTimeout(() => {
            container.scrollTop = container.scrollHeight;
        }, 100);
    }
    
    async function sendMessage() {
        const input = document.getElementById('messageInput');
        const message = input.value.trim();
        
        if (!message || !currentChatUser) return;
        
        try {
            await window.api.sendMessage(currentChatUser.id, message);
            input.value = '';
            input.style.height = 'auto';
            input.focus();
            await loadMessages();
        } catch (error) {
            showToast('Erreur lors de l\'envoi du message', true);
        }
    }
    
    function setupEventListeners() {
        const sendBtn = document.getElementById('sendMessageBtn');
        const messageInput = document.getElementById('messageInput');
        
        if (sendBtn) sendBtn.addEventListener('click', sendMessage);
        
        if (messageInput) {
            messageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                }
            });
            
            messageInput.addEventListener('input', function() {
                this.style.height = 'auto';
                this.style.height = Math.min(this.scrollHeight, 100) + 'px';
                
                // Envoyer l'indicateur de frappe
                if (currentChatUser) {
                    if (typingTimeout) clearTimeout(typingTimeout);
                    window.api.sendTyping(currentChatUser.id, true);
                    typingTimeout = setTimeout(() => {
                        window.api.sendTyping(currentChatUser.id, false);
                    }, 1000);
                }
            });
        }
        
        // Bouton de déconnexion
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                showLogoutModal();
            });
        }
        
        // Modal
        const cancelBtn = document.getElementById('cancelLogoutBtn');
        const confirmBtn = document.getElementById('confirmLogoutBtn');
        const modal = document.getElementById('logoutModal');
        
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                modal.classList.remove('show');
            });
        }
        
        if (confirmBtn) {
            confirmBtn.addEventListener('click', async () => {
                await window.api.logout();
                modal.classList.remove('show');
                showToast('Déconnexion réussie !');
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 500);
            });
        }
        
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('show');
                }
            });
        }
        
        // Thème
        const themeToggle = document.getElementById('themeToggleSidebar');
        if (themeToggle) themeToggle.addEventListener('click', toggleTheme);
        
        // Raccourcis clavier
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'D') {
                e.preventDefault();
                toggleTheme();
            }
            if (e.key === 'Escape') {
                const modal = document.getElementById('logoutModal');
                if (modal) modal.classList.remove('show');
            }
        });
    }
    
    function showLogoutModal() {
        const modal = document.getElementById('logoutModal');
        if (modal) modal.classList.add('show');
    }
    
    function initTheme() {
        try {
            const savedTheme = localStorage.getItem('theme');
            const theme = savedTheme || 'light-theme';
            document.body.className = theme;
            document.documentElement.className = theme;
            updateThemeIcon();
        } catch(e) {
            document.body.className = 'light-theme';
        }
    }
    
    function updateThemeIcon() {
        const isDark = document.body.className === 'dark-theme';
        const icon = document.querySelector('#themeToggleSidebar i');
        if (icon) {
            icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
        }
    }
    
    function toggleTheme() {
        const currentTheme = document.body.className;
        const newTheme = currentTheme === 'light-theme' ? 'dark-theme' : 'light-theme';
        document.body.className = newTheme;
        document.documentElement.className = newTheme;
        localStorage.setItem('theme', newTheme);
        updateThemeIcon();
        showToast(newTheme === 'dark-theme' ? '🌙 Thème sombre activé' : '☀️ Thème clair activé');
    }
    
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    function formatTime(date) {
        const d = new Date(date);
        const now = new Date();
        const diff = now - d;
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        
        if (days === 0) {
            return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        } else if (days === 1) {
            return 'Hier';
        } else if (days < 7) {
            return d.toLocaleDateString('fr-FR', { weekday: 'short' });
        } else {
            return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
        }
    }
    
    function showToast(message, isError = false) {
        const toast = document.getElementById('toast');
        if (!toast) return;
        
        toast.textContent = message;
        toast.style.background = isError ? '#dc3545' : '#28a745';
        toast.style.color = 'white';
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }
})();