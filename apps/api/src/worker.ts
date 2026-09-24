import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { WorkerModule } from './app.module';
import { WorkerRunner } from './queue/worker-runner';

/** Ayrı worker süreci: `node dist/worker.js` (docker-compose.prod.yml'de `worker` servisi). */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  await app.get(WorkerRunner).start();
}

void main();
