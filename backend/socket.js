const { getUserById, updateUserStatus, saveMessage, markMessagesAsRead } = require('./database');

let io;
const onlineUsers = new Map();

function initSocket(server) {
    io = require('socket.io')(server, {
        cors: { 
            origin: "*",
            methods: ["GET", "POST"],
            credentials: true
        },
        transports: ['websocket', 'polling']
    });
    
    io.use((socket, next) => {
        const userId = socket.handshake.auth.userId;
        if (!userId) {
            return next(new Error('Non authentifié'));
        }
        socket.userId = parseInt(userId);
        next();
    });
    
    io.on('connection', async (socket) => {
        console.log(` User ${socket.userId} connecté`);
        
        await updateUserStatus(socket.userId, 'online');
        onlineUsers.set(socket.userId, socket.id);
        
        io.emit('user_status_change', { userId: socket.userId, status: 'online' });
        
        socket.on('join_conversation', (conversationId) => {
            if (conversationId) {
                socket.join(`conv_${conversationId}`);
                console.log(`User ${socket.userId} joined conversation ${conversationId}`);
            }
        });
        
        socket.on('leave_conversation', (conversationId) => {
            if (conversationId) {
                socket.leave(`conv_${conversationId}`);
            }
        });
        
        socket.on('send_message', async (data) => {
            try {
                const { conversationId, message } = data;
                
                if (!conversationId || !message || message.trim() === '') {
                    socket.emit('message_error', { error: 'Message invalide' });
                    return;
                }
                
                const savedMessage = await saveMessage(conversationId, socket.userId, message.trim());
                
                io.to(`conv_${conversationId}`).emit('new_message', savedMessage);
                
            } catch (error) {
                console.error('Erreur send_message:', error);
                socket.emit('message_error', { error: 'Erreur lors de l\'envoi' });
            }
        });
        
        socket.on('typing', (data) => {
            const { conversationId, isTyping } = data;
            if (conversationId) {
                socket.to(`conv_${conversationId}`).emit('user_typing', {
                    userId: socket.userId,
                    conversationId,
                    isTyping
                });
            }
        });
        
        socket.on('mark_read', async (conversationId) => {
            if (conversationId) {
                await markMessagesAsRead(conversationId, socket.userId);
                io.to(`conv_${conversationId}`).emit('messages_read', { conversationId, userId: socket.userId });
            }
        });
        
        socket.on('disconnect', async () => {
            console.log(` User ${socket.userId} déconnecté`);
            onlineUsers.delete(socket.userId);
            await updateUserStatus(socket.userId, 'offline');
            io.emit('user_status_change', { userId: socket.userId, status: 'offline' });
        });
    });
    
    return io;
}

function isUserOnline(userId) {
    return onlineUsers.has(userId);
}

function getIo() {
    return io;
}

module.exports = { initSocket, isUserOnline, getIo };