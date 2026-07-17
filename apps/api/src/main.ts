import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import type { Env } from './config/env';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService<Env, true>);

  app.setGlobalPrefix('api');
  app.use(cookieParser());
  // The global exception filter is registered via APP_FILTER in AppModule so it can
  // inject ErrorLogService (see app.module.ts).
  // Request validation is done per-route via ZodValidationPipe against the shared
  // schemas (single source of truth with the web app) — no class-validator needed.

  app.enableCors({
    origin: config.get('CORS_ORIGIN', { infer: true }).split(',').map((s) => s.trim()),
    credentials: true,
  });

  app.enableShutdownHooks();

  const port = config.get('API_PORT', { infer: true });
  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(`API listening on http://0.0.0.0:${port}/api`);
}

void bootstrap();
