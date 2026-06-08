const express = require('express');
const cors = require('cors');

const app = express();

// Middleware - Important pour Vercel
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Session-Id']
}));

app.use(express.json());

// Stockage en mémoire
const users = [];
const sessions = {};

// Créer un utilisateur de test au démarrage
users.push({
    id: 1,
    username: 'Demo',
    email: 'demo@example.com',
    password: 'demo123',
    avatar: 'user-circle',
    color: '#e94560'
});

// Fonctions
function createSession(userId) {
    const sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
    sessions[sessionId] = { userId, createdAt: Date.now() };
    return sessionId;
}

function getUserIdFromSession(sessionId) {
    const session = sessions[sessionId];
    if (session && Date.now() - session.createdAt < 7 * 24 * 60 * 60 * 1000) {
        return session.userId;
    }
    return null;
}

// ==================== ROUTES ====================

// Health check
app.get('/api/health', (req, res) => {
    res.json({ success: true, message: 'API OK', usersCount: users.length });
});

// Inscription
app.post('/api/register', (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        console.log('📝 Inscription:', { username, email });
        
        if (!username || !email || !password) {
            return res.status(400).json({ success: false, message: 'Tous les champs sont requis' });
        }
        
        // Vérifier si l'utilisateur existe
        const existingUser = users.find(u => u.email === email);
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Email déjà utilisé' });
        }
        
        // Créer l'utilisateur
        const newUser = {
            id: users.length + 1,
            username,
            email,
            password: password,
            avatar: 'user-circle',
            color: '#e94560'
        };
        
        users.push(newUser);
        
        const sessionId = createSession(newUser.id);
        
        console.log('✅ Utilisateur créé:', username);
        
        res.json({
            success: true,
            data: {
                sessionId,
                user: {
                    id: newUser.id,
                    username: newUser.username,
                    email: newUser.email,
                    avatar: newUser.avatar,
                    color: newUser.color
                }
            }
        });
        
    } catch (error) {
        console.error('❌ Erreur inscription:', error);
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

// Connexion - CORRIGÉE
app.post('/api/login', (req, res) => {
    try {
        const { email, password } = req.body;
        
        console.log('🔑 Tentative de connexion:', { email, password });
        console.log('📋 Utilisateurs existants:', users.map(u => ({ email: u.email, password: u.password })));
        
        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email et mot de passe requis' });
        }
        
        // Chercher l'utilisateur
        const user = users.find(u => u.email === email);
        
        if (!user) {
            console.log('❌ Utilisateur non trouvé:', email);
            return res.status(401).json({ success: false, message: 'Email ou mot de passe incorrect' });
        }
        
        // Vérifier le mot de passe
        if (user.password !== password) {
            console.log('❌ Mot de passe incorrect pour:', email);
            return res.status(401).json({ success: false, message: 'Email ou mot de passe incorrect' });
        }
        
        // Créer la session
        const sessionId = createSession(user.id);
        
        console.log('✅ Connexion réussie:', user.username);
        
        res.json({
            success: true,
            data: {
                sessionId,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    avatar: user.avatar,
                    color: user.color
                }
            }
        });
        
    } catch (error) {
        console.error('❌ Erreur connexion:', error);
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

// Déconnexion
app.post('/api/logout', (req, res) => {
    const sessionId = req.headers['x-session-id'];
    if (sessionId) {
        delete sessions[sessionId];
    }
    res.json({ success: true });
});

// Vérifier session - CORRIGÉE
app.get('/api/verify', (req, res) => {
    const sessionId = req.headers['x-session-id'];
    
    console.log('🔍 Vérification session:', sessionId);
    console.log('📋 Sessions actives:', Object.keys(sessions));
    
    if (!sessionId) {
        return res.status(401).json({ success: false, message: 'Session manquante' });
    }
    
    const userId = getUserIdFromSession(sessionId);
    if (!userId) {
        return res.status(401).json({ success: false, message: 'Session invalide' });
    }
    
    const user = users.find(u => u.id === userId);
    if (!user) {
        return res.status(401).json({ success: false, message: 'Utilisateur non trouvé' });
    }
    
    res.json({
        success: true,
        data: {
            id: user.id,
            username: user.username,
            email: user.email,
            avatar: user.avatar,
            color: user.color
        }
    });
});

// Conversations
app.get('/api/conversations', (req, res) => {
    const sessionId = req.headers['x-session-id'];
    const userId = getUserIdFromSession(sessionId);
    
    if (!userId) {
        return res.status(401).json({ success: false, message: 'Non authentifié' });
    }
    
    res.json({ success: true, data: [] });
});

app.get('/api/messages/:conversationId', (req, res) => {
    const sessionId = req.headers['x-session-id'];
    const userId = getUserIdFromSession(sessionId);
    
    if (!userId) {
        return res.status(401).json({ success: false, message: 'Non authentifié' });
    }
    
    res.json({ success: true, data: [] });
});

app.post('/api/messages', (req, res) => {
    const sessionId = req.headers['x-session-id'];
    const userId = getUserIdFromSession(sessionId);
    
    if (!userId) {
        return res.status(401).json({ success: false, message: 'Non authentifié' });
    }
    
    res.json({ success: true, data: { id: Date.now() } });
});

app.post('/api/conversations', (req, res) => {
    const sessionId = req.headers['x-session-id'];
    const userId = getUserIdFromSession(sessionId);
    
    if (!userId) {
        return res.status(401).json({ success: false, message: 'Non authentifié' });
    }
    
    res.json({ success: true, data: { conversationId: Date.now() } });
});

app.get('/api/users/search', (req, res) => {
    const sessionId = req.headers['x-session-id'];
    const userId = getUserIdFromSession(sessionId);
    
    if (!userId) {
        return res.status(401).json({ success: false, message: 'Non authentifié' });
    }
    
    const { q } = req.query;
    if (!q) {
        return res.json({ success: true, data: [] });
    }
    
    const filtered = users
        .filter(u => u.id !== userId && u.username.toLowerCase().includes(q.toLowerCase()))
        .map(u => ({
            id: u.id,
            username: u.username,
            email: u.email,
            avatar: u.avatar,
            status: 'offline'
        }));
    
    res.json({ success: true, data: filtered });
});

// Export pour Vercel
module.exports = app;

// Pour test local
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`🚀 Serveur sur http://localhost:${PORT}`);
        console.log(`📝 Compte test: demo@example.com / demo123`);
    });
}