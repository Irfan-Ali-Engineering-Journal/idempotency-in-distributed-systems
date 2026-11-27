export interface AppConfig {
  port: number;
  nodeEnv: string;
  logLevel: string;
  databaseUrl: string;
  redis: {
    host: string;
    port: number;
    password?: string;
    keyPrefix: string;
    cacheTtlSeconds: number;
  };
  idempotency: {
    ttlSeconds: number;
    leaseDurationMs: number;
    maxKeyLength: number;
  };
  provider: {
    simulatedDelayMs: number;
  };
  throttle: {
    ttlMs: number;
    limit: number;
  };
}

export default (): AppConfig => ({
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  databaseUrl: process.env.DATABASE_URL || '',
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'idemp:',
    cacheTtlSeconds: parseInt(
      process.env.REDIS_CACHE_TTL_SECONDS || '3600',
      10,
    ),
  },
  idempotency: {
    ttlSeconds: parseInt(process.env.IDEMPOTENCY_TTL_SECONDS || '86400', 10),
    leaseDurationMs: parseInt(
      process.env.IDEMPOTENCY_LEASE_DURATION_MS || '30000',
      10,
    ),
    maxKeyLength: parseInt(process.env.IDEMPOTENCY_MAX_KEY_LENGTH || '255', 10),
  },
  provider: {
    simulatedDelayMs: parseInt(
      process.env.PAYMENT_SIMULATOR_DELAY_MS || '50',
      10,
    ),
  },
  throttle: {
    ttlMs: parseInt(process.env.THROTTLE_TTL_MS || '60000', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT || '100', 10),
  },
});
