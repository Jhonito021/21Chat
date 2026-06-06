const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
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

// Configuration MySQL
const db = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'chatapp',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const promiseDb = db.promise();

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'mon_secret_jwt_pour_chatapp_2024';

// Initialisation de la base de données
async function initDatabase() {
  try {
    // Vérifier si la table users existe
    const [tables] = await promiseDb.query("SHOW TABLES LIKE 'users'");
    
    if (tables.length === 0) {
      const fs = require('fs');
      const sql = fs.readFileSync('./database.sql', 'utf8');
      const queries = sql.split(';').filter(q => q.trim());
      
      for (const query of queries) {
        if (query.trim()) {
          await promiseDb.query(query);
        }
      }
      console.log('✅ Base de données MySQL initialisée');
    } else {
      console.log('✅ Base de données MySQL déjà existante');
    }
  } catch (error) {
    console.error('Erreur initialisation DB:', error);
  }
}

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
    const [existing] = await promiseDb.query(
      'SELECT id FROM users WHERE email = ? OR username = ?',
      [email, username]
    );
    
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Email ou nom d\'utilisateur déjà utilisé' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = crypto.randomUUID();
    
    await promiseDb.query(
      'INSERT INTO users (id, username, email, password, is_online) VALUES (?, ?, ?, ?, ?)',
      [userId, username, email, hashedPassword, 1]
    );
    
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
    const [users] = await promiseDb.query(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );
    
    if (users.length === 0) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }
    
    const user = users[0];
    const validPassword = await bcrypt.compare(password, user.password);
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }
    
    await promiseDb.query(
      'UPDATE users SET is_online = 1, last_seen = NOW() WHERE id = ?',
      [user.id]
    );
    
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

// Récupérer les utilisateurs
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    const [users] = await promiseDb.query(
      'SELECT id, username, email, is_online, last_seen FROM users WHERE id != ? ORDER BY is_online DESC, username ASC',
      [req.userId]
    );
    
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
    const [messages] = await promiseDb.query(
      `SELECT * FROM messages 
       WHERE (sender_id = ? AND receiver_id = ?) 
          OR (sender_id = ? AND receiver_id = ?)
       ORDER BY created_at ASC`,
      [req.userId, otherUserId, otherUserId, req.userId]
    );
    
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
    const [result] = await promiseDb.query(
      'INSERT INTO messages (sender_id, receiver_id, message, created_at) VALUES (?, ?, ?, NOW())',
      [req.userId, receiver_id, message]
    );
    
    const [newMessage] = await promiseDb.query(
      'SELECT * FROM messages WHERE id = ?',
      [result.insertId]
    );
    
    io.to(receiver_id).emit('new_message', newMessage[0]);
    
    res.json({ success: true, id: result.insertId });
  } catch (error) {
    console.error('Erreur send message:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Déconnexion
app.post('/api/logout', authenticateToken, async (req, res) => {
  try {
    await promiseDb.query(
      'UPDATE users SET is_online = 0, last_seen = NOW() WHERE id = ?',
      [req.userId]
    );
    res.json({ success: true });
  } catch (error) {
    res.json({ success: true });
  }
});

// Socket.IO
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
  console.log('✅ Utilisateur connecté:', socket.userId);
  
  socket.join(socket.userId);
  
  socket.on('typing', (data) => {
    socket.to(data.receiver_id).emit('user_typing', {
      sender_id: socket.userId,
      is_typing: data.is_typing
    });
  });
  
  socket.on('disconnect', async () => {
    console.log('❌ Utilisateur déconnecté:', socket.userId);
    if (socket.userId) {
      try {
        await promiseDb.query(
          'UPDATE users SET is_online = 0, last_seen = NOW() WHERE id = ?',
          [socket.userId]
        );
      } catch(e) {}
    }
  });
});

// Démarrer le serveur
const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
  await initDatabase();
  console.log(`🚀 Serveur MySQL démarré sur http://localhost:${PORT}`);
});