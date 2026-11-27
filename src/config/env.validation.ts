import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent')
    .default('info'),

  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .required(),

  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),
  REDIS_KEY_PREFIX: Joi.string().default('idemp:'),
  REDIS_CACHE_TTL_SECONDS: Joi.number().integer().min(1).default(3600),

  IDEMPOTENCY_TTL_SECONDS: Joi.number().integer().min(1).default(86400),
  IDEMPOTENCY_LEASE_DURATION_MS: Joi.number().integer().min(500).default(30000),
  IDEMPOTENCY_MAX_KEY_LENGTH: Joi.number()
    .integer()
    .min(16)
    .max(255)
    .default(255),

  PAYMENT_SIMULATOR_DELAY_MS: Joi.number().integer().min(0).default(50),

  THROTTLE_TTL_MS: Joi.number().integer().min(1000).default(60000),
  THROTTLE_LIMIT: Joi.number().integer().min(1).default(100),
});
