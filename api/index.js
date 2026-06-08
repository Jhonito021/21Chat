const express = require('express');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Session-Id']
}));
app.options('*', cors());
app.use(express.json());

// Stockage en mémoire
const users = [
    {
        id: 1,
        username: 'Demo',
        email: 'demo@example.com',
        password: 'demo123',
        avatar: 'user-circle',
        color: '#e94560'
    }
];
const sessions = {};

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
    res.json({ success: true, message: 'API OK' });
});

// Inscription
app.post('/api/register', (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        if (!username || !email || !password) {
            return res.status(400).json({ success: false, message: 'Tous les champs sont requis' });
        }
        
        const existingUser = users.find(u => u.email === email);
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Email déjà utilisé' });
        }
        
        const newUser = {
            id: users.length + 1,
            username,
            email,
            password,
            avatar: 'user-circle',
            color: '#e94560'
        };
        
        users.push(newUser);
        const sessionId = createSession(newUser.id);
        
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
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

// Connexion
app.post('/api/login', (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email et mot de passe requis' });
        }
        
        const user = users.find(u => u.email === email);
        
        if (!user || user.password !== password) {
            return res.status(401).json({ success: false, message: 'Email ou mot de passe incorrect' });
        }
        
        const sessionId = createSession(user.id);
        
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

// Vérifier session
app.get('/api/verify', (req, res) => {
    const sessionId = req.headers['x-session-id'];
    
    if (!sessionId) {
        return res.status(401).json({ success: false, message: 'Non authentifié' });
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
    if (!sessionId) {
        return res.status(401).json({ success: false, message: 'Non authentifié' });
    }
    res.json({ success: true, data: [] });
});

app.get('/api/messages/:conversationId', (req, res) => {
    const sessionId = req.headers['x-session-id'];
    if (!sessionId) {
        return res.status(401).json({ success: false, message: 'Non authentifié' });
    }
    res.json({ success: true, data: [] });
});

app.post('/api/messages', (req, res) => {
    const sessionId = req.headers['x-session-id'];
    if (!sessionId) {
        return res.status(401).json({ success: false, message: 'Non authentifié' });
    }
    res.json({ success: true, data: { id: Date.now() } });
});

app.post('/api/conversations', (req, res) => {
    const sessionId = req.headers['x-session-id'];
    if (!sessionId) {
        return res.status(401).json({ success: false, message: 'Non authentifié' });
    }
    res.json({ success: true, data: { conversationId: Date.now() } });
});

app.get('/api/users/search', (req, res) => {
    const sessionId = req.headers['x-session-id'];
    if (!sessionId) {
        return res.status(401).json({ success: false, message: 'Non authentifié' });
    }
    
    const { q } = req.query;
    if (!q || q.length < 2) {
        return res.json({ success: true, data: [] });
    }
    
    const userId = getUserIdFromSession(sessionId);
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

module.exports = app;