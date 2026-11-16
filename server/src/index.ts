/**
 * OMI FRIENDS game server.
 * One Node.js process serves the built website AND the real-time Socket.IO game.
 */
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '../../shared/types';
import { config } from './config';
import { RoomManager, type Transport } from './rooms/RoomManager';
import { registerHandlers } from './sockets/registerHandlers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '../../client/dist');

const app = express();
if (config.trustProxy) app.set('trust proxy', 1);
app.disable('x-powered-by');

// Basic security headers
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

const httpServer = createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  // Same-origin requests are always allowed. Extra origins only when the
  // website is hosted somewhere else (see CLIENT_ORIGIN in .env.example).
  cors: config.clientOrigins.length ? { origin: config.clientOrigins, methods: ['GET', 'POST'] } : undefined,
  maxHttpBufferSize: 10_000, // game messages are tiny
  pingInterval: 20_000,
  pingTimeout: 20_000,
  allowRequest: (req, callback) => {
    // Reject cross-site WebSocket connections from unknown origins.
    const origin = req.headers.origin;
    if (!origin) return callback(null, true);
    const host = req.headers['x-forwarded-host'] ?? req.headers.host;
    let sameOrigin = false;
    try {
      sameOrigin = new URL(origin).host === host;
    } catch {
      sameOrigin = false;
    }
    const allowed = sameOrigin || config.clientOrigins.includes(origin) || !config.isProduction;
    callback(allowed ? null : 'Origin not allowed', allowed);
  },
});

const transport: Transport = {
  emit(socketId, event, ...args) {
    io.to(socketId).emit(event, ...args);
  },
  disconnect(socketId) {
    io.sockets.sockets.get(socketId)?.disconnect(true);
  },
};

const rooms = new RoomManager(transport, config.timings);
registerHandlers(io, rooms, config.trustProxy);

const cleanup = setInterval(() => rooms.cleanup(), 60_000);
cleanup.unref();

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, rooms: rooms.roomCount, uptime: Math.round(process.uptime()) });
});

// Serve the built React app (after `npm run build`).
if (existsSync(clientDist)) {
  app.use(
    express.static(clientDist, {
      index: false,
      setHeaders(res, filePath) {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else if (filePath.endsWith('sw.js') || filePath.endsWith('.webmanifest')) {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    }),
  );
  // Single-page app fallback: refreshing /room/ABC123 must load index.html.
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/socket.io') || path.extname(req.path)) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(clientDist, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res
      .type('text/plain')
      .send('OMI FRIENDS game server is running. In development open http://localhost:5173 (run "npm run dev").');
  });
}

httpServer.listen(config.port, () => {
  console.log(`🃏 OMI FRIENDS server listening on http://localhost:${config.port}`);
  if (!existsSync(clientDist)) console.log('   (client not built yet – run "npm run build" for production)');
});

function shutdown() {
  console.log('Shutting down…');
  io.close();
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
