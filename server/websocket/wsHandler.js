const WebSocket = require('ws');

let wss = null;

// Initialize WebSocket server
const initWebSocket = (server) => {
  wss = new WebSocket.Server({ server });

  wss.on('connection', (ws, req) => {
    console.log('New WebSocket connection established');

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connection',
      message: 'Connected to Incident Intelligence WebSocket',
      timestamp: new Date().toISOString()
    }));

    // Handle incoming messages
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        handleClientMessage(ws, data);
      } catch (error) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Invalid message format'
        }));
      }
    });

    // Handle client disconnect
    ws.on('close', () => {
      console.log('WebSocket connection closed');
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error('WebSocket error:', error.message);
    });

    // Heartbeat to keep connection alive
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });
  });

  // Heartbeat interval to detect dead connections
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(heartbeat);
  });

  console.log('WebSocket server initialized');
  return wss;
};

// Handle client messages
const handleClientMessage = (ws, data) => {
  switch (data.type) {
    case 'subscribe':
      // Handle subscription to specific channels/services
      ws.subscriptions = data.channels || ['all'];
      ws.send(JSON.stringify({
        type: 'subscribed',
        channels: ws.subscriptions,
        timestamp: new Date().toISOString()
      }));
      break;

    case 'ping':
      ws.send(JSON.stringify({
        type: 'pong',
        timestamp: new Date().toISOString()
      }));
      break;

    default:
      ws.send(JSON.stringify({
        type: 'unknown',
        message: `Unknown message type: ${data.type}`
      }));
  }
};

// Broadcast event to all connected clients
const broadcastEvent = (event) => {
  if (!wss) {
    console.warn('WebSocket server not initialized');
    return;
  }

  const message = JSON.stringify({
    type: 'event',
    data: event,
    timestamp: new Date().toISOString()
  });

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      // Check if client has subscriptions
      const subscriptions = client.subscriptions || ['all'];

      if (subscriptions.includes('all') || subscriptions.includes(event.service)) {
        client.send(message);
      }
    }
  });
};

// Broadcast incident update to all connected clients
const broadcastIncident = (incident, action = 'update') => {
  if (!wss) {
    console.warn('WebSocket server not initialized');
    return;
  }

  const message = JSON.stringify({
    type: 'incident',
    action,
    data: incident,
    timestamp: new Date().toISOString()
  });

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
};

// Get connection stats
const getConnectionStats = () => {
  if (!wss) return { connections: 0 };

  let connections = 0;
  wss.clients.forEach(() => connections++);

  return { connections };
};

module.exports = {
  initWebSocket,
  broadcastEvent,
  broadcastIncident,
  getConnectionStats
};
