import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { loadEnv } from './config/env';
import { WorkerRunner } from './queue/worker-runner';

async function main(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableCors({ origin: env.CORS_ORIGINS, credentials: true, exposedHeaders: ['X-Request-Id'] });
  app.set('trust proxy', 1);
  configureApp(app, { swagger: true });
  await app.listen(env.API_PORT, '0.0.0.0');
  // Tek süreçli kurulum (dev / küçük deploy): worker işleri API içinde.
  if (env.WORKER_IN_API) await app.get(WorkerRunner).start();
}

void main();
