const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const { 
    createUser, 
    getUserByEmail, 
    getUserById,
    searchUsers,
    getAllUsers,
    createConversation,
    getUserConversations,
    getMessages,
    markMessagesAsRead,
    testConnection
} = require('./database');

const { initSocket, isUserOnline } = require('./socket');

const app = express();
const server = http.createServer(app);

// CORS
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Session-Id']
}));

app.options('*', cors());

app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Sessions
const sessions = new Map();

function createSession(userId) {
    const sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
    sessions.set(sessionId, { userId, createdAt: Date.now() });
    return sessionId;
}

function getUserIdFromSession(sessionId) {
    const session = sessions.get(sessionId);
    if (session && Date.now() - session.createdAt < 7 * 24 * 60 * 60 * 1000) {
        return session.userId;
    }
    sessions.delete(sessionId);
    return null;
}

function authMiddleware(req, res, next) {
    const sessionId = req.headers['x-session-id'];
    
    if (!sessionId) {
        return res.status(401).json({ success: false, message: 'Non authentifié' });
    }
    
    const userId = getUserIdFromSession(sessionId);
    if (!userId) {
        return res.status(401).json({ success: false, message: 'Session invalide' });
    }
    
    req.userId = userId;
    next();
}

// ==================== ROUTES ====================

app.get('/api/health', (req, res) => {
    res.json({ success: true, message: 'API OK' });
});

app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        if (!username || !email || !password) {
            return res.status(400).json({ success: false, message: 'Tous les champs sont requis' });
        }
        
        const existingUser = await getUserByEmail(email);
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Email déjà utilisé' });
        }
        
        const userId = await createUser(username, email, password);
        const sessionId = createSession(userId);
        const user = await getUserById(userId);
        
        res.json({ success: true, data: { sessionId, user } });
        
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email et mot de passe requis' });
        }
        
        const user = await getUserByEmail(email);
        if (!user) {
            return res.status(401).json({ success: false, message: 'Email ou mot de passe incorrect' });
        }
        
        const bcrypt = require('bcryptjs');
        const isValid = await bcrypt.compare(password, user.password);
        
        if (!isValid) {
            return res.status(401).json({ success: false, message: 'Email ou mot de passe incorrect' });
        }
        
        const sessionId = createSession(user.id);
        const userData = await getUserById(user.id);
        
        res.json({ success: true, data: { sessionId, user: userData } });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

app.post('/api/logout', (req, res) => {
    const sessionId = req.headers['x-session-id'];
    if (sessionId) {
        sessions.delete(sessionId);
    }
    res.json({ success: true });
});

app.get('/api/verify', authMiddleware, async (req, res) => {
    try {
        const user = await getUserById(req.userId);
        res.json({ success: true, data: user });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

app.get('/api/users/search', authMiddleware, async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || q.length < 2) {
            return res.json({ success: true, data: [] });
        }
        const users = await searchUsers(q, req.userId);
        res.json({ success: true, data: users });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

app.get('/api/users', authMiddleware, async (req, res) => {
    try {
        const users = await getAllUsers(req.userId);
        res.json({ success: true, data: users });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

app.post('/api/conversations', authMiddleware, async (req, res) => {
    try {
        const { otherUserId } = req.body;
        const conversationId = await createConversation(req.userId, parseInt(otherUserId));
        res.json({ success: true, data: { conversationId } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

app.get('/api/conversations', authMiddleware, async (req, res) => {
    try {
        const conversations = await getUserConversations(req.userId);
        const enriched = conversations.map(conv => ({
            ...conv,
            other_is_online: isUserOnline(conv.other_user_id)
        }));
        res.json({ success: true, data: enriched });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

app.get('/api/messages/:conversationId', authMiddleware, async (req, res) => {
    try {
        const { conversationId } = req.params;
        const messages = await getMessages(parseInt(conversationId));
        res.json({ success: true, data: messages });
    } catch (error) {
        console.error('Route messages error:', error);
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

app.post('/api/messages/read', authMiddleware, async (req, res) => {
    try {
        const { conversationId } = req.body;
        await markMessagesAsRead(conversationId, req.userId);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ==================== DÉMARRAGE ====================

const PORT = process.env.PORT || 3000;

async function startServer() {
    const connected = await testConnection();
    if (!connected) {
        console.error(' MySQL non connecté');
        process.exit(1);
    }
    
    initSocket(server);
    
    server.listen(PORT, () => {
        console.log(`
Serveur démarré                                 
http://localhost:${PORT}                         
WebSocket: ws://localhost:${PORT}             

        `);
    });
}

startServer();