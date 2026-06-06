const SUPABASE_URL = 'VOTRE_URL_SUPABASE';
const SUPABASE_ANON_KEY = 'VOTRE_CLE_ANON_SUPABASE';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentChatUser = null;
let messagesSubscription = null;

// Initialisation
document.addEventListener('DOMContentLoaded', async () => {
    await initChat();
    initTheme();
    setupEventListeners();
});

async function initChat() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
        window.location.href = 'index.html';
        return;
    }
    
    currentUser = user;
    
    // Charger profil utilisateur
    const { data: profile } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();
    
    if (profile) {
        document.getElementById('currentUsername').textContent = profile.username;
    }
    
    // Charger utilisateurs en ligne
    await loadUsers();
    
    // S'abonner aux changements en temps réel
    subscribeToUsers();
    subscribeToMessages();
}

async function loadUsers() {
    const { data: users } = await supabase
        .from('users')
        .select('*')
        .neq('id', currentUser.id)
        .order('is_online', { ascending: false });
    
    displayUsers(users || []);
}

function displayUsers(users) {
    const usersList = document.getElementById('usersList');
    usersList.innerHTML = users.map(user => `
        <div class="user-item" data-user-id="${user.id}" data-username="${user.username}">
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
    
    // Ajouter événements click
    document.querySelectorAll('.user-item').forEach(item => {
        item.addEventListener('click', () => {
            const userId = item.dataset.userId;
            const username = item.dataset.username;
            selectUser(userId, username);
        });
    });
}

function subscribeToUsers() {
    supabase
        .channel('users')
        .on('postgres_changes', 
            { event: '*', schema: 'public', table: 'users' },
            () => loadUsers()
        )
        .subscribe();
}

async function selectUser(userId, username) {
    currentChatUser = { id: userId, username };
    
    // Mettre à jour UI
    document.getElementById('chatHeader').style.display = 'flex';
    document.getElementById('chatInput').style.display = 'block';
    document.getElementById('chatUsername').textContent = username;
    document.getElementById('messagesContainer').innerHTML = '';
    
    // Marquer l'utilisateur comme actif
    document.querySelectorAll('.user-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.userId === userId) {
            item.classList.add('active');
        }
    });
    
    // Charger messages
    await loadMessages();
}

async function loadMessages() {
    if (!currentChatUser) return;
    
    const { data: messages } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${currentChatUser.id}),and(sender_id.eq.${currentChatUser.id},receiver_id.eq.${currentUser.id})`)
        .order('created_at', { ascending: true });
    
    displayMessages(messages || []);
}

function displayMessages(messages) {
    const container = document.getElementById('messagesContainer');
    container.innerHTML = messages.map(msg => `
        <div class="message ${msg.sender_id === currentUser.id ? 'sent' : 'received'}">
            <div class="message-bubble">
                <div class="message-text">${escapeHtml(msg.message)}</div>
                <div class="message-time">${formatTime(msg.created_at)}</div>
            </div>
        </div>
    `).join('');
    
    // Scroll en bas
    container.scrollTop = container.scrollHeight;
}

function subscribeToMessages() {
    messagesSubscription = supabase
        .channel('messages')
        .on('postgres_changes', 
            { event: 'INSERT', schema: 'public', table: 'messages' },
            (payload) => {
                const newMessage = payload.new;
                if (currentChatUser && 
                    ((newMessage.sender_id === currentChatUser.id && newMessage.receiver_id === currentUser.id) ||
                     (newMessage.sender_id === currentUser.id && newMessage.receiver_id === currentChatUser.id))) {
                    loadMessages();
                }
            }
        )
        .subscribe();
}

async function sendMessage() {
    const input = document.getElementById('messageInput');
    const message = input.value.trim();
    
    if (!message || !currentChatUser) return;
    
    try {
        await supabase
            .from('messages')
            .insert([{
                sender_id: currentUser.id,
                receiver_id: currentChatUser.id,
                message: message,
                created_at: new Date()
            }]);
        
        input.value = '';
        input.style.height = 'auto';
    } catch (error) {
        showToast('Erreur lors de l\'envoi du message', true);
    }
}

function setupEventListeners() {
    // Envoi message
    document.getElementById('sendMessageBtn').addEventListener('click', sendMessage);
    document.getElementById('messageInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // Auto-resize textarea
    document.getElementById('messageInput').addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 100) + 'px';
    });
    
    // Déconnexion
    document.getElementById('logoutBtn').addEventListener('click', async () => {
        await supabase
            .from('users')
            .update({ is_online: false, last_seen: new Date() })
            .eq('id', currentUser.id);
        
        await supabase.auth.signOut();
        window.location.href = 'index.html';
    });
    
    // Theme toggle
    const themeToggle = document.getElementById('themeToggleSidebar');
    if (themeToggle) themeToggle.addEventListener('click', toggleTheme);
}

// Utilitaires
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTime(date) {
    return new Date(date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.style.background = isError ? 'var(--danger)' : 'var(--success)';
    toast.style.color = 'white';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light-theme';
    document.body.className = savedTheme;
}

function toggleTheme() {
    const currentTheme = document.body.className;
    const newTheme = currentTheme === 'light-theme' ? 'dark-theme' : 'light-theme';
    document.body.className = newTheme;
    localStorage.setItem('theme', newTheme);
}