const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Session-Id']
}));
app.options('*', cors());
app.use(express.json());

// Supabase client
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

// Sessions en mémoire (toujours nécessaire pour Vercel)
const sessions = {};

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

// ==================== ROUTES AVEC SUPABASE ====================

// Health check
app.get('/api/health', (req, res) => {
    res.json({ success: true, message: 'API OK with Supabase' });
});

// Inscription avec Supabase
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        if (!username || !email || !password) {
            return res.status(400).json({ success: false, message: 'Tous les champs sont requis' });
        }
        
        // Vérifier si l'utilisateur existe dans Supabase
        const { data: existing, error: findError } = await supabase
            .from('users')
            .select('id')
            .eq('email', email)
            .maybeSingle();
        
        if (existing) {
            return res.status(400).json({ success: false, message: 'Email déjà utilisé' });
        }
        
        // Hasher le mot de passe
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Créer l'utilisateur dans Supabase
        const { data: newUser, error: insertError } = await supabase
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
        
        if (insertError) throw insertError;
        
        const sessionId = createSession(newUser.id);
        
        res.json({
            success: true,
            data: {
                sessionId,
                user: newUser
            }
        });
        
    } catch (error) {
        console.error('Erreur:', error);
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

// Connexion avec Supabase
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Chercher l'utilisateur dans Supabase
        const { data: users, error: findError } = await supabase
            .from('users')
            .select('*')
            .eq('email', email);
        
        if (findError) throw findError;
        
        if (!users || users.length === 0) {
            return res.status(401).json({ success: false, message: 'Email ou mot de passe incorrect' });
        }
        
        const user = users[0];
        
        // Vérifier le mot de passe
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

// Obtenir les conversations d'un utilisateur (avec Supabase)
app.get('/api/conversations', async (req, res) => {
    const sessionId = req.headers['x-session-id'];
    if (!sessionId) {
        return res.status(401).json({ success: false, message: 'Non authentifié' });
    }
    
    const userId = getUserIdFromSession(sessionId);
    if (!userId) {
        return res.status(401).json({ success: false, message: 'Session invalide' });
    }
    
    // Récupérer les conversations depuis Supabase
    const { data: participants, error } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', userId);
    
    if (error) {
        return res.json({ success: true, data: [] });
    }
    
    const conversations = [];
    
    for (const p of participants) {
        // Récupérer l'autre utilisateur
        const { data: otherUser } = await supabase
            .from('conversation_participants')
            .select('users(id, username, avatar, color, status)')
            .eq('conversation_id', p.conversation_id)
            .neq('user_id', userId)
            .single();
        
        // Récupérer le dernier message
        const { data: lastMsg } = await supabase
            .from('messages')
            .select('message, created_at')
            .eq('conversation_id', p.conversation_id)
            .order('created_at', { ascending: false })
            .limit(1);
        
        // Compter les messages non lus
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
});

// Obtenir les messages d'une conversation (avec Supabase)
app.get('/api/messages/:conversationId', async (req, res) => {
    const sessionId = req.headers['x-session-id'];
    if (!sessionId) {
        return res.status(401).json({ success: false, message: 'Non authentifié' });
    }
    
    const userId = getUserIdFromSession(sessionId);
    if (!userId) {
        return res.status(401).json({ success: false, message: 'Session invalide' });
    }
    
    const { conversationId } = req.params;
    
    const { data: messages, error } = await supabase
        .from('messages')
        .select(`
            *,
            users (username, avatar, color)
        `)
        .eq('conversation_id', parseInt(conversationId))
        .order('created_at', { ascending: true });
    
    if (error) {
        return res.json({ success: true, data: [] });
    }
    
    // Marquer les messages comme lus
    await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('conversation_id', parseInt(conversationId))
        .neq('user_id', userId)
        .eq('is_read', false);
    
    const formatted = messages.map(msg => ({
        id: msg.id,
        conversation_id: msg.conversation_id,
        user_id: msg.user_id,
        message: msg.message,
        is_read: msg.is_read,
        created_at: msg.created_at,
        username: msg.users?.username || 'Inconnu',
        avatar: msg.users?.avatar || 'user-circle',
        color: msg.users?.color || '#e94560'
    }));
    
    res.json({ success: true, data: formatted });
});

// Envoyer un message (avec Supabase)
app.post('/api/messages', async (req, res) => {
    const sessionId = req.headers['x-session-id'];
    if (!sessionId) {
        return res.status(401).json({ success: false, message: 'Non authentifié' });
    }
    
    const userId = getUserIdFromSession(sessionId);
    if (!userId) {
        return res.status(401).json({ success: false, message: 'Session invalide' });
    }
    
    const { conversationId, message } = req.body;
    
    const { data: newMessage, error } = await supabase
        .from('messages')
        .insert({
            conversation_id: parseInt(conversationId),
            user_id: userId,
            message: message
        })
        .select()
        .single();
    
    if (error) {
        return res.status(500).json({ success: false, message: 'Erreur lors de l\'envoi' });
    }
    
    // Mettre à jour le updated_at de la conversation
    await supabase
        .from('conversations')
        .update({ updated_at: new Date() })
        .eq('id', parseInt(conversationId));
    
    res.json({ success: true, data: newMessage });
});

// Créer une conversation (avec Supabase)
app.post('/api/conversations', async (req, res) => {
    const sessionId = req.headers['x-session-id'];
    if (!sessionId) {
        return res.status(401).json({ success: false, message: 'Non authentifié' });
    }
    
    const userId = getUserIdFromSession(sessionId);
    if (!userId) {
        return res.status(401).json({ success: false, message: 'Session invalide' });
    }
    
    const { otherUserId } = req.body;
    
    // Vérifier si une conversation existe déjà
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
    
    // Ajouter les participants
    await supabase
        .from('conversation_participants')
        .insert([
            { conversation_id: conv.id, user_id: userId },
            { conversation_id: conv.id, user_id: parseInt(otherUserId) }
        ]);
    
    res.json({ success: true, data: { conversationId: conv.id } });
});

// Rechercher des utilisateurs (avec Supabase)
app.get('/api/users/search', async (req, res) => {
    const sessionId = req.headers['x-session-id'];
    if (!sessionId) {
        return res.status(401).json({ success: false, message: 'Non authentifié' });
    }
    
    const userId = getUserIdFromSession(sessionId);
    if (!userId) {
        return res.status(401).json({ success: false, message: 'Session invalide' });
    }
    
    const { q } = req.query;
    
    if (!q || q.length < 2) {
        return res.json({ success: true, data: [] });
    }
    
    const { data: users, error } = await supabase
        .from('users')
        .select('id, username, email, avatar, color, status')
        .ilike('username', `%${q}%`)
        .neq('id', userId)
        .limit(20);
    
    if (error) {
        return res.json({ success: true, data: [] });
    }
    
    res.json({ success: true, data: users });
});

module.exports = app;