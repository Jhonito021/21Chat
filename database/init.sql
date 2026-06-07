-- ==================== CRÉATION DES TABLES ====================

-- Table users
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    avatar VARCHAR(50) DEFAULT 'user-circle',
    color VARCHAR(7) DEFAULT '#e94560',
    status VARCHAR(20) DEFAULT 'offline',
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table conversations
CREATE TABLE IF NOT EXISTS conversations (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table conversation_participants
CREATE TABLE IF NOT EXISTS conversation_participants (
    conversation_id INT REFERENCES conversations(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (conversation_id, user_id)
);

-- Table messages
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    conversation_id INT REFERENCES conversations(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==================== INDEX ====================

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_participants_user ON conversation_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- ==================== TRIGGER UPDATED_AT ====================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ==================== FONCTIONS ====================

-- Fonction pour obtenir les conversations d'un utilisateur
CREATE OR REPLACE FUNCTION get_user_conversations(user_id INT)
RETURNS TABLE(
    id INT,
    updated_at TIMESTAMPTZ,
    other_user_id INT,
    other_username VARCHAR,
    other_avatar VARCHAR,
    other_color VARCHAR,
    other_status VARCHAR,
    last_message TEXT,
    last_message_time TIMESTAMPTZ,
    unread_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.updated_at,
        u.id,
        u.username,
        u.avatar,
        u.color,
        u.status,
        (SELECT message FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1),
        (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1),
        (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND user_id != user_id AND is_read = FALSE)
    FROM conversations c
    JOIN conversation_participants cp1 ON c.id = cp1.conversation_id AND cp1.user_id = user_id
    JOIN conversation_participants cp2 ON c.id = cp2.conversation_id AND cp2.user_id != user_id
    JOIN users u ON cp2.user_id = u.id
    ORDER BY COALESCE(last_message_time, c.updated_at) DESC;
END;
$$ LANGUAGE plpgsql;

-- ==================== ROW LEVEL SECURITY ====================

-- Activer RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Politiques users
CREATE POLICY "Users can view all profiles" ON users
    FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON users
    FOR UPDATE USING (auth.uid()::text = id::text);

-- Politiques conversations
CREATE POLICY "Users can view their conversations" ON conversations
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM conversation_participants WHERE conversation_id = id AND user_id = auth.uid()::int)
    );

-- Politiques participants
CREATE POLICY "Users can view participants" ON conversation_participants
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = conversation_id AND cp.user_id = auth.uid()::int)
    );

-- Politiques messages
CREATE POLICY "Users can view their messages" ON messages
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM conversation_participants WHERE conversation_id = messages.conversation_id AND user_id = auth.uid()::int)
    );

CREATE POLICY "Users can insert messages" ON messages
    FOR INSERT WITH CHECK (auth.uid()::int = user_id);

CREATE POLICY "Users can update messages read status" ON messages
    FOR UPDATE USING (auth.uid()::int = user_id);