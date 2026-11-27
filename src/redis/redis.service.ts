import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;
  private readonly keyPrefix: string;
  private readonly defaultTtlSeconds: number;
  private isConnected = false;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('redis.host', 'localhost');
    const port = this.configService.get<number>('redis.port', 6379);
    const password = this.configService.get<string>('redis.password');
    this.keyPrefix = this.configService.get<string>(
      'redis.keyPrefix',
      'idemp:',
    );
    this.defaultTtlSeconds = this.configService.get<number>(
      'redis.cacheTtlSeconds',
      3600,
    );

    this.client = new Redis({
      host,
      port,
      password: password || undefined,
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      commandTimeout: 1500,
      enableOfflineQueue: false,
      retryStrategy: (times: number) => Math.min(times * 500, 5000),
      lazyConnect: true,
    });

    this.client.on('connect', () => {
      this.isConnected = true;
      this.logger.log(`Connected to Redis at ${host}:${port}`);
    });

    this.client.on('ready', () => {
      this.isConnected = true;
    });

    this.client.on('error', (err: Error) => {
      this.isConnected = false;
      this.logger.warn(
        `Redis connection error (falling back to PostgreSQL): ${err.message}`,
      );
    });

    this.client.on('close', () => {
      this.isConnected = false;
    });

    // Initiate non-blocking connection; app must still boot if Redis is temporarily down
    this.client.connect().catch((err: Error) => {
      this.logger.warn(
        `Initial Redis connection failed (continuing with PostgreSQL): ${err.message}`,
      );
    });
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.client.quit();
      this.logger.log('Disconnected from Redis');
    } catch {
      this.client.disconnect();
    }
  }

  private buildKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  async getJson<T>(key: string): Promise<T | null> {
    if (!this.isConnected) {
      this.logger.warn(
        `Redis unavailable on GET for key "${key}"; falling back to PostgreSQL`,
      );
      return null;
    }

    try {
      const raw = await this.client.get(this.buildKey(key));
      if (!raw) {
        return null;
      }
      return JSON.parse(raw) as T;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(
        `Redis GET failed for key "${key}" (falling back to PostgreSQL): ${msg}`,
      );
      return null;
    }
  }

  async setJson<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    if (!this.isConnected) {
      this.logger.warn(
        `Redis unavailable on SET for key "${key}"; skipping cache write`,
      );
      return;
    }

    const ttl = ttlSeconds ?? this.defaultTtlSeconds;
    try {
      await this.client.set(
        this.buildKey(key),
        JSON.stringify(value),
        'EX',
        ttl,
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Redis SET failed for key "${key}": ${msg}`);
    }
  }

  async del(key: string): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      await this.client.del(this.buildKey(key));
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Redis DEL failed for key "${key}": ${msg}`);
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const pong = await this.client.ping();
      return pong === 'PONG';
    } catch {
      return false;
    }
  }
}
