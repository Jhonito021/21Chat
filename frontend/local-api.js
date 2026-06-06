// local-api.js - Client API pour MySQL local
class LocalAPI {
    constructor() {
        this.baseUrl = 'http://localhost:3000/api';
        this.socket = null;
        this.token = localStorage.getItem('token');
        this.onNewMessage = null;
        this.onUserTyping = null;
        
        if (this.token) {
            this.initSocket();
        }
    }
    
    async signUp(email, password, username) {
        try {
            const response = await fetch(`${this.baseUrl}/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, username })
            });
            const data = await response.json();
            
            if (data.token) {
                this.token = data.token;
                localStorage.setItem('token', data.token);
                this.initSocket();
            }
            return data;
        } catch (error) {
            console.error('Erreur signup:', error);
            throw error;
        }
    }
    
    async signIn(email, password) {
        try {
            const response = await fetch(`${this.baseUrl}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await response.json();
            
            if (data.token) {
                this.token = data.token;
                localStorage.setItem('token', data.token);
                this.initSocket();
            }
            return data;
        } catch (error) {
            console.error('Erreur signin:', error);
            throw error;
        }
    }
    
    initSocket() {
        if (this.socket) {
            this.socket.disconnect();
        }
        
        this.socket = io('http://localhost:3000', {
            auth: { token: this.token }
        });
        
        this.socket.on('connect', () => {
            console.log('✅ Socket connecté');
        });
        
        this.socket.on('new_message', (message) => {
            if (this.onNewMessage) {
                this.onNewMessage(message);
            }
        });
        
        this.socket.on('user_typing', (data) => {
            if (this.onUserTyping) {
                this.onUserTyping(data);
            }
        });
        
        this.socket.on('disconnect', () => {
            console.log('❌ Socket déconnecté');
        });
    }
    
    async getUsers() {
        const response = await fetch(`${this.baseUrl}/users`, {
            headers: { 'Authorization': `Bearer ${this.token}` }
        });
        return response.json();
    }
    
    async getMessages(userId) {
        const response = await fetch(`${this.baseUrl}/messages/${userId}`, {
            headers: { 'Authorization': `Bearer ${this.token}` }
        });
        return response.json();
    }
    
    async sendMessage(receiverId, message) {
        const response = await fetch(`${this.baseUrl}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.token}`
            },
            body: JSON.stringify({ receiver_id: receiverId, message })
        });
        return response.json();
    }
    
    sendTyping(receiverId, isTyping) {
        if (this.socket) {
            this.socket.emit('typing', { receiver_id: receiverId, is_typing: isTyping });
        }
    }
    
    async logout() {
        try {
            await fetch(`${this.baseUrl}/logout`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
        } catch(e) {}
        
        if (this.socket) {
            this.socket.disconnect();
        }
        
        this.token = null;
        localStorage.removeItem('token');
    }
    
    isAuthenticated() {
        return !!this.token;
    }
}

// Initialiser l'API
window.api = new LocalAPI();