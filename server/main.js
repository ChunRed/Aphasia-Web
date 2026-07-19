const express = require('express');
const http = require('http');
const path = require('path');
const next = require('next');
const socketIo = require('socket.io');

// Determine if running in dev mode or serving production build
const dev = process.env.NODE_ENV !== 'production';

// Path pointing to the mobile-display Next.js frontend directory
const displayDir = path.join(__dirname, 'mobile-display');

// Initialize Next.js app with mobile-display directory
const nextApp = next({ dev, dir: displayDir });
const handle = nextApp.getRequestHandler();

const PORT = process.env.PORT || 3000;

nextApp
  .prepare()
  .then(() => {
    const app = express();
    const server = http.createServer(app);
    const io = socketIo(server);

    // Express middleware
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Socket.IO event handling
    io.on('connection', (socket) => {
      const rawIp =
        socket.handshake.headers['x-forwarded-for']?.split(',')[0] ||
        socket.handshake.address ||
        socket.request.connection.remoteAddress ||
        'Unknown IP';

      // Clean IPv6 prefix if present (e.g. ::ffff:127.0.0.1 -> 127.0.0.1)
      const clientIp = rawIp.replace(/^.*:/, '') || rawIp;
      const activeConnections = Object.keys(io.sockets.sockets).length;

      console.log(
        `⚡ [Socket.IO] Client connected | IP: ${clientIp} | ID: ${socket.id} | Active Connections: ${activeConnections}`
      );

      socket.on('disconnect', (reason) => {
        const remainingConnections = Object.keys(io.sockets.sockets).length;
        console.log(
          `❌ [Socket.IO] Client disconnected | IP: ${clientIp} | ID: ${socket.id} | Reason: ${reason} | Remaining Connections: ${remainingConnections}`
        );
      });
    });

    // Node Server Health Check API
    app.get('/api/health', (req, res) => {
      res.json({
        status: 'ok',
        message: 'Aphasia-Web Mobile Display Server & Socket.IO is running',
        mode: dev ? 'development' : 'production (build)',
        timestamp: new Date().toISOString(),
      });
    });

    // Delegate all page and asset requests to Next.js handler
    app.use((req, res) => {
      return handle(req, res);
    });

    server.listen(PORT, (err) => {
      if (err) throw err;
      console.log(`> 🚀 Server ready on http://localhost:${PORT}`);
      console.log(`> 🎨 Rendering mobile-display (${dev ? 'dev' : 'production build'}) from: ${displayDir}`);
    });
  })
  .catch((err) => {
    console.error('Error starting server:', err);
    process.exit(1);
  });
