/**
 * Queue Manager for managing waiting mobile-display frontend connections
 * and pending priority messages from Supabase Realtime
 */
class QueueManager {
  constructor() {
    // Array of waiting socket objects
    this.waitingQueue = [];
    // Queue of pending priority messages when no client is waiting
    this.pendingPriorityQueue = [];
  }

  /**
   * Add a socket to the waiting queue if not already present
   * @param {Object} socket Socket.IO socket instance
   * @returns {boolean} Whether socket was newly added
   */
  enqueue(socket) {
    if (!socket || !socket.id) return false;

    const exists = this.waitingQueue.some((s) => s.id === socket.id);
    if (!exists) {
      this.waitingQueue.push(socket);
      this.logQueue('ENQUEUE', socket.id);
      return true;
    }
    return false;
  }

  /**
   * Dequeue the earliest waiting socket (FIFO)
   * @returns {Object|null} Dequeued socket instance or null
   */
  dequeue() {
    if (this.waitingQueue.length === 0) return null;

    const socket = this.waitingQueue.shift();
    this.logQueue('DEQUEUE', socket.id);
    return socket;
  }

  /**
   * Remove a socket from queue by ID (e.g. on disconnect)
   * @param {string} socketId
   * @returns {boolean} Whether a socket was removed
   */
  remove(socketId) {
    const initialLength = this.waitingQueue.length;
    this.waitingQueue = this.waitingQueue.filter((s) => s.id !== socketId);
    if (this.waitingQueue.length !== initialLength) {
      this.logQueue('REMOVE_DISCONNECT', socketId);
      return true;
    }
    return false;
  }

  /**
   * Check if queue has waiting clients
   * @returns {boolean}
   */
  hasWaiting() {
    return this.waitingQueue.length > 0;
  }

  /**
   * Get list of waiting socket IDs
   * @returns {Array<string>}
   */
  getWaitingSocketIds() {
    return this.waitingQueue.map((s) => s.id);
  }

  /**
   * Log the current state of waiting mobile-display frontends whenever changed
   * @param {string} action Action type triggering the log
   * @param {string} targetSocketId Target socket ID affected
   */
  logQueue(action, targetSocketId) {
    const ids = this.getWaitingSocketIds();
    console.log(
      `📋 [Queue Update] Action: ${action} (${targetSocketId}) | Total Waiting: ${
        ids.length
      } | Queue: [ ${ids.length > 0 ? ids.join(', ') : 'EMPTY'} ]`
    );
  }

  // --- Priority Message Queue Handling ---

  /**
   * Buffer a new priority message when no clients are currently waiting
   * @param {Object} message
   */
  addPriorityMessage(message) {
    if (!message) return;
    this.pendingPriorityQueue.push(message);
    console.log(
      `📌 [Priority Buffer] Saved newest message for next available client | Text: "${message.Text}" | Pending in buffer: ${this.pendingPriorityQueue.length}`
    );
  }

  /**
   * Check if there are buffered priority messages waiting to be served
   * @returns {boolean}
   */
  hasPendingPriority() {
    return this.pendingPriorityQueue.length > 0;
  }

  /**
   * Shift the earliest buffered priority message (FIFO)
   * @returns {Object|null}
   */
  shiftPriorityMessage() {
    if (this.pendingPriorityQueue.length === 0) return null;
    const msg = this.pendingPriorityQueue.shift();
    console.log(
      `⚡ [Priority Buffer] Retrieved buffered message for dispatch | Text: "${msg.Text}" | Remaining in buffer: ${this.pendingPriorityQueue.length}`
    );
    return msg;
  }
}

module.exports = new QueueManager();
