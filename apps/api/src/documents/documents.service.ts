import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { DocumentMetaInput, DocumentOwnerType } from '@logimatch/shared';
import { transition, documentMachine } from '@logimatch/shared';
import { type AuthActor, assertCompanyPermission, isMemberOf } from '../common/actor';
import { badRequest, forbidden, notFound } from '../common/errors';
import { audit } from '../common/interceptors';
import { type Db, type DbOrTx, InjectDb } from '../infra/prisma';
import { FILE_STORAGE, type IFileStorage } from '../integrations/ports';
import { NotificationsService } from '../notifications/notifications.service';
import { JobRegistry } from '../queue/job-registry';
import { OutboxService } from '../queue/outbox.service';
import { computeCompliance, type Rule } from './compliance';

const ALLOWED_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const DAY = 86_400_000;
const WARN_DAYS = [15, 7, 1];

export interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

@Injectable()
export class DocumentsService implements OnModuleInit {
  private readonly logger = new Logger('Documents');

  constructor(
    @InjectDb() private readonly db: Db,
    @Inject(FILE_STORAGE) private readonly storage: IFileStorage,
    private readonly notifications: NotificationsService,
    private readonly outbox: OutboxService,
    private readonly registry: JobRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register('document.expiry-scan', () => this.expiryScan().then(() => undefined));
  }

  /** Sahibin hangi firmaya ait olduğunu bulur (erişim kontrolü için). */
  async ownerCompanyId(ownerType: DocumentOwnerType, ownerId: string): Promise<string> {
    const find = async (): Promise<string | null | undefined> => {
      switch (ownerType) {
        case 'COMPANY':
          return (
            await this.db.company.findUnique({ where: { id: ownerId }, select: { id: true } })
          )?.id;
        case 'VEHICLE':
          return (await this.db.vehicle.findUnique({ where: { id: ownerId } }))?.carrierCompanyId;
        case 'TRAILER':
          return (await this.db.trailer.findUnique({ where: { id: ownerId } }))?.carrierCompanyId;
        case 'DRIVER':
          return (await this.db.driver.findUnique({ where: { id: ownerId } }))?.carrierCompanyId;
        case 'SHIPMENT':
          return (await this.db.shipment.findUnique({ where: { id: ownerId } }))?.carrierCompanyId;
      }
    };
    const id = await find();
    if (!id) throw notFound(ownerType.toLowerCase(), ownerId);
    return id;
  }

  async upload(
    actor: AuthActor,
    ownerType: DocumentOwnerType,
    ownerId: string,
    meta: DocumentMetaInput,
    file: UploadedFile | undefined,
    opts: { autoApprove?: boolean; companyId?: string } = {},
  ) {
    if (!file) throw badRequest('FILE_REQUIRED', 'Dosya gerekli (multipart alan adı: file)');
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw badRequest('FILE_TYPE_NOT_ALLOWED', 'Yalnızca PDF, JPEG, PNG veya WEBP yüklenebilir');
    }
    if (meta.expiresAt && meta.expiresAt.getTime() <= Date.now() && !opts.autoApprove) {
      throw badRequest('DOCUMENT_ALREADY_EXPIRED', 'Süresi dolmuş belge yüklenemez');
    }
    const companyId = opts.companyId ?? (await this.ownerCompanyId(ownerType, ownerId));
    if (ownerType !== 'SHIPMENT') assertCompanyPermission(actor, companyId, 'fleet:write');

    const ext = extname(file.originalname).toLowerCase().slice(0, 6) || '.bin';
    const now = new Date();
    const key = `documents/${companyId}/${now.getUTCFullYear()}/${randomUUID()}${ext}`;
    const stored = await this.storage.put(key, file.buffer, file.mimetype);

    const doc = await this.db.document.create({
      data: {
        ownerType,
        ownerId,
        companyId,
        type: meta.type,
        fileKey: stored.key,
        fileName: file.originalname.slice(0, 200),
        mimeType: file.mimetype,
        sizeBytes: stored.sizeBytes,
        checksumSha256: stored.checksumSha256,
        number: meta.number ?? null,
        issuedAt: meta.issuedAt ?? null,
        expiresAt: meta.expiresAt ?? null,
        uploadedById: actor.userId,
        status: opts.autoApprove ? 'APPROVED' : 'PENDING',
        reviewedAt: opts.autoApprove ? now : null,
      },
    });
    // İlk belge yüklenince firma doğrulama kuyruğuna girer.
    await this.db.company.updateMany({
      where: { id: companyId, verificationStatus: 'UNVERIFIED' },
      data: { verificationStatus: 'PENDING' },
    });
    return this.withUrl(doc);
  }

  withUrl<T extends { fileKey: string }>(doc: T): T & { url: string } {
    return { ...doc, url: this.storage.signedUrl(doc.fileKey) };
  }

  async list(actor: AuthActor, ownerType: DocumentOwnerType, ownerId: string) {
    const companyId = await this.ownerCompanyId(ownerType, ownerId);
    if (!actor.isStaff && !isMemberOf(actor, companyId)) throw forbidden();
    const docs = await this.db.document.findMany({
      where: { ownerType, ownerId },
      orderBy: { createdAt: 'desc' },
    });
    return docs.map((d) => this.withUrl(d));
  }

  async approve(actor: AuthActor, id: string, expiresAt?: Date) {
    const doc = await this.db.document.findUnique({ where: { id } });
    if (!doc) throw notFound('Document', id);
    transition(documentMachine, doc.status, 'APPROVE', 'OPS');
    const updated = await this.db.document.update({
      where: { id },
      data: {
        status: 'APPROVED',
        reviewedById: actor.userId,
        reviewedAt: new Date(),
        ...(expiresAt ? { expiresAt } : {}),
      },
    });
    await audit(this.db, actor, 'document.approve', 'Document', id, doc, updated);
    await this.recomputeOwner(this.db, doc.ownerType, doc.ownerId);
    await this.notifications.notifyCompany(null, doc.companyId, 'DOCUMENT_APPROVED', {
      type: doc.type,
    });
    return updated;
  }

  async reject(actor: AuthActor, id: string, reason: string) {
    const doc = await this.db.document.findUnique({ where: { id } });
    if (!doc) throw notFound('Document', id);
    transition(documentMachine, doc.status, 'REJECT', 'OPS');
    const updated = await this.db.document.update({
      where: { id },
      data: {
        status: 'REJECTED',
        reviewedById: actor.userId,
        reviewedAt: new Date(),
        rejectionReason: reason,
      },
    });
    await audit(this.db, actor, 'document.reject', 'Document', id, doc, updated);
    await this.notifications.notifyCompany(null, doc.companyId, 'DOCUMENT_REJECTED', {
      type: doc.type,
      reason,
    });
    return updated;
  }

  private async rules(tx: DbOrTx): Promise<Rule[]> {
    return tx.requiredDocumentRule.findMany({ where: { active: true } });
  }

  /**
   * Uyumluluk önbelleğini (complianceValidUntil vb.) yeniden hesaplar ve etkilenen aktif
   * araç ilanları için eşleştirmeyi yeniden tetikler (ARCHITECTURE §7.3).
   */
  async recomputeOwner(tx: DbOrTx, ownerType: DocumentOwnerType, ownerId: string): Promise<void> {
    if (ownerType === 'SHIPMENT') return;
    const [rules, docs] = await Promise.all([
      this.rules(tx),
      tx.document.findMany({
        where: { ownerType, ownerId },
        select: { type: true, status: true, expiresAt: true },
      }),
    ]);
    const now = new Date();
    let postings: { id: string }[] = [];
    switch (ownerType) {
      case 'COMPANY': {
        const r = computeCompliance('COMPANY', rules, docs, now);
        await tx.company.update({ where: { id: ownerId }, data: r });
        postings = await tx.truckPosting.findMany({
          where: { carrierCompanyId: ownerId, status: 'ACTIVE' },
        });
        break;
      }
      case 'VEHICLE': {
        const r = computeCompliance('VEHICLE', rules, docs, now);
        await tx.vehicle.update({ where: { id: ownerId }, data: r });
        postings = await tx.truckPosting.findMany({
          where: { vehicleId: ownerId, status: 'ACTIVE' },
        });
        break;
      }
      case 'TRAILER': {
        const t = await tx.trailer.findUniqueOrThrow({ where: { id: ownerId } });
        const r = computeCompliance('TRAILER', rules, docs, now, { trailerType: t.trailerType });
        await tx.trailer.update({ where: { id: ownerId }, data: r });
        postings = await tx.truckPosting.findMany({
          where: { trailerId: ownerId, status: 'ACTIVE' },
        });
        break;
      }
      case 'DRIVER': {
        const r = computeCompliance('DRIVER', rules, docs, now);
        await tx.driver.update({ where: { id: ownerId }, data: r });
        postings = await tx.truckPosting.findMany({
          where: { driverId: ownerId, status: 'ACTIVE' },
        });
        break;
      }
    }
    for (const p of postings)
      await this.outbox.emit(tx, 'match.recompute', { entity: 'posting', id: p.id });
  }

  /**
   * Günlük tarama (#7): 15/7/1 gün kala uyarı; süresi dolan belge EXPIRED, sahibi araç/dorse/şoför
   * artık uyumlu değilse INACTIVE.
   */
  async expiryScan(now = new Date()): Promise<{ warned: number; expired: number }> {
    let warned = 0;
    for (const days of WARN_DAYS) {
      const from = new Date(now.getTime() + (days - 1) * DAY);
      const to = new Date(now.getTime() + days * DAY);
      const docs = await this.db.document.findMany({
        where: { status: 'APPROVED', expiresAt: { gt: from, lte: to } },
      });
      for (const d of docs) {
        await this.notifications.notifyCompany(
          null,
          d.companyId,
          'DOCUMENT_EXPIRING',
          { type: d.type, days, documentId: d.id },
          { dedupKey: `doc-expiry:${d.id}:${days}`, roles: ['OWNER', 'MANAGER', 'DISPATCHER'] },
        );
        warned++;
      }
    }

    const expired = await this.db.document.findMany({
      where: { status: { in: ['APPROVED', 'PENDING'] }, expiresAt: { lte: now } },
    });
    for (const d of expired) {
      await this.db.$transaction(async (tx) => {
        await tx.document.update({ where: { id: d.id }, data: { status: 'EXPIRED' } });
        await this.recomputeOwner(tx, d.ownerType, d.ownerId);
        await this.deactivateIfNonCompliant(tx, d.ownerType, d.ownerId, now);
      });
      await this.notifications.notifyCompany(
        null,
        d.companyId,
        'DOCUMENT_EXPIRED',
        { type: d.type },
        {
          dedupKey: `doc-expired:${d.id}`,
        },
      );
    }
    if (expired.length)
      this.logger.log({ expired: expired.length, warned }, 'document expiry scan');
    return { warned, expired: expired.length };
  }

  private async deactivateIfNonCompliant(
    tx: DbOrTx,
    ownerType: DocumentOwnerType,
    ownerId: string,
    now: Date,
  ) {
    const stale = { OR: [{ complianceValidUntil: null }, { complianceValidUntil: { lte: now } }] };
    if (ownerType === 'VEHICLE')
      await tx.vehicle.updateMany({
        where: { id: ownerId, ...stale },
        data: { status: 'INACTIVE' },
      });
    if (ownerType === 'TRAILER')
      await tx.trailer.updateMany({
        where: { id: ownerId, ...stale },
        data: { status: 'INACTIVE' },
      });
    if (ownerType === 'DRIVER')
      await tx.driver.updateMany({
        where: { id: ownerId, ...stale },
        data: { status: 'INACTIVE' },
      });
  }
}
