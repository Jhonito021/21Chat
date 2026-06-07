const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_change_me';

function generateToken(userId) {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}

function verifyToken(token) {
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        return decoded.userId;
    } catch (error) {
        console.error('Token verification error:', error.message);
        return null;
    }
}

function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ 
            success: false, 
            message: 'Token manquant ou invalide' 
        });
    }
    
    const token = authHeader.split(' ')[1];
    const userId = verifyToken(token);
    
    if (!userId) {
        return res.status(401).json({ 
            success: false, 
            message: 'Token invalide ou expiré' 
        });
    }
    
    req.userId = userId;
    next();
}

module.exports = {
    generateToken,
    verifyToken,
    authMiddleware
};