const express = require('express');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Stockage temporaire en mémoire
const users = [];
const sessions = {};

// Helper functions
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

// Health check
app.get('/api/health', (req, res) => {
    res.json({ success: true, message: 'API OK' });
});

// Inscription (version sans bcrypt pour test)
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
        
        // Créer l'utilisateur (mot de passe en clair pour test)
        const newUser = {
            id: users.length + 1,
            username,
            email,
            password: password, // ⚠️ En clair pour test uniquement
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
        console.error('❌ Erreur:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Connexion (version sans bcrypt)
app.post('/api/login', (req, res) => {
    try {
        const { email, password } = req.body;
        
        console.log('🔑 Connexion:', email);
        
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
        console.error('❌ Erreur:', error);
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

// Déconnexion
app.post('/api/logout', (req, res) => {
    const sessionId = req.headers['x-session-id'];
    if (sessionId) delete sessions[sessionId];
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
    res.json({ success: true, data: [] });
});

app.get('/api/messages/:conversationId', (req, res) => {
    res.json({ success: true, data: [] });
});

app.post('/api/messages', (req, res) => {
    res.json({ success: true, data: { id: Date.now() } });
});

app.post('/api/conversations', (req, res) => {
    res.json({ success: true, data: { conversationId: Date.now() } });
});

app.get('/api/users/search', (req, res) => {
    const { q } = req.query;
    if (!q) {
        return res.json({ success: true, data: [] });
    }
    
    const filtered = users.filter(u => 
        u.username.toLowerCase().includes(q.toLowerCase()) ||
        u.email.toLowerCase().includes(q.toLowerCase())
    ).slice(0, 10);
    
    res.json({ success: true, data: filtered });
});

// Créer un utilisateur de test au démarrage
users.push({
    id: 1,
    username: 'Demo',
    email: 'demo@example.com',
    password: 'demo123',
    avatar: 'user-circle',
    color: '#e94560'
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