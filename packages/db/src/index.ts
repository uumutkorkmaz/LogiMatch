import { PrismaClient } from '../generated/client';

export * from '../generated/client';

export interface CreatePrismaClientOptions {
  url?: string;
  log?: boolean;
}

export function createPrismaClient(options: CreatePrismaClientOptions = {}): PrismaClient {
  return new PrismaClient({
    ...(options.url ? { datasourceUrl: options.url } : {}),
    log: options.log ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });
}
