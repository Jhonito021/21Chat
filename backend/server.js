const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const http = require('http');
const socketIo = require('socket.io');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Configuration Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'mon_secret_jwt_pour_chatapp_2024';

// Middleware d'authentification
const authenticateToken = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Non autorisé' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token invalide' });
  }
};

// Routes API

// Inscription
app.post('/api/signup', async (req, res) => {
  const { username, email, password } = req.body;
  
  try {
    // Vérifier si l'utilisateur existe déjà
    const { data: existing, error: checkError } = await supabase
      .from('users')
      .select('id')
      .or(`email.eq.${email},username.eq.${username}`);
    
    if (existing && existing.length > 0) {
      return res.status(400).json({ error: 'Email ou nom d\'utilisateur déjà utilisé' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = crypto.randomUUID();
    
    const { data: user, error: insertError } = await supabase
      .from('users')
      .insert([{ 
        id: userId, 
        username, 
        email, 
        password: hashedPassword, 
        is_online: true 
      }])
      .select();
    
    if (insertError) throw insertError;
    
    const token = jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '7d' });
    
    res.json({ 
      success: true, 
      user: { id: userId, username, email },
      token 
    });
  } catch (error) {
    console.error('Erreur signup:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Connexion
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  
  try {
    const { data: users, error: findError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email);
    
    if (findError || !users || users.length === 0) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }
    
    const user = users[0];
    const validPassword = await bcrypt.compare(password, user.password);
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }
    
    // Mettre à jour le statut en ligne
    await supabase
      .from('users')
      .update({ is_online: true, last_seen: new Date() })
      .eq('id', user.id);
    
    const token = jwt.sign({ userId: user.id, email }, JWT_SECRET, { expiresIn: '7d' });
    
    res.json({
      success: true,
      user: { id: user.id, username: user.username, email: user.email },
      token
    });
  } catch (error) {
    console.error('Erreur login:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer l'utilisateur courant
app.get('/api/me', authenticateToken, async (req, res) => {
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('id, username, email, is_online, last_seen')
      .eq('id', req.userId);
    
    if (error || !users || users.length === 0) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    
    res.json(users[0]);
  } catch (error) {
    console.error('Erreur get me:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer les utilisateurs
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('id, username, email, is_online, last_seen')
      .neq('id', req.userId)
      .order('is_online', { ascending: false })
      .order('username', { ascending: true });
    
    if (error) throw error;
    res.json(users);
  } catch (error) {
    console.error('Erreur get users:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer les messages
app.get('/api/messages/:userId', authenticateToken, async (req, res) => {
  const otherUserId = req.params.userId;
  
  try {
    const { data: messages, error } = await supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${req.userId},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${req.userId})`)
      .order('created_at', { ascending: true });
    
    if (error) throw error;
    res.json(messages);
  } catch (error) {
    console.error('Erreur get messages:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Envoyer un message
app.post('/api/messages', authenticateToken, async (req, res) => {
  const { receiver_id, message } = req.body;
  
  try {
    const { data: newMessage, error } = await supabase
      .from('messages')
      .insert([{ 
        sender_id: req.userId, 
        receiver_id, 
        message,
        created_at: new Date()
      }])
      .select()
      .single();
    
    if (error) throw error;
    
    io.to(receiver_id).emit('new_message', newMessage);
    
    res.json({ success: true, id: newMessage.id });
  } catch (error) {
    console.error('Erreur send message:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Marquer les messages comme lus
app.post('/api/messages/read/:userId', authenticateToken, async (req, res) => {
  const otherUserId = req.params.userId;
  
  try {
    const { error } = await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('sender_id', otherUserId)
      .eq('receiver_id', req.userId)
      .eq('is_read', false);
    
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur mark read:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Déconnexion
app.post('/api/logout', authenticateToken, async (req, res) => {
  try {
    await supabase
      .from('users')
      .update({ is_online: false, last_seen: new Date() })
      .eq('id', req.userId);
    
    res.json({ success: true });
  } catch (error) {
    res.json({ success: true });
  }
});

// Socket.IO - reste identique
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.userId = decoded.userId;
      next();
    } catch(e) {
      next(new Error('Authentication error'));
    }
  } else {
    next(new Error('Authentication error'));
  }
});

io.on('connection', (socket) => {
  console.log('🔌 Utilisateur connecté:', socket.userId);
  
  socket.join(socket.userId);
  
  socket.on('typing', (data) => {
    socket.to(data.receiver_id).emit('user_typing', {
      sender_id: socket.userId,
      is_typing: data.is_typing
    });
  });
  
  socket.on('disconnect', async () => {
    console.log('🔌 Utilisateur déconnecté:', socket.userId);
    if (socket.userId) {
      try {
        await supabase
          .from('users')
          .update({ is_online: false, last_seen: new Date() })
          .eq('id', socket.userId);
      } catch(e) {}
    }
  });
});

// Démarrer le serveur
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Serveur Supabase démarré sur http://localhost:${PORT}`);
});