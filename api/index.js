const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Initialisation Supabase
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

// Stockage des sessions en mémoire (pour Vercel)
const sessions = new Map();

// ==================== FONCTIONS UTILITAIRES ====================

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

// ==================== ROUTES API ====================

// Health check
app.get('/api/health', (req, res) => {
    res.json({ success: true, message: 'API OK', timestamp: new Date() });
});

// Inscription
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        if (!username || !email || !password) {
            return res.status(400).json({ success: false, message: 'Tous les champs sont requis' });
        }
        
        if (username.length < 3) {
            return res.status(400).json({ success: false, message: 'Nom d\'utilisateur trop court' });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ success: false, message: 'Mot de passe trop court' });
        }
        
        // Vérifier si l'utilisateur existe déjà
        const { data: existing, error: checkError } = await supabase
            .from('users')
            .select('id')
            .eq('email', email)
            .maybeSingle();
        
        if (existing) {
            return res.status(400).json({ success: false, message: 'Email déjà utilisé' });
        }
        
        // Hasher le mot de passe
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Créer l'utilisateur
        const { data: newUser, error: insertError } = await supabase
            .from('users')
            .insert({
                username,
                email,
                password: hashedPassword,
                avatar: 'user-circle',
                color: '#e94560',
                status: 'offline'
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
        console.error('Erreur inscription:', error);
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

// Connexion
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email et mot de passe requis' });
        }
        
        // Récupérer l'utilisateur
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
        
        // Mettre à jour le statut
        await supabase
            .from('users')
            .update({ status: 'online', last_seen: new Date() })
            .eq('id', user.id);
        
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
        console.error('Erreur connexion:', error);
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

// Déconnexion
app.post('/api/logout', async (req, res) => {
    const sessionId = req.headers['x-session-id'];
    
    if (sessionId) {
        const userId = getUserIdFromSession(sessionId);
        if (userId) {
            await supabase
                .from('users')
                .update({ status: 'offline', last_seen: new Date() })
                .eq('id', userId);
        }
        sessions.delete(sessionId);
    }
    
    res.json({ success: true });
});

// Vérifier session
app.get('/api/verify', async (req, res) => {
    const sessionId = req.headers['x-session-id'];
    
    if (!sessionId) {
        return res.status(401).json({ success: false, message: 'Non authentifié' });
    }
    
    const userId = getUserIdFromSession(sessionId);
    if (!userId) {
        return res.status(401).json({ success: false, message: 'Session invalide' });
    }
    
    const { data: user, error } = await supabase
        .from('users')
        .select('id, username, email, avatar, color')
        .eq('id', userId)
        .single();
    
    if (error || !user) {
        return res.status(401).json({ success: false, message: 'Utilisateur non trouvé' });
    }
    
    res.json({ success: true, data: user });
});

// Obtenir les conversations d'un utilisateur
app.get('/api/conversations', async (req, res) => {
    const sessionId = req.headers['x-session-id'];
    
    if (!sessionId) {
        return res.status(401).json({ success: false, message: 'Non authentifié' });
    }
    
    const userId = getUserIdFromSession(sessionId);
    if (!userId) {
        return res.status(401).json({ success: false, message: 'Session invalide' });
    }
    
    try {
        // Récupérer les conversations où l'utilisateur participe
        const { data: participants, error: partError } = await supabase
            .from('conversation_participants')
            .select('conversation_id')
            .eq('user_id', userId);
        
        if (partError) throw partError;
        
        const conversations = [];
        
        for (const p of participants) {
            // Récupérer l'autre participant
            const { data: otherParticipant, error: otherError } = await supabase
                .from('conversation_participants')
                .select('users(id, username, avatar, color, status)')
                .eq('conversation_id', p.conversation_id)
                .neq('user_id', userId)
                .single();
            
            if (otherError) continue;
            
            // Récupérer le dernier message
            const { data: lastMessage, error: msgError } = await supabase
                .from('messages')
                .select('message, created_at')
                .eq('conversation_id', p.conversation_id)
                .order('created_at', { ascending: false })
                .limit(1);
            
            // Compter les messages non lus
            const { count, error: countError } = await supabase
                .from('messages')
                .select('*', { count: 'exact', head: true })
                .eq('conversation_id', p.conversation_id)
                .neq('user_id', userId)
                .eq('is_read', false);
            
            conversations.push({
                id: p.conversation_id,
                other_user_id: otherParticipant.users.id,
                other_username: otherParticipant.users.username,
                other_avatar: otherParticipant.users.avatar,
                other_color: otherParticipant.users.color,
                other_status: otherParticipant.users.status || 'offline',
                last_message: lastMessage?.[0]?.message || null,
                last_message_time: lastMessage?.[0]?.created_at || null,
                unread_count: count || 0
            });
        }
        
        // Trier par dernier message
        conversations.sort((a, b) => {
            const timeA = a.last_message_time ? new Date(a.last_message_time) : 0;
            const timeB = b.last_message_time ? new Date(b.last_message_time) : 0;
            return timeB - timeA;
        });
        
        res.json({ success: true, data: conversations });
        
    } catch (error) {
        console.error('Erreur conversations:', error);
        res.json({ success: true, data: [] });
    }
});

// Obtenir les messages d'une conversation
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
    
    try {
        const { data: messages, error } = await supabase
            .from('messages')
            .select(`
                *,
                users (username, avatar, color)
            `)
            .eq('conversation_id', parseInt(conversationId))
            .order('created_at', { ascending: true });
        
        if (error) throw error;
        
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
        
    } catch (error) {
        console.error('Erreur messages:', error);
        res.json({ success: true, data: [] });
    }
});

// Envoyer un message
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
    
    try {
        const { data: newMessage, error } = await supabase
            .from('messages')
            .insert({
                conversation_id: parseInt(conversationId),
                user_id: userId,
                message: message
            })
            .select()
            .single();
        
        if (error) throw error;
        
        // Mettre à jour le updated_at de la conversation
        await supabase
            .from('conversations')
            .update({ updated_at: new Date() })
            .eq('id', parseInt(conversationId));
        
        res.json({ success: true, data: newMessage });
        
    } catch (error) {
        console.error('Erreur envoi message:', error);
        res.status(500).json({ success: false, message: 'Erreur lors de l\'envoi' });
    }
});

// Créer une conversation
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
    
    try {
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
        
    } catch (error) {
        console.error('Erreur création conversation:', error);
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

// Rechercher des utilisateurs
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
    
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('id, username, email, avatar, color, status')
            .ilike('username', `%${q}%`)
            .neq('id', userId)
            .limit(20);
        
        if (error) throw error;
        
        res.json({ success: true, data: users || [] });
        
    } catch (error) {
        console.error('Erreur recherche:', error);
        res.json({ success: true, data: [] });
    }
});

// Obtenir tous les utilisateurs (sauf l'utilisateur courant)
app.get('/api/users', async (req, res) => {
    const sessionId = req.headers['x-session-id'];
    
    if (!sessionId) {
        return res.status(401).json({ success: false, message: 'Non authentifié' });
    }
    
    const userId = getUserIdFromSession(sessionId);
    if (!userId) {
        return res.status(401).json({ success: false, message: 'Session invalide' });
    }
    
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('id, username, email, avatar, color, status')
            .neq('id', userId)
            .order('username');
        
        if (error) throw error;
        
        res.json({ success: true, data: users || [] });
        
    } catch (error) {
        console.error('Erreur:', error);
        res.json({ success: true, data: [] });
    }
});

// Export pour Vercel
module.exports = app;