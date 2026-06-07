const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const { Server } = require('socket.io');

dotenv.config();

const supabase = require('./supabaseClient');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Sessions
const sessions = new Map();
const onlineUsers = new Map();

function createSession(userId) {
    const sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
    sessions.set(sessionId, { userId, createdAt: Date.now() });
    return sessionId;
}

// ==================== SOCKET.IO ====================
io.use((socket, next) => {
    const userId = socket.handshake.auth.userId;
    if (!userId) {
        return next(new Error('Non authentifié'));
    }
    socket.userId = parseInt(userId);
    next();
});

io.on('connection', (socket) => {
    console.log('🟢 Utilisateur connecté:', socket.userId);
    
    onlineUsers.set(socket.userId, socket.id);
    
    // Mettre à jour le statut dans Supabase
    supabase
        .from('users')
        .update({ status: 'online', last_seen: new Date() })
        .eq('id', socket.userId)
        .then();
    
    // Rejoindre une conversation
    socket.on('join_conversation', (conversationId) => {
        socket.join(`conv_${conversationId}`);
        console.log(`User ${socket.userId} joined conv_${conversationId}`);
    });
    
    // Quitter une conversation
    socket.on('leave_conversation', (conversationId) => {
        socket.leave(`conv_${conversationId}`);
    });
    
    // Envoi de message
    socket.on('send_message', async (data) => {
        try {
            const { conversationId, message } = data;
            
            // Sauvegarder dans Supabase
            const { data: newMessage, error } = await supabase
                .from('messages')
                .insert({
                    conversation_id: conversationId,
                    user_id: socket.userId,
                    message: message
                })
                .select(`
                    *,
                    users (username, avatar, color)
                `)
                .single();
            
            if (error) throw error;
            
            // Mettre à jour la conversation
            await supabase
                .from('conversations')
                .update({ updated_at: new Date() })
                .eq('id', conversationId);
            
            // Envoyer à tous les participants
            io.to(`conv_${conversationId}`).emit('new_message', {
                id: newMessage.id,
                conversation_id: newMessage.conversation_id,
                user_id: newMessage.user_id,
                message: newMessage.message,
                created_at: newMessage.created_at,
                username: newMessage.users.username,
                avatar: newMessage.users.avatar,
                color: newMessage.users.color
            });
            
        } catch (error) {
            console.error('Erreur envoi message:', error);
            socket.emit('message_error', { error: error.message });
        }
    });
    
    // Indicateur de frappe
    socket.on('typing', (data) => {
        const { conversationId, isTyping } = data;
        socket.to(`conv_${conversationId}`).emit('user_typing', {
            userId: socket.userId,
            conversationId,
            isTyping
        });
    });
    
    // Marquer comme lu
    socket.on('mark_read', async (conversationId) => {
        await supabase
            .from('messages')
            .update({ is_read: true })
            .eq('conversation_id', conversationId)
            .neq('user_id', socket.userId);
        
        io.to(`conv_${conversationId}`).emit('messages_read', { conversationId });
    });
    
    // Déconnexion
    socket.on('disconnect', () => {
        console.log('🔴 Utilisateur déconnecté:', socket.userId);
        onlineUsers.delete(socket.userId);
        
        supabase
            .from('users')
            .update({ status: 'offline', last_seen: new Date() })
            .eq('id', socket.userId)
            .then();
    });
});

// ==================== ROUTES API ====================

// Health check
app.get('/api/health', (req, res) => {
    res.json({ success: true, message: 'API OK' });
});

// Inscription
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        if (!username || !email || !password) {
            return res.status(400).json({ success: false, message: 'Tous les champs sont requis' });
        }
        
        // Vérifier si l'utilisateur existe
        const { data: existing } = await supabase
            .from('users')
            .select('id')
            .eq('email', email)
            .single();
        
        if (existing) {
            return res.status(400).json({ success: false, message: 'Email déjà utilisé' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const { data: newUser, error } = await supabase
            .from('users')
            .insert({
                username,
                email,
                password: hashedPassword,
                avatar: 'user-circle',
                color: '#e94560'
            })
            .select('id, username, email, avatar, color')
            .single();
        
        if (error) throw error;
        
        const sessionId = createSession(newUser.id);
        
        res.json({ success: true, data: { sessionId, user: newUser } });
        
    } catch (error) {
        console.error('Erreur:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Connexion
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const { data: users, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', email);
        
        if (error) throw error;
        
        if (!users || users.length === 0) {
            return res.status(401).json({ success: false, message: 'Email ou mot de passe incorrect' });
        }
        
        const user = users[0];
        const isValid = await bcrypt.compare(password, user.password);
        
        if (!isValid) {
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
        console.error('Erreur:', error);
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

// Déconnexion
app.post('/api/logout', (req, res) => {
    const sessionId = req.headers['x-session-id'];
    if (sessionId) sessions.delete(sessionId);
    res.json({ success: true });
});

// Vérifier session
app.get('/api/verify', (req, res) => {
    const sessionId = req.headers['x-session-id'];
    if (!sessionId || !sessions.has(sessionId)) {
        return res.status(401).json({ success: false, message: 'Non authentifié' });
    }
    res.json({ success: true, data: { id: sessions.get(sessionId).userId } });
});

// Obtenir conversations
app.get('/api/conversations', async (req, res) => {
    try {
        const sessionId = req.headers['x-session-id'];
        if (!sessionId || !sessions.has(sessionId)) {
            return res.status(401).json({ success: false, message: 'Non authentifié' });
        }
        
        const userId = sessions.get(sessionId).userId;
        
        // Récupérer les conversations
        const { data: participants, error } = await supabase
            .from('conversation_participants')
            .select('conversation_id')
            .eq('user_id', userId);
        
        if (error) throw error;
        
        const conversations = [];
        
        for (const p of participants) {
            // Récupérer l'autre utilisateur
            const { data: otherUser } = await supabase
                .from('conversation_participants')
                .select('users(id, username, avatar, color, status)')
                .eq('conversation_id', p.conversation_id)
                .neq('user_id', userId)
                .single();
            
            // Récupérer dernier message
            const { data: lastMsg } = await supabase
                .from('messages')
                .select('message, created_at')
                .eq('conversation_id', p.conversation_id)
                .order('created_at', { ascending: false })
                .limit(1);
            
            // Compter non lus
            const { count } = await supabase
                .from('messages')
                .select('*', { count: 'exact', head: true })
                .eq('conversation_id', p.conversation_id)
                .neq('user_id', userId)
                .eq('is_read', false);
            
            conversations.push({
                id: p.conversation_id,
                other_user_id: otherUser?.users?.id,
                other_username: otherUser?.users?.username || 'Inconnu',
                other_avatar: otherUser?.users?.avatar || 'user-circle',
                other_status: otherUser?.users?.status || 'offline',
                last_message: lastMsg?.[0]?.message || null,
                last_message_time: lastMsg?.[0]?.created_at || null,
                unread_count: count || 0
            });
        }
        
        res.json({ success: true, data: conversations });
        
    } catch (error) {
        console.error('Erreur:', error);
        res.json({ success: true, data: [] });
    }
});

// Obtenir messages
app.get('/api/messages/:conversationId', async (req, res) => {
    try {
        const { conversationId } = req.params;
        
        const { data: messages, error } = await supabase
            .from('messages')
            .select(`
                *,
                users (username, avatar, color)
            `)
            .eq('conversation_id', parseInt(conversationId))
            .order('created_at', { ascending: true });
        
        if (error) throw error;
        
        const formatted = messages.map(m => ({
            ...m,
            username: m.users.username,
            avatar: m.users.avatar,
            color: m.users.color
        }));
        
        res.json({ success: true, data: formatted });
        
    } catch (error) {
        res.json({ success: true, data: [] });
    }
});

// Envoyer message (HTTP fallback)
app.post('/api/messages', async (req, res) => {
    try {
        const { conversationId, message } = req.body;
        const sessionId = req.headers['x-session-id'];
        const userId = sessions.get(sessionId)?.userId;
        
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Non authentifié' });
        }
        
        const { data: newMessage, error } = await supabase
            .from('messages')
            .insert({
                conversation_id: conversationId,
                user_id: userId,
                message: message
            })
            .select()
            .single();
        
        if (error) throw error;
        
        res.json({ success: true, data: newMessage });
        
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Créer conversation
app.post('/api/conversations', async (req, res) => {
    try {
        const { otherUserId } = req.body;
        const sessionId = req.headers['x-session-id'];
        const userId = sessions.get(sessionId)?.userId;
        
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Non authentifié' });
        }
        
        // Vérifier si conversation existe déjà
        const { data: existing } = await supabase
            .from('conversation_participants')
            .select('conversation_id')
            .eq('user_id', userId);
        
        for (const item of existing || []) {
            const { data: participants } = await supabase
                .from('conversation_participants')
                .select('user_id')
                .eq('conversation_id', item.conversation_id);
            
            if (participants?.some(p => p.user_id === parseInt(otherUserId))) {
                return res.json({ success: true, data: { conversationId: item.conversation_id } });
            }
        }
        
        // Créer nouvelle conversation
        const { data: conv, error: convError } = await supabase
            .from('conversations')
            .insert({})
            .select()
            .single();
        
        if (convError) throw convError;
        
        // Ajouter participants
        await supabase
            .from('conversation_participants')
            .insert([
                { conversation_id: conv.id, user_id: userId },
                { conversation_id: conv.id, user_id: parseInt(otherUserId) }
            ]);
        
        res.json({ success: true, data: { conversationId: conv.id } });
        
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Rechercher utilisateurs
app.get('/api/users/search', async (req, res) => {
    try {
        const { q } = req.query;
        
        const { data: users, error } = await supabase
            .from('users')
            .select('id, username, email, avatar, status')
            .ilike('username', `%${q}%`)
            .limit(10);
        
        if (error) throw error;
        
        res.json({ success: true, data: users || [] });
        
    } catch (error) {
        res.json({ success: true, data: [] });
    }
});

// Frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Démarrage
server.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════╗
║   🚀 SERVEUR DÉMARRÉ                                  ║
║   📡 http://localhost:${PORT}                          ║
║   🔌 WebSocket: ws://localhost:${PORT}                 ║
║   💾 Base de données: Supabase                        ║
╚═══════════════════════════════════════════════════════╝
    `);
});