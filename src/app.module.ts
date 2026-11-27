import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import configuration from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { IdempotencyModule } from './idempotency/idempotency.module';
import { PaymentProviderModule } from './payment-provider/payment-provider.module';
import { PaymentsModule } from './payments/payments.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: envValidationSchema,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const nodeEnv = config.get<string>('nodeEnv', 'development');
        const level = config.get<string>('logLevel', 'info');
        let usePretty = false;
        if (nodeEnv === 'development') {
          try {
            require.resolve('pino-pretty');
            usePretty = true;
          } catch {
            usePretty = false;
          }
        }
        return {
          pinoHttp: {
            level,
            redact: ['req.headers.authorization', 'req.headers.cookie'],
            transport: usePretty
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
          },
        };
      },
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('throttle.ttlMs', 60000),
          limit: config.get<number>('throttle.limit', 100),
        },
      ],
    }),
    DatabaseModule,
    RedisModule,
    PaymentProviderModule,
    IdempotencyModule,
    PaymentsModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
