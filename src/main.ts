import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { GlobalHttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  const logger = app.get(Logger);
  app.useLogger(logger);
  app.enableShutdownHooks();
  app.enableCors();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.useGlobalFilters(new GlobalHttpExceptionFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Idempotent Payment API')
    .setDescription(
      'Production-style demonstration of Idempotency in Distributed Systems using NestJS, PostgreSQL, and Redis.\n\n' +
        '**Export / Import:** Download the OpenAPI spec as [JSON](/api/docs-json) or [YAML](/api/docs-yaml) to import directly into Postman, Insomnia, or Bruno.',
    )
    .setVersion('1.0.0')
    .setExternalDoc(
      'OpenAPI JSON (Postman / Insomnia Import)',
      '/api/docs-json',
    )
    .addTag('Health', 'Liveness and readiness probes')
    .addTag('Idempotency', 'Idempotency record status inspection')
    .addTag('Payments', 'Idempotent payment processing endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'Idempotent Payment API - Swagger Docs',
    jsonDocumentUrl: 'api/docs-json',
    yamlDocumentUrl: 'api/docs-yaml',
    swaggerOptions: {
      tryItOutEnabled: true,
      displayRequestDuration: true,
      docExpansion: 'none',
      defaultModelsExpandDepth: 0,
      defaultModelExpandDepth: 1,
      filter: true,
      persistAuthorization: true,
    },
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('port', 3000);

  await app.listen(port, '0.0.0.0');
  logger.log(`Application listening on port ${port}`);
  logger.log(
    `Swagger documentation available at http://localhost:${port}/api/docs`,
  );
}

void bootstrap();
