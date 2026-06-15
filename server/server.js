const { PeerServer } = require('peer');

const PORT = process.env.PORT || 10000;

const server = PeerServer({
    port: PORT,
    path: '/peerjs',
    allow_discovery: true,
    concurrent_limit: 5000,
    alive_timeout: 300000,      // 5 minutes
    ws_ping_interval: 10000     // Ping toutes les 10 secondes
});

console.log(`Serveur PeerJS démarré`);
console.log(`Port: ${PORT}`);
console.log(`Path: /peerjs`);
console.log(`Prêt à recevoir des connexions`);