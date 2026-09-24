/**
 * Domain hataları framework'ten bağımsızdır; HTTP'ye ProblemFilter çevirir (RFC 7807).
 * `code` makine okunur ve web tarafında i18n anahtarı olarak kullanılır.
 */
export class DomainError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export const badRequest = (code: string, message: string, details?: Record<string, unknown>) =>
  new DomainError(400, code, message, details);
export const unauthorized = (code = 'UNAUTHORIZED', message = 'Kimlik doğrulama gerekli') =>
  new DomainError(401, code, message);
export const forbidden = (code = 'FORBIDDEN', message = 'Bu işlem için yetkiniz yok') =>
  new DomainError(403, code, message);
export const notFound = (entity: string, id?: string) =>
  new DomainError(404, `${entity.toUpperCase()}_NOT_FOUND`, `${entity} bulunamadı`, { id });
export const conflict = (code: string, message: string, details?: Record<string, unknown>) =>
  new DomainError(409, code, message, details);
export const unprocessable = (code: string, message: string, details?: Record<string, unknown>) =>
  new DomainError(422, code, message, details);
export const unavailable = (code: string, message: string) => new DomainError(503, code, message);

/** Prisma / Postgres hata kodlarını anlamlı domain hatalarına çevirir. */
export function mapPersistenceError(err: unknown): DomainError | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as { code?: string; meta?: Record<string, unknown>; message?: string };
  const msg = e.message ?? '';
  if (e.code === 'P2002')
    return conflict('UNIQUE_VIOLATION', 'Kayıt zaten mevcut', { target: e.meta?.target });
  if (e.code === 'P2025') return new DomainError(404, 'NOT_FOUND', 'Kayıt bulunamadı');
  if (
    e.code === 'P2034' ||
    msg.includes('40001') ||
    msg.includes('could not serialize') ||
    msg.includes('40P01') ||
    msg.includes('deadlock detected')
  )
    return conflict('CONCURRENT_UPDATE', 'Eşzamanlı güncelleme; lütfen tekrar deneyin');
  if (msg.includes('23P01') || msg.includes('conflicting key value violates exclusion constraint'))
    return conflict(
      'ASSIGNMENT_OVERLAP',
      'Araç, dorse veya şoför bu tarih aralığında başka bir sevkiyata atanmış',
    );
  if (msg.includes('is append-only'))
    return conflict('APPEND_ONLY', 'Bu kayıt değiştirilemez veya silinemez');
  return null;
}
