const express = require('express');
const http = require('http');
const path = require('path');
const next = require('next');
const socketIo = require('socket.io');

const config = require('./config');
const supabaseService = require('./supabaseService');
const queueManager = require('./queueManager');

const dev = process.env.NODE_ENV !== 'production';
const displayDir = path.join(__dirname, 'mobile-display');

const nextApp = next({ dev, dir: displayDir });
const handle = nextApp.getRequestHandler();

const PORT = process.env.PORT || 3000;

// Local cache for top N Supabase messages
let cachedTopMessages = [];

/**
 * Refresh top messages cache from Supabase
 */
async function refreshTopMessages() {
  const messages = await supabaseService.fetchTopMessages(config.TOP_N_COUNT);
  if (messages && messages.length > 0) {
    cachedTopMessages = messages;
  }
  return cachedTopMessages;
}

nextApp
  .prepare()
  .then(async () => {
    const app = express();
    const server = http.createServer(app);
    const io = socketIo(server);

    // Initial fetch of top messages from Supabase
    console.log(`🔍 [Supabase] Fetching initial top ${config.TOP_N_COUNT} records...`);
    await refreshTopMessages();
    console.log(`✅ [Supabase] Loaded ${cachedTopMessages.length} records into cache.`);

    // Express middleware
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    /**
     * Send a display message to a target socket client
     */
    async function sendDisplayMessage(socket, customMessage = null, forcePriority = false) {
      if (!socket || !socket.connected) return;

      let messageToSend = customMessage;
      let isPriority = forcePriority;

      if (!messageToSend) {
        // 1. Check if there are buffered priority messages waiting to be served!
        if (queueManager.hasPendingPriority()) {
          messageToSend = queueManager.shiftPriorityMessage();
          isPriority = true;
        } else {
          // 2. Otherwise pick a random message from top N cache
          if (cachedTopMessages.length === 0) {
            await refreshTopMessages();
          }
          messageToSend = supabaseService.getRandomMessage(cachedTopMessages);
        }
      }

      const payload = {
        id: messageToSend.id || Date.now(),
        Text: messageToSend.Text || '無文字內容',
        durationSec: config.DISPLAY_DURATION_SEC,
        isPriority: isPriority,
        timestamp: new Date().toISOString(),
      };

      socket.emit(config.SOCKET_EVENTS.DISPLAY_MESSAGE, payload);

      const clientIp =
        socket.handshake.headers['x-forwarded-for']?.split(',')[0] ||
        socket.handshake.address ||
        'Unknown';

      if (isPriority) {
        console.log(
          `⚡ [Priority Dispatch] Sent NEWEST Supabase message to client | Socket ID: ${socket.id} | IP: ${clientIp} | Text: "${payload.Text}"`
        );
      } else {
        console.log(
          `📤 [Display Message] Sent random top message to client | Socket ID: ${socket.id} | IP: ${clientIp} | Text: "${payload.Text}"`
        );
      }
    }

    // Subscribe to Supabase Realtime INSERT events (Special Priority Event)
    supabaseService.subscribeToNewMessages(async (newRecord) => {
      // Refresh top N cache with new record
      await refreshTopMessages();

      // Check if any mobile-display frontend is currently waiting in queue
      if (queueManager.hasWaiting()) {
        const prioritySocket = queueManager.dequeue();
        if (prioritySocket) {
          await sendDisplayMessage(prioritySocket, newRecord, true);
        }
      } else {
        // Save to pending priority buffer so next ready client receives it
        queueManager.addPriorityMessage(newRecord);
      }
    });

    // Socket.IO event handling
    io.on('connection', (socket) => {
      const rawIp =
        socket.handshake.headers['x-forwarded-for']?.split(',')[0] ||
        socket.handshake.address ||
        socket.request.connection.remoteAddress ||
        'Unknown IP';
      const clientIp = rawIp.replace(/^.*:/, '') || rawIp;

      console.log(
        `⚡ [Socket.IO] Client connected | IP: ${clientIp} | Socket ID: ${socket.id}`
      );

      // Serve initial message immediately upon connection (priority if buffered, else random)
      sendDisplayMessage(socket, null, false);

      // Client signals that its 40-second countdown is done and asks for next message
      socket.on(config.SOCKET_EVENTS.REQUEST_NEXT, async () => {
        console.log(`🙋‍♂️ [Socket.IO] Client ${socket.id} requested next message. Queueing...`);
        
        // Add to queue
        queueManager.enqueue(socket);

        // Process queue immediately: if this client is at front of queue, dequeue & send message
        const nextWaitingSocket = queueManager.dequeue();
        if (nextWaitingSocket) {
          await sendDisplayMessage(nextWaitingSocket, null, false);
        }
      });

      socket.on('disconnect', (reason) => {
        // Remove from waiting queue if disconnected
        queueManager.remove(socket.id);
        console.log(
          `❌ [Socket.IO] Client disconnected | Socket ID: ${socket.id} | Reason: ${reason}`
        );
      });
    });

    // Server Health API
    app.get('/api/health', (req, res) => {
      res.json({
        status: 'ok',
        topNCount: config.TOP_N_COUNT,
        displayDurationSec: config.DISPLAY_DURATION_SEC,
        waitingQueueLength: queueManager.getWaitingSocketIds().length,
        waitingQueue: queueManager.getWaitingSocketIds(),
        hasPendingPriority: queueManager.hasPendingPriority(),
        cachedMessagesCount: cachedTopMessages.length,
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
      console.log(
        `> ⚙️ Config: TOP_N=${config.TOP_N_COUNT} | DURATION=${config.DISPLAY_DURATION_SEC}s | TABLE=${config.SUPABASE_TABLE_NAME}`
      );
    });
  })
  .catch((err) => {
    console.error('Error starting server:', err);
    process.exit(1);
  });
