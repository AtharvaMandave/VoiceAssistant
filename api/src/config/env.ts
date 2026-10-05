// ─── Environment Configuration ──────────────────────────────────────────────
// Validates all required environment variables at startup using Zod.
// The app fails fast if any required config is missing or invalid.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });

const envSchema = z.object({
  // Server
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT_API: z.coerce.number().default(3001),

  // MongoDB
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),

  // Redis
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),

  // Firebase & Auth
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_SERVICE_ACCOUNT_KEY: z.string().optional(),
  DEV_AUTH_BYPASS: z
    .string()
    .transform((val) => val === "true" || val === "1")
    .optional()
    .default("true"),

  // AI Server
  AI_SERVER_URL: z.string().url().default("http://127.0.0.1:8000"),

  // LLM Provider API Keys (Optional - falls back to intelligent mock engine)
  GROQ_API_KEY: z
    .string()
    .optional()
    .transform((val) => val || process.env.GROQ_API || ""),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),

  // Logging
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("debug"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  console.error(parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
export type Env = z.infer<typeof envSchema>;
