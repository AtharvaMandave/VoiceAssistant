// ─── Express Application Entry Point ────────────────────────────────────────
// Sets up the Express server with all middleware, routes, and connections.
// Handles graceful shutdown of database and Redis connections.
// ─────────────────────────────────────────────────────────────────────────────

import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import { fileURLToPath } from "url";

import { env } from "./config/env.js";
import { connectDatabase, disconnectDatabase } from "./config/db.js";
import { connectRedis, disconnectRedis } from "./config/redis.js";
import { initializeFirebase } from "./config/firebase.js";
import { requestIdMiddleware } from "./middleware/requestId.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFoundHandler } from "./middleware/notFound.js";
import apiRouter from "./routes/index.js";
import { initializeWebSocketServer, shutdownWebSocketServer } from "./realtime/wsServer.js";
import { additionalSecurityHeaders, apiRateLimiter } from "./middleware/security.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Create Express App ──────────────────────────────────────────────────

const app = express();

// ─── Global Middleware ───────────────────────────────────────────────────

// Security headers (relaxed for widget iframe embedding)
app.use(
  helmet({
    contentSecurityPolicy: false,  // Widget iframe needs flexible CSP
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

// CORS — allow dashboard + any embedding site for widget endpoints
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (server-to-server, curl, etc.)
      if (!origin) return callback(null, true);
      // In dev, allow all origins
      if (env.NODE_ENV === "development") return callback(null, true);
      // In production, widget endpoints validate origin themselves via allowedDomains.
      // Dashboard origins should be configured here.
      const dashboardOrigins = ["http://localhost:5173", "http://localhost:3000"];
      if (dashboardOrigins.includes(origin)) return callback(null, true);
      // Allow through — widget controller will validate per-agent
      return callback(null, true);
    },
    credentials: true,
  })
);

// Additional security headers (MIME sniffing, clickjacking, referrer policy)
app.use(additionalSecurityHeaders);

// Body parsing
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Request tracing
app.use(requestIdMiddleware);

// Global API rate limiting (200 req/min per user)
app.use("/api", apiRateLimiter);

// Request logging (development)
if (env.NODE_ENV === "development") {
  app.use((req, _res, next) => {
    console.log(`[${req.requestId}] ${req.method} ${req.originalUrl}`);
    next();
  });
}

// ─── Static Widget Files ─────────────────────────────────────────────────
// Serve the embeddable widget script and iframe HTML
const widgetPublicDir = path.resolve(__dirname, "../../widget/public");
app.use("/widget", express.static(widgetPublicDir, {
  maxAge: env.NODE_ENV === "production" ? "1h" : 0,
  setHeaders: (res) => {
    // Widget assets must be loadable from any origin
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  },
}));

// ─── Routes ──────────────────────────────────────────────────────────────

app.use("/api", apiRouter);

// ─── Error Handling ──────────────────────────────────────────────────────

app.use(notFoundHandler);
app.use(errorHandler);

// ─── Start Server ────────────────────────────────────────────────────────

async function start(): Promise<void> {
  try {
    // Connect to data stores — in development, warn but don't crash if unavailable
    try {
      await connectDatabase();
    } catch (dbError) {
      if (env.NODE_ENV === "development") {
        console.warn("⚠️  MongoDB unavailable — start Docker with: docker compose up -d");
      } else {
        throw dbError;
      }
    }

    try {
      await connectRedis();
    } catch (redisError) {
      if (env.NODE_ENV === "development") {
        console.warn("⚠️  Redis unavailable — start Docker with: docker compose up -d");
      } else {
        throw redisError;
      }
    }

    // Initialize Firebase Admin (or Dev Auth mode)
    await initializeFirebase();

    // Start HTTP server
    const server = app.listen(env.PORT_API, () => {
      console.log(`\n🚀 VoiceFlow API server running on port ${env.PORT_API}`);
      console.log(`   Environment: ${env.NODE_ENV}`);
      console.log(`   Health: http://localhost:${env.PORT_API}/api/health`);
      console.log(`   WebSocket: ws://localhost:${env.PORT_API}/ws/voice\n`);
    });

    // Attach WebSocket server for real-time voice streaming
    initializeWebSocketServer(server);

    // ─── Graceful Shutdown ─────────────────────────────────────────────
    const shutdown = async (signal: string) => {
      console.log(`\n${signal} received. Shutting down gracefully...`);
      server.close(async () => {
        await shutdownWebSocketServer();
        await disconnectDatabase();
        await disconnectRedis();
        console.log("Server closed.");
        process.exit(0);
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        console.error("Forced shutdown after timeout");
        process.exit(1);
      }, 10000);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

start();

export default app;
