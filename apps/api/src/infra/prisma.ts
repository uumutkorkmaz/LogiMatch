import { Global, Inject, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import { createPrismaClient, Prisma } from '@logimatch/db';
import { ENV, type Env } from '../config/env';
import { mapPersistenceError } from '../common/errors';

/** deletedAt kolonu olan modeller: varsayılan sorgular silinmişleri görmez (#18). */
const SOFT_DELETE_MODELS = new Set([
  'User',
  'Company',
  'Document',
  'Vehicle',
  'Trailer',
  'Driver',
  'Load',
  'TruckPosting',
]);

type WhereArgs = { where?: Record<string, unknown> };

function withNotDeleted<T extends WhereArgs>(model: string, args: T): T {
  if (!SOFT_DELETE_MODELS.has(model)) return args;
  const where = args.where ?? {};
  // Çağıran deletedAt'i açıkça belirttiyse (ör. admin), dokunma.
  if ('deletedAt' in where) return args;
  return { ...args, where: { ...where, deletedAt: null } };
}

export function createDb(url?: string) {
  return createPrismaClient({ url }).$extends({
    name: 'soft-delete',
    query: {
      $allModels: {
        findMany({ model, args, query }) {
          return query(withNotDeleted(model, args as WhereArgs));
        },
        findFirst({ model, args, query }) {
          return query(withNotDeleted(model, args as WhereArgs));
        },
        findFirstOrThrow({ model, args, query }) {
          return query(withNotDeleted(model, args as WhereArgs));
        },
        findUnique({ model, args, query }) {
          return query(withNotDeleted(model, args as WhereArgs) as typeof args);
        },
        findUniqueOrThrow({ model, args, query }) {
          return query(withNotDeleted(model, args as WhereArgs) as typeof args);
        },
        count({ model, args, query }) {
          return query(withNotDeleted(model, args as WhereArgs));
        },
      },
    },
  });
}

export type Db = ReturnType<typeof createDb>;
export type Tx = Parameters<Parameters<Db['$transaction']>[0]>[0];
export type DbOrTx = Db | Tx;

export const DB = Symbol('DB');
export const InjectDb = () => Inject(DB);

@Injectable()
class DbLifecycle implements OnModuleDestroy {
  constructor(@InjectDb() private readonly db: Db) {}
  async onModuleDestroy(): Promise<void> {
    await this.db.$disconnect();
  }
}

@Global()
@Module({
  providers: [
    { provide: DB, inject: [ENV], useFactory: (env: Env) => createDb(env.DATABASE_URL) },
    DbLifecycle,
  ],
  exports: [DB],
})
export class DbModule {}

/**
 * SERIALIZABLE transaction; serialization hatasında bir kez yeniden dener,
 * sonra 409 CONCURRENT_UPDATE fırlatır (DOMAIN §8).
 */
export async function serializable<T>(db: Db, fn: (tx: Tx) => Promise<T>, retries = 1): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 15_000,
        maxWait: 5_000,
      });
    } catch (err) {
      const mapped = mapPersistenceError(err);
      if (mapped?.code === 'CONCURRENT_UPDATE' && attempt < retries) continue;
      throw mapped ?? err;
    }
  }
}

export { Prisma };
