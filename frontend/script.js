// script.js - Page de connexion
(function() {
    // Gestion du thème
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
        const icon = document.querySelector('#themeToggle i');
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

    function showToast(message, isError = false) {
        const toast = document.getElementById('toast');
        if (!toast) return;
        
        toast.textContent = message;
        toast.style.background = isError ? '#dc3545' : '#28a745';
        toast.style.color = 'white';
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }

    // Vérifier si déjà connecté
    async function checkAuth() {
        if (window.api && window.api.isAuthenticated()) {
            window.location.href = 'chat.html';
        }
    }

    // Initialisation
    document.addEventListener('DOMContentLoaded', () => {
        initTheme();
        checkAuth();
        
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', toggleTheme);
        }
        
        // Raccourci clavier thème
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'D') {
                e.preventDefault();
                toggleTheme();
            }
        });
        
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
            
            const submitBtn = e.target.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connexion...';
            
            try {
                const result = await window.api.signIn(email, password);
                
                if (result.error) {
                    throw new Error(result.error);
                }
                
                showToast('Connexion réussie !');
                setTimeout(() => {
                    window.location.href = 'chat.html';
                }, 500);
            } catch (error) {
                showToast(error.message, true);
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Se connecter';
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
            
            const submitBtn = e.target.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Inscription...';
            
            try {
                const result = await window.api.signUp(email, password, username);
                
                if (result.error) {
                    throw new Error(result.error);
                }
                
                showToast('Inscription réussie ! Connectez-vous.');
                document.getElementById('registerForm').reset();
                document.querySelector('.tab-btn[data-tab="login"]').click();
            } catch (error) {
                showToast(error.message, true);
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-user-plus"></i> S\'inscrire';
            }
        });
    });
})();