import { Injectable } from '@nestjs/common';
import { detectContactLeaks } from '@logimatch/shared';
import { type AuthActor, isMemberOf } from '../common/actor';
import { forbidden, notFound, unprocessable } from '../common/errors';
import { type Db, InjectDb, Prisma } from '../infra/prisma';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class MessagingService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly notifications: NotificationsService,
  ) {}

  private sideOf(actor: AuthActor, c: { shipperCompanyId: string; carrierCompanyId: string }) {
    if (isMemberOf(actor, c.shipperCompanyId))
      return { side: 'SHIPPER' as const, companyId: c.shipperCompanyId };
    if (isMemberOf(actor, c.carrierCompanyId))
      return { side: 'CARRIER' as const, companyId: c.carrierCompanyId };
    throw forbidden('NOT_A_PARTY', 'Bu konuşmanın tarafı değilsiniz');
  }

  async list(actor: AuthActor) {
    const mine = actor.memberships.map((m) => m.companyId);
    const rows = await this.db.conversation.findMany({
      where: { OR: [{ shipperCompanyId: { in: mine } }, { carrierCompanyId: { in: mine } }] },
      orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      include: {
        match: {
          select: {
            id: true,
            status: true,
            load: { select: { referenceNo: true, pickupCity: true, deliveryCity: true } },
          },
        },
        shipment: { select: { id: true, referenceNo: true, status: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      take: 100,
    });
    const unread = await this.db.message.groupBy({
      by: ['conversationId'],
      where: {
        conversationId: { in: rows.map((r) => r.id) },
        readAt: null,
        senderCompanyId: { notIn: mine },
      },
      _count: true,
    });
    return rows.map((r) => ({
      ...r,
      lastMessage: r.messages[0] ?? null,
      messages: undefined,
      unread: unread.find((u) => u.conversationId === r.id)?._count ?? 0,
      contactRevealed: r.contextType === 'SHIPMENT',
    }));
  }

  async messages(actor: AuthActor, conversationId: string, q: { cursor?: string; limit: number }) {
    const c = await this.db.conversation.findUnique({ where: { id: conversationId } });
    if (!c) throw notFound('Conversation', conversationId);
    const { companyId } =
      actor.isStaff &&
      !isMemberOf(actor, c.shipperCompanyId) &&
      !isMemberOf(actor, c.carrierCompanyId)
        ? { companyId: null }
        : this.sideOf(actor, c);
    const rows = await this.db.message.findMany({
      where: { conversationId },
      orderBy: { id: 'desc' },
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      include: { sender: { select: { id: true, fullName: true } } },
    });
    if (companyId) {
      await this.db.message.updateMany({
        where: { conversationId, readAt: null, senderCompanyId: { not: companyId } },
        data: { readAt: new Date() },
      });
    }
    const hasMore = rows.length > q.limit;
    const items = (hasMore ? rows.slice(0, q.limit) : rows).map((m) => ({
      ...m,
      // Anlaşma öncesi gönderen adı da maskelenir.
      sender:
        c.contextType === 'SHIPMENT' || m.senderCompanyId === companyId
          ? m.sender
          : { id: m.sender.id, fullName: null },
      bodyOriginal: actor.isStaff ? m.bodyOriginal : undefined,
      mine: m.senderCompanyId === companyId,
    }));
    return {
      items,
      nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null,
      contactRevealed: c.contextType === 'SHIPMENT',
    };
  }

  /**
   * Mesaj gönder. Eşleşme bağlamında (anlaşma öncesi) iletişim bilgisi tespit edilirse
   * maskelenir, işaretlenir ve admin kuyruğuna düşer (#17).
   */
  async send(actor: AuthActor, conversationId: string, body: string) {
    const c = await this.db.conversation.findUnique({
      where: { id: conversationId },
      include: {
        match: {
          include: { truckPosting: { include: { vehicle: true, trailer: true, driver: true } } },
        },
      },
    });
    if (!c) throw notFound('Conversation', conversationId);
    const { side, companyId } = this.sideOf(actor, c);
    if (c.contextType === 'MATCH' && c.match && !['MUTUAL'].includes(c.match.status)) {
      const hasShipment = await this.db.shipment.count({ where: { matchId: c.match.id } });
      if (!hasShipment) throw unprocessable('CONVERSATION_CLOSED', 'Bu eşleşme kapandı');
    }

    let stored = body;
    let flagged = false;
    let findings: string[] = [];
    if (c.contextType === 'MATCH') {
      const me = await this.db.company.findUniqueOrThrow({ where: { id: companyId } });
      const identityTerms = [me.legalName, me.tradeName ?? '', me.phone ?? '', me.email ?? ''];
      if (side === 'CARRIER' && c.match) {
        const p = c.match.truckPosting;
        identityTerms.push(p.vehicle.plate, p.trailer.plate, p.driver.fullName);
      }
      const r = detectContactLeaks(body, { identityTerms });
      if (r.hasLeak) {
        stored = r.masked;
        flagged = true;
        findings = [...new Set(r.findings.map((f) => f.type))];
      }
    }

    const msg = await this.db.$transaction(async (tx) => {
      const m = await tx.message.create({
        data: {
          conversationId,
          senderUserId: actor.userId,
          senderCompanyId: companyId,
          body: stored,
          bodyOriginal: flagged ? body : null,
          contactMasked: stored !== body,
          flagged,
        },
      });
      await tx.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: m.createdAt },
      });
      if (flagged) {
        await tx.riskFlag.create({
          data: {
            type: 'CONTACT_LEAK',
            entityType: 'Message',
            entityId: m.id,
            companyId,
            details: { conversationId, findings } as Prisma.InputJsonValue,
          },
        });
      }
      return m;
    });

    if (flagged)
      await this.notifications.notifyUsers(null, [actor.userId], 'CONTACT_LEAK_WARNING', {
        conversationId,
      });
    const other = side === 'SHIPPER' ? c.carrierCompanyId : c.shipperCompanyId;
    await this.notifications.notifyCompany(
      null,
      other,
      'MESSAGE_RECEIVED',
      { conversationId },
      { dedupKey: `msg:${conversationId}` },
    );
    return {
      ...msg,
      bodyOriginal: undefined,
      warning: flagged ? 'CONTACT_INFO_MASKED' : null,
      findings,
    };
  }
}
