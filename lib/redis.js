const { Redis } = require("@upstash/redis");

const url = String(process.env.UPSTASH_REDIS_REST_URL || "").trim();
const token = String(process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();

const redisConfigured = !!(url && token);

if (!redisConfigured) {
  console.warn("[Redis] Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN. Falling back to in-memory sessions.");
}

const redis = redisConfigured ? new Redis({ url, token }) : null;

module.exports = { redis, redisConfigured };
