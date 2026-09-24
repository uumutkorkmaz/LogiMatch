import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { Decimal, findCity, Money, type PricingEstimateInput, toDecimal } from '@logimatch/shared';
import PDFDocument from 'pdfkit';
import { type AuthActor, hasCompanyPermission } from '../common/actor';
import { forbidden, notFound, unprocessable } from '../common/errors';
import { nextReference } from '../common/reference';
import { type Db, type DbOrTx, InjectDb, Prisma } from '../infra/prisma';
import { type IRoutingProvider, ROUTING, RouteNotFoundError } from '../integrations/ports';
import { PlatformConfigService } from '../platform/platform-config.service';
import { computeCommission } from './domain/commission';
import { estimatePriceRange } from './domain/estimate';
import { computeSettlement, type LockedTerms, type Settlement } from './domain/settlement';
import type { InvoiceCalc } from './domain/tax';

type ShipmentRow = Prisma.ShipmentGetPayload<object>;

const require_ = createRequire(__filename);
const FONT_DIR = join(dirname(require_.resolve('dejavu-fonts-ttf/package.json')), 'ttf');

@Injectable()
export class PricingService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly config: PlatformConfigService,
    @Inject(ROUTING) private readonly routing: IRoutingProvider,
  ) {}

  /** POST /pricing/estimate — mesafe, öneri aralığı ve komisyon/KDV/tevkifat önizlemesi. */
  async estimate(input: PricingEstimateInput) {
    const toPoint = (p: PricingEstimateInput['origin']) => {
      if ('lat' in p) return p;
      const c = findCity(p.city, p.country);
      if (!c) throw unprocessable('GEOCODE_FAILED', `${p.city} bulunamadı`);
      return { lat: c.lat, lng: c.lng };
    };
    const points = [toPoint(input.origin), ...input.stops, toPoint(input.destination)];
    let distanceKm: number | null = null;
    let durationMin: number | null = null;
    try {
      const r = await this.routing.route(points);
      distanceKm = Math.round(r.distanceM / 100) / 10;
      durationMin = Math.round(r.durationS / 60);
    } catch (err) {
      if (!(err instanceof RouteNotFoundError)) throw err;
    }

    const cfg = await this.config.pricing();
    const cur = input.currency;
    let suggestedMin: Money | null = null;
    let suggestedMax: Money | null = null;
    if (distanceKm != null) {
      const range = estimatePriceRange(
        {
          distanceKm,
          trailerType: input.trailerType,
          weightKg: input.weightKg,
          isAdr: input.isAdr,
          requiresTempControl: input.requiresTempControl,
          international: input.transportScope === 'INTERNATIONAL',
        },
        cfg.bands,
      );
      const rate = await this.config.fxRate('TRY', cur);
      suggestedMin = range.min.convert(rate, cur);
      suggestedMax = range.max.convert(rate, cur);
    }

    const basis = input.amount
      ? Money.of(input.amount, cur)
      : suggestedMin && suggestedMax
        ? Money.of(suggestedMin.amount.plus(suggestedMax.amount).div(2), cur)
        : null;
    const preview = basis
      ? await this.preview(
          basis,
          input.transportScope === 'INTERNATIONAL',
          input.withholdingApplies,
        )
      : null;

    return {
      distanceKm,
      durationMin,
      routeStatus: distanceKm == null ? 'ROUTE_NOT_FOUND' : 'OK',
      currency: cur,
      suggestedMin: suggestedMin?.toString() ?? null,
      suggestedMax: suggestedMax?.toString() ?? null,
      basisAmount: basis?.toString() ?? null,
      ...preview,
    };
  }

  private async preview(basis: Money, international: boolean, withholdingApplies: boolean) {
    const cfg = await this.config.pricing();
    const terms = await this.lockTerms(this.db, basis, international, withholdingApplies);
    const s = computeSettlement(terms);
    return {
      commissionModel: cfg.commissionModel,
      commissionRate: cfg.commissionRate.toString(),
      commissionPreview: terms.shipperCommission.add(terms.carrierCommission).toString(),
      vat: s.transport!.vatAmount.toString(),
      withholding: s.transport!.withholdingAmount.toString(),
      carrierPayout: basis.subtract(terms.carrierCommission).toString(),
      shipperPays: s.shipper.total.toString(),
      carrierNet: s.carrier.net.toString(),
    };
  }

  /**
   * Kabul anında kilitlenecek mali şartlar (#26): komisyon, KDV, tevkifat oranı ve eşiği,
   * işlem para birimine çevrilmiş minimum komisyon.
   */
  async lockTerms(
    tx: DbOrTx,
    agreed: Money,
    international: boolean,
    withholdingApplies: boolean,
  ): Promise<LockedTerms & { pricingConfigId: string }> {
    const cfg = await this.config.pricing();
    const cur = agreed.currency;
    const tryToCur = await this.config.fxRate('TRY', cur, tx);
    const minCommission = cfg.minCommission
      ? Money.of(cfg.minCommission, 'TRY').convert(tryToCur, cur)
      : null;
    const c = computeCommission(agreed, cfg, minCommission);
    return {
      pricingConfigId: cfg.id,
      currency: cur,
      agreed,
      commissionModel: cfg.commissionModel,
      commissionRate: cfg.commissionRate,
      shipperCommission: c.shipperPart,
      carrierCommission: c.carrierPart,
      vatRate: cfg.vatRate,
      commissionVatRate: cfg.commissionVatRate,
      vatExempt: international,
      withholdingApplies,
      withholdingRatio: cfg.withholdingRatio,
      withholdingThreshold: Money.of(cfg.withholdingThresholdTry, 'TRY').convert(tryToCur, cur),
    };
  }

  /** Shipment satırından kilitli şartları yeniden kurar (config'e bakmaz). */
  termsFromShipment(s: ShipmentRow): LockedTerms {
    const cur = s.currency;
    return {
      currency: cur,
      agreed: Money.of(s.agreedAmount, cur),
      commissionModel: s.commissionModel,
      commissionRate: toDecimal(s.commissionRate),
      shipperCommission: Money.of(s.shipperCommissionAmount, cur),
      carrierCommission: Money.of(s.carrierCommissionAmount, cur),
      vatRate: toDecimal(s.vatRate),
      commissionVatRate: toDecimal(s.commissionVatRate),
      vatExempt: toDecimal(s.vatRate).isZero(),
      withholdingApplies: s.withholdingApplies,
      withholdingRatio: toDecimal(s.withholdingRatio),
      withholdingThreshold: Money.of(s.withholdingThreshold, cur),
    };
  }

  settlementOf(s: ShipmentRow): Settlement {
    const terms = this.termsFromShipment(s);
    const cur = terms.currency;
    // İptal bedeli = kademe cezası + boş km tazminatı; platform kilitli oranla pay alır.
    const feeTotal = s.cancellationFee
      ? Money.of(s.cancellationFee, cur).add(Money.of(s.deadheadCompensation ?? 0, cur))
      : null;
    const cancelled =
      s.status === 'CANCELLED' && feeTotal && !feeTotal.isZero() && s.cancellationFeePayer
        ? {
            fee: feeTotal,
            payer: s.cancellationFeePayer,
            platformCut: feeTotal.multiply(terms.commissionRate),
          }
        : null;
    if (s.status === 'CANCELLED' && !cancelled) {
      const zero = Money.zero(cur);
      return {
        currency: cur,
        kind: 'CANCELLED',
        transport: null,
        commission: [],
        cancellation: null,
        shipper: { toCarrier: zero, toTaxOffice: zero, toPlatform: zero, total: zero },
        carrier: { fromShipper: zero, toPlatform: zero, net: zero },
      };
    }
    return computeSettlement(terms, cancelled);
  }

  async settlement(actor: AuthActor, shipmentId: string) {
    const s = await this.db.shipment.findUnique({ where: { id: shipmentId } });
    if (!s) throw notFound('Shipment', shipmentId);
    const can =
      actor.isStaff ||
      hasCompanyPermission(actor, s.shipperCompanyId, 'finance:read') ||
      hasCompanyPermission(actor, s.carrierCompanyId, 'finance:read');
    if (!can) throw forbidden('FINANCE_ACCESS_REQUIRED', 'Mali bilgiler için yetkiniz yok');
    return {
      shipmentId: s.id,
      referenceNo: s.referenceNo,
      status: s.status,
      lockedFxRate: s.lockedFxRate.toString(),
      commissionModel: s.commissionModel,
      commissionRate: s.commissionRate.toString(),
      ...this.settlementOf(s),
    };
  }

  /**
   * Fatura taslakları (acente modeli): navlun carrier→shipper, komisyon platform→ödeyen,
   * iptalde ceza faturası. Yalnızca hesap + PDF; e-fatura entegrasyonu yok.
   */
  async createInvoiceDrafts(tx: DbOrTx, s: ShipmentRow): Promise<void> {
    const settlement = this.settlementOf(s);
    const make = async (
      kind: 'TRANSPORT' | 'COMMISSION' | 'CANCELLATION_FEE',
      calc: InvoiceCalc,
      issuer: { platform: true } | { companyId: string },
      recipientCompanyId: string,
      description: string,
    ) =>
      tx.invoice.create({
        data: {
          number: await nextReference(tx, 'INV'),
          shipmentId: s.id,
          kind,
          issuerIsPlatform: 'platform' in issuer,
          issuerCompanyId: 'companyId' in issuer ? issuer.companyId : null,
          recipientCompanyId,
          currency: s.currency,
          subtotal: calc.subtotal.toString(),
          vatRate: calc.vatRate.toString(),
          vatAmount: calc.vatAmount.toString(),
          withholdingRatio: calc.withholdingRatio.toString(),
          withholdingAmount: calc.withholdingAmount.toString(),
          total: calc.total.toString(),
          payableAmount: calc.payable.toString(),
          lines: [
            {
              description,
              quantity: 1,
              unitPrice: calc.subtotal.toString(),
              amount: calc.subtotal.toString(),
            },
          ],
        },
      });
    const partyId = (side: 'SHIPPER' | 'CARRIER') =>
      side === 'SHIPPER' ? s.shipperCompanyId : s.carrierCompanyId;

    if (settlement.transport) {
      await make(
        'TRANSPORT',
        settlement.transport,
        { companyId: s.carrierCompanyId },
        s.shipperCompanyId,
        `Navlun — ${s.referenceNo}`,
      );
    }
    if (settlement.cancellation) {
      const payer = settlement.cancellation.payer;
      const payee = payer === 'SHIPPER' ? 'CARRIER' : 'SHIPPER';
      await make(
        'CANCELLATION_FEE',
        settlement.cancellation.invoice,
        { companyId: partyId(payee) },
        partyId(payer),
        `İptal bedeli — ${s.referenceNo}`,
      );
    }
    for (const c of settlement.commission) {
      await make(
        'COMMISSION',
        c.invoice,
        { platform: true },
        partyId(c.payer),
        `Aracılık hizmet bedeli — ${s.referenceNo}`,
      );
    }
  }

  async invoicesFor(actor: AuthActor, shipmentId: string) {
    const s = await this.db.shipment.findUnique({ where: { id: shipmentId } });
    if (!s) throw notFound('Shipment', shipmentId);
    const mine = actor.memberships.map((m) => m.companyId);
    if (!actor.isStaff && !mine.includes(s.shipperCompanyId) && !mine.includes(s.carrierCompanyId))
      throw forbidden();
    const invoices = await this.db.invoice.findMany({
      where: { shipmentId },
      orderBy: { createdAt: 'asc' },
    });
    return actor.isStaff
      ? invoices
      : invoices.filter(
          (i) =>
            mine.includes(i.recipientCompanyId) ||
            (i.issuerCompanyId && mine.includes(i.issuerCompanyId)),
        );
  }

  /** Fatura taslağı PDF'i (Türkçe karakterler için DejaVu). */
  async invoicePdf(actor: AuthActor, invoiceId: string): Promise<Buffer> {
    const inv = await this.db.invoice.findUnique({
      where: { id: invoiceId },
      include: { shipment: true },
    });
    if (!inv) throw notFound('Invoice', invoiceId);
    const mine = actor.memberships.map((m) => m.companyId);
    if (
      !actor.isStaff &&
      !mine.includes(inv.recipientCompanyId) &&
      !(inv.issuerCompanyId && mine.includes(inv.issuerCompanyId))
    ) {
      throw forbidden();
    }
    const [issuer, recipient] = await Promise.all([
      inv.issuerCompanyId
        ? this.db.company.findUnique({ where: { id: inv.issuerCompanyId } })
        : null,
      this.db.company.findUnique({ where: { id: inv.recipientCompanyId } }),
    ]);
    const fmt = (v: Prisma.Decimal | Decimal) =>
      `${new Decimal(v.toString()).toFixed(2)} ${inv.currency}`;
    const pct = (v: Prisma.Decimal) =>
      `%${new Decimal(v.toString()).times(100).toDecimalPlaces(2).toString()}`;

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    doc.registerFont('regular', join(FONT_DIR, 'DejaVuSans.ttf'));
    doc.registerFont('bold', join(FONT_DIR, 'DejaVuSans-Bold.ttf'));
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) =>
      doc.on('end', () => resolve(Buffer.concat(chunks))),
    );

    const kindLabel = {
      TRANSPORT: 'Navlun Faturası',
      COMMISSION: 'Aracılık Hizmet Faturası',
      CANCELLATION_FEE: 'İptal Bedeli Faturası',
    }[inv.kind];
    doc.font('bold').fontSize(18).text(`${kindLabel} — TASLAK`);
    doc
      .font('regular')
      .fontSize(9)
      .fillColor('#b91c1c')
      .text('Bu belge bir fatura taslağıdır; resmî e-fatura değildir.')
      .fillColor('black');
    doc.moveDown();
    doc
      .fontSize(10)
      .text(`Taslak No: ${inv.number}`)
      .text(`Sevkiyat: ${inv.shipment.referenceNo}`)
      .text(`Tarih: ${inv.createdAt.toISOString().slice(0, 10)}`);
    doc.moveDown();
    const party = (title: string, c: typeof recipient, platform = false) => {
      doc.font('bold').text(title);
      doc.font('regular');
      if (platform) doc.text('LogiMatch Lojistik Teknolojileri A.Ş. (aracı)');
      else if (c)
        doc
          .text(c.legalName)
          .text(`${c.taxOffice} V.D. — ${c.taxNumber}`)
          .text(`${c.address}, ${c.district ?? ''} ${c.city}`);
      doc.moveDown(0.5);
    };
    party('Düzenleyen', issuer, inv.issuerIsPlatform);
    party('Alıcı', recipient);
    doc.moveDown();
    const lines = inv.lines as { description: string; amount: string }[];
    doc
      .font('bold')
      .text('Açıklama', 50, doc.y, { continued: true })
      .text('Tutar', { align: 'right' });
    doc.font('regular');
    for (const l of lines)
      doc
        .text(l.description, { continued: true })
        .text(`${l.amount} ${inv.currency}`, { align: 'right' });
    doc.moveDown();
    const row = (label: string, value: string, bold = false) =>
      doc
        .font(bold ? 'bold' : 'regular')
        .text(label, { continued: true })
        .text(value, { align: 'right' });
    row('Ara toplam', fmt(inv.subtotal));
    row(`KDV (${pct(inv.vatRate)})`, fmt(inv.vatAmount));
    row('Genel toplam', fmt(inv.total), true);
    if (!new Decimal(inv.withholdingAmount.toString()).isZero()) {
      row(
        `KDV tevkifatı (${pct(inv.withholdingRatio)} — alıcı tarafından beyan edilir)`,
        `-${fmt(inv.withholdingAmount)}`,
      );
      row('Ödenecek tutar', fmt(inv.payableAmount), true);
    }
    doc.end();
    return done;
  }
}
