const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config();

// Création du pool de connexions
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'chat_nodejs',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

const promisePool = pool.promise();

// ==================== FONCTIONS UTILISATEURS ====================

async function createUser(username, email, password) {
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await promisePool.execute(
            'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
            [username, email, hashedPassword]
        );
        return result.insertId;
    } catch (error) {
        console.error('Erreur createUser:', error);
        throw error;
    }
}

async function getUserByEmail(email) {
    try {
        const [rows] = await promisePool.execute(
            'SELECT * FROM users WHERE email = ?',
            [email]
        );
        return rows[0];
    } catch (error) {
        console.error('Erreur getUserByEmail:', error);
        throw error;
    }
}

async function getUserById(id) {
    try {
        const [rows] = await promisePool.execute(
            'SELECT id, username, email, avatar, color, status, last_seen, created_at FROM users WHERE id = ?',
            [id]
        );
        return rows[0];
    } catch (error) {
        console.error('Erreur getUserById:', error);
        throw error;
    }
}

async function updateUserStatus(userId, status) {
    try {
        await promisePool.execute(
            'UPDATE users SET status = ?, last_seen = NOW() WHERE id = ?',
            [status, userId]
        );
    } catch (error) {
        console.error('Erreur updateUserStatus:', error);
        throw error;
    }
}

async function updateUserProfile(userId, data) {
    try {
        const updates = [];
        const values = [];
        
        if (data.username) {
            updates.push('username = ?');
            values.push(data.username);
        }
        if (data.avatar) {
            updates.push('avatar = ?');
            values.push(data.avatar);
        }
        if (data.color) {
            updates.push('color = ?');
            values.push(data.color);
        }
        
        if (updates.length > 0) {
            values.push(userId);
            await promisePool.execute(
                `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
                values
            );
        }
    } catch (error) {
        console.error('Erreur updateUserProfile:', error);
        throw error;
    }
}

async function searchUsers(search, currentUserId) {
    try {
        const [rows] = await promisePool.execute(
            `SELECT id, username, email, avatar, color, status 
             FROM users 
             WHERE (username LIKE ? OR email LIKE ?) AND id != ? 
             ORDER BY username ASC
             LIMIT 20`,
            [`%${search}%`, `%${search}%`, currentUserId]
        );
        return rows;
    } catch (error) {
        console.error('Erreur searchUsers:', error);
        throw error;
    }
}

async function getAllUsers(currentUserId) {
    try {
        const [rows] = await promisePool.execute(
            'SELECT id, username, email, avatar, color, status FROM users WHERE id != ? ORDER BY username ASC',
            [currentUserId]
        );
        return rows;
    } catch (error) {
        console.error('Erreur getAllUsers:', error);
        throw error;
    }
}

// ==================== FONCTIONS CONVERSATIONS ====================

async function createConversation(user1Id, user2Id) {
    const connection = await promisePool.getConnection();
    try {
        await connection.beginTransaction();
        
        const [existing] = await connection.execute(
            `SELECT c.id 
             FROM conversations c
             JOIN conversation_participants cp1 ON c.id = cp1.conversation_id AND cp1.user_id = ?
             JOIN conversation_participants cp2 ON c.id = cp2.conversation_id AND cp2.user_id = ?`,
            [user1Id, user2Id]
        );
        
        if (existing.length > 0) {
            await connection.commit();
            return existing[0].id;
        }
        
        const [convResult] = await connection.execute(
            'INSERT INTO conversations () VALUES ()'
        );
        const conversationId = convResult.insertId;
        
        await connection.execute(
            'INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?), (?, ?)',
            [conversationId, user1Id, conversationId, user2Id]
        );
        
        await connection.commit();
        return conversationId;
        
    } catch (error) {
        await connection.rollback();
        console.error('Erreur createConversation:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function getUserConversations(userId) {
    try {
        const [rows] = await promisePool.execute(
            `SELECT 
                c.id,
                c.updated_at,
                u.id as other_user_id,
                u.username as other_username,
                u.avatar as other_avatar,
                u.color as other_color,
                u.status as other_status,
                (SELECT message FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
                (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_time,
                (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND user_id != ? AND is_read = FALSE) as unread_count
             FROM conversations c
             JOIN conversation_participants cp1 ON c.id = cp1.conversation_id AND cp1.user_id = ?
             JOIN conversation_participants cp2 ON c.id = cp2.conversation_id AND cp2.user_id != ?
             JOIN users u ON cp2.user_id = u.id
             ORDER BY COALESCE(last_message_time, c.updated_at) DESC`,
            [userId, userId, userId]
        );
        return rows;
    } catch (error) {
        console.error('Erreur getUserConversations:', error);
        throw error;
    }
}

// ==================== FONCTIONS MESSAGES ====================

async function saveMessage(conversationId, userId, message) {
    try {
        console.log('💾 Sauvegarde message:', { conversationId, userId, message });
        
        const [result] = await promisePool.execute(
            'INSERT INTO messages (conversation_id, user_id, message, created_at) VALUES (?, ?, ?, NOW())',
            [conversationId, userId, message]
        );
        
        console.log(' Message inséré, ID:', result.insertId);
        
        await promisePool.execute(
            'UPDATE conversations SET updated_at = NOW() WHERE id = ?',
            [conversationId]
        );
        
        const [newMessage] = await promisePool.execute(
            `SELECT m.*, u.username, u.avatar, u.color 
             FROM messages m
             JOIN users u ON m.user_id = u.id
             WHERE m.id = ?`,
            [result.insertId]
        );
        
        return newMessage[0];
        
    } catch (error) {
        console.error(' Erreur saveMessage:', error);
        throw error;
    }
}

async function getMessages(conversationId) {
    try {
        const convId = parseInt(conversationId);
        if (isNaN(convId) || convId <= 0) {
            return [];
        }
        
        const [rows] = await promisePool.execute(
            `SELECT m.*, u.username, u.avatar, u.color 
             FROM messages m
             LEFT JOIN users u ON m.user_id = u.id
             WHERE m.conversation_id = ?
             ORDER BY m.created_at ASC`,
            [convId]
        );
        
        return rows;
        
    } catch (error) {
        console.error('Erreur getMessages:', error);
        throw error;
    }
}

async function markMessagesAsRead(conversationId, userId) {
    try {
        const [result] = await promisePool.execute(
            'UPDATE messages SET is_read = TRUE WHERE conversation_id = ? AND user_id != ? AND is_read = FALSE',
            [conversationId, userId]
        );
        return result.affectedRows;
    } catch (error) {
        console.error('Erreur markMessagesAsRead:', error);
        throw error;
    }
}

async function testConnection() {
    try {
        await promisePool.query('SELECT 1');
        console.log(' MySQL connecté');
        return true;
    } catch (error) {
        console.error(' MySQL erreur:', error.message);
        return false;
    }
}

module.exports = {
    createUser,
    getUserByEmail,
    getUserById,
    updateUserStatus,
    updateUserProfile,
    searchUsers,
    getAllUsers,
    createConversation,
    getUserConversations,
    saveMessage,
    getMessages,
    markMessagesAsRead,
    testConnection,
    promisePool
};