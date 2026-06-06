// Configuration Supabase
const SUPABASE_URL = 'VOTRE_URL_SUPABASE';
const SUPABASE_ANON_KEY = 'VOTRE_CLE_ANON_SUPABASE';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Gestion du thème
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light-theme';
    document.body.className = savedTheme;
    updateThemeIcon(savedTheme);
}

function updateThemeIcon(theme) {
    const icon = document.querySelector('#themeToggle i');
    if (icon) {
        icon.className = theme === 'dark-theme' ? 'fas fa-sun' : 'fas fa-moon';
    }
}

function toggleTheme() {
    const currentTheme = document.body.className;
    const newTheme = currentTheme === 'light-theme' ? 'dark-theme' : 'light-theme';
    document.body.className = newTheme;
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
}

// Toast notification
function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.style.background = isError ? 'var(--danger)' : 'var(--success)';
    toast.style.color = 'white';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// Gestion de l'authentification
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) themeToggle.addEventListener('click', toggleTheme);
    
    // Vérifier si déjà connecté
    checkAuth();
    
    // Tab switching
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            document.querySelectorAll('.auth-form').forEach(form => {
                form.classList.remove('active');
            });
            document.getElementById(`${tab}Form`).classList.add('active');
        });
    });
    
    // Login form
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email, password
            });
            
            if (error) throw error;
            
            // Mettre à jour le statut en ligne
            await supabase
                .from('users')
                .update({ is_online: true, last_seen: new Date() })
                .eq('id', data.user.id);
            
            showToast('Connexion réussie !');
            localStorage.setItem('userId', data.user.id);
            window.location.href = 'chat.html';
        } catch (error) {
            showToast(error.message, true);
        }
    });
    
    // Register form
    document.getElementById('registerForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('registerUsername').value;
        const email = document.getElementById('registerEmail').value;
        const password = document.getElementById('registerPassword').value;
        
        if (password.length < 6) {
            showToast('Le mot de passe doit contenir au moins 6 caractères', true);
            return;
        }
        
        try {
            const { data, error } = await supabase.auth.signUp({
                email, password
            });
            
            if (error) throw error;
            
            // Créer le profil utilisateur
            await supabase
                .from('users')
                .insert([{
                    id: data.user.id,
                    username: username,
                    email: email,
                    is_online: true,
                    created_at: new Date()
                }]);
            
            showToast('Inscription réussie ! Connectez-vous.');
            document.querySelector('.tab-btn[data-tab="login"]').click();
        } catch (error) {
            showToast(error.message, true);
        }
    });
});

async function checkAuth() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user && window.location.pathname.includes('index.html')) {
        window.location.href = 'chat.html';
    }
}