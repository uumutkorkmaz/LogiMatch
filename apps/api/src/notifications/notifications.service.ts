import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { CompanyRole } from '@logimatch/shared';
import type { Redis } from 'ioredis';
import { type Db, type DbOrTx, InjectDb, Prisma } from '../infra/prisma';
import { InjectRedis } from '../infra/redis';
import { MailService } from '../integrations/mail.service';
import { type ISmsProvider, SMS } from '../integrations/ports';
import { JobRegistry } from '../queue/job-registry';
import { OutboxService } from '../queue/outbox.service';
import { render, TEMPLATES } from './templates';

export interface NotifyOptions {
  /** Aynı kullanıcıya aynı olay için 5 dk içinde tekrar gönderme (#29). */
  dedupKey?: string;
  /** Varsayılan: IN_APP (+ şablon email:true ise EMAIL). */
  channels?: ('IN_APP' | 'EMAIL' | 'SMS')[];
}

const DEDUP_TTL_SEC = 300;

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger('Notifications');

  constructor(
    @InjectDb() private readonly db: Db,
    @InjectRedis() private readonly redis: Redis,
    private readonly outbox: OutboxService,
    private readonly registry: JobRegistry,
    private readonly mail: MailService,
    @Inject(SMS) private readonly sms: ISmsProvider,
  ) {}

  onModuleInit(): void {
    this.registry.register('notification.send', (p) => this.deliver(p.notificationId));
  }

  async notifyUsers(
    tx: DbOrTx | null,
    userIds: string[],
    template: string,
    payload: Record<string, unknown>,
    opts: NotifyOptions = {},
  ): Promise<void> {
    const db = tx ?? this.db;
    const channels =
      opts.channels ?? (TEMPLATES[template]?.email ? ['IN_APP', 'EMAIL'] : ['IN_APP']);
    for (const userId of [...new Set(userIds)]) {
      if (opts.dedupKey) {
        const ok = await this.redis.set(
          `notif:dedup:${userId}:${opts.dedupKey}`,
          '1',
          'EX',
          DEDUP_TTL_SEC,
          'NX',
        );
        if (ok !== 'OK') continue;
      }
      for (const channel of channels) {
        const n = await db.notification.create({
          data: {
            userId,
            channel,
            template,
            payload: payload as Prisma.InputJsonValue,
            dedupKey: opts.dedupKey ?? null,
            status: channel === 'IN_APP' ? 'SENT' : 'QUEUED',
            sentAt: channel === 'IN_APP' ? new Date() : null,
          },
        });
        if (channel !== 'IN_APP')
          await this.outbox.emit(db, 'notification.send', { notificationId: n.id });
      }
    }
  }

  /** Firmanın (isteğe bağlı rol filtresiyle) tüm aktif üyelerine. */
  async notifyCompany(
    tx: DbOrTx | null,
    companyId: string,
    template: string,
    payload: Record<string, unknown>,
    opts: NotifyOptions & { roles?: CompanyRole[] } = {},
  ): Promise<void> {
    const db = tx ?? this.db;
    const members = await db.companyMember.findMany({
      where: { companyId, ...(opts.roles ? { companyRole: { in: opts.roles } } : {}) },
      select: { userId: true },
    });
    await this.notifyUsers(
      tx,
      members.map((m) => m.userId),
      template,
      payload,
      {
        ...opts,
        dedupKey: opts.dedupKey,
      },
    );
  }

  async notifyStaff(tx: DbOrTx | null, template: string, payload: Record<string, unknown>) {
    const db = tx ?? this.db;
    const staff = await db.user.findMany({
      where: { role: { in: ['ADMIN', 'OPS'] } },
      select: { id: true },
    });
    await this.notifyUsers(
      tx,
      staff.map((u) => u.id),
      template,
      payload,
      { channels: ['IN_APP'] },
    );
  }

  /** Kuyruk işleyicisi: e-posta/SMS gönderir. Hata fırlatırsa BullMQ yeniden dener (#28). */
  async deliver(notificationId: string): Promise<void> {
    const n = await this.db.notification.findUnique({
      where: { id: notificationId },
      include: { user: true },
    });
    if (!n || n.status === 'SENT' || n.status === 'DEAD') return;
    const { title, body } = render(n.template, n.user.locale, n.payload as Record<string, unknown>);
    try {
      if (n.channel === 'EMAIL') await this.mail.send(n.user.email, title, body);
      else if (n.channel === 'SMS' && n.user.phone)
        await this.sms.send(n.user.phone, `${title}: ${body}`);
      await this.db.notification.update({
        where: { id: n.id },
        data: { status: 'SENT', sentAt: new Date(), attempts: { increment: 1 } },
      });
    } catch (err) {
      await this.db.notification.update({
        where: { id: n.id },
        data: { status: 'FAILED', attempts: { increment: 1 }, lastError: String(err) },
      });
      this.logger.warn({ err, notificationId }, 'delivery failed');
      throw err;
    }
  }

  list(userId: string, q: { cursor?: string; limit: number; unreadOnly?: boolean }) {
    return this.db.notification.findMany({
      where: { userId, channel: 'IN_APP', ...(q.unreadOnly ? { readAt: null } : {}) },
      orderBy: { id: 'desc' },
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
  }

  async unreadCount(userId: string): Promise<number> {
    return this.db.notification.count({ where: { userId, channel: 'IN_APP', readAt: null } });
  }

  async markRead(userId: string, id: string): Promise<void> {
    await this.db.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.db.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
