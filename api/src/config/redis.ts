// ─── Redis Client ───────────────────────────────────────────────────────────
// Creates and exports a shared ioredis client instance.
// Used for rate limiting, BullMQ queues, and ephemeral session state.
// ─────────────────────────────────────────────────────────────────────────────

import Redis from "ioredis";
import { env } from "./env.js";

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 10) {
          console.error("❌ Redis max retries exceeded");
          return null; // stop retrying
        }
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });

    redisClient.on("connect", () => {
      console.log("✅ Redis connected");
    });

    redisClient.on("error", (err) => {
      console.error("Redis error:", err.message);
    });
  }

  return redisClient;
}

export async function connectRedis(): Promise<void> {
  const client = getRedisClient();
  // Timeout after 5 seconds if Redis is unavailable
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Redis connection timeout")), 5000)
  );
  await Promise.race([client.connect(), timeout]);
}

export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    console.log("Redis disconnected gracefully");
  }
}

export async function isRedisConnected(): Promise<boolean> {
  try {
    if (!redisClient) return false;
    const result = await redisClient.ping();
    return result === "PONG";
  } catch {
    return false;
  }
}
