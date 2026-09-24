import { Global, Injectable, Module } from '@nestjs/common';
import { type Currency, Decimal, toDecimal } from '@logimatch/shared';
import { unavailable } from '../common/errors';
import { type Db, type DbOrTx, InjectDb } from '../infra/prisma';
import type { CancellationPolicyValues, CancellationTier } from '../pricing/domain/cancellation';
import type { PricingConfigValues } from '../pricing/domain/commission';
import type { EstimateBands } from '../pricing/domain/estimate';
import type { MatchingParams } from '../matching/domain/types';

const TTL_MS = 60_000;
const FX_MAX_AGE_MS = 72 * 3600_000;

interface Cached<T> {
  at: number;
  value: T;
}

export interface ActivePricingConfig extends PricingConfigValues {
  id: string;
  bands: EstimateBands;
}

/**
 * Versiyonlu config tablolarının "şu an geçerli" satırını okur (effectiveFrom ≤ now, en yenisi).
 * Kısa önbellek: config değişikliği ≤ 60 sn içinde yansır; kilitlenen kayıtlar etkilenmez (#26).
 */
@Injectable()
export class PlatformConfigService {
  private cache = new Map<string, Cached<unknown>>();

  constructor(@InjectDb() private readonly db: Db) {}

  private async cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key) as Cached<T> | undefined;
    if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
    const value = await load();
    this.cache.set(key, { at: Date.now(), value });
    return value;
  }

  invalidate(): void {
    this.cache.clear();
  }

  async pricing(): Promise<ActivePricingConfig> {
    return this.cached('pricing', async () => {
      const row = await this.db.pricingConfig.findFirst({
        where: { effectiveFrom: { lte: new Date() } },
        orderBy: { effectiveFrom: 'desc' },
      });
      if (!row) throw unavailable('PRICING_CONFIG_MISSING', 'Fiyat konfigürasyonu tanımlı değil');
      return {
        id: row.id,
        commissionModel: row.commissionModel,
        commissionRate: toDecimal(row.commissionRate),
        splitShipperShare: toDecimal(row.splitShipperShare),
        minCommission: row.minCommission ? toDecimal(row.minCommission) : null,
        vatRate: toDecimal(row.vatRate),
        commissionVatRate: toDecimal(row.commissionVatRate),
        withholdingRatio: toDecimal(row.withholdingRatio),
        withholdingThresholdTry: toDecimal(row.withholdingThreshold),
        commissionOnCancellationFee: row.commissionOnCancellationFee,
        bands: {
          perKm: row.ratePerKmBands as unknown as EstimateBands['perKm'],
          multipliers: row.multipliers as unknown as EstimateBands['multipliers'],
        },
      };
    });
  }

  async matching(): Promise<MatchingParams & { id: string }> {
    return this.cached('matching', async () => {
      const row = await this.db.matchingConfig.findFirst({
        where: { effectiveFrom: { lte: new Date() } },
        orderBy: { effectiveFrom: 'desc' },
      });
      if (!row)
        throw unavailable('MATCHING_CONFIG_MISSING', 'Eşleştirme konfigürasyonu tanımlı değil');
      return {
        id: row.id,
        weights: {
          proximity: row.wProximity,
          routeFit: row.wRouteFit,
          priceFit: row.wPriceFit,
          reliability: row.wReliability,
          timeFit: row.wTimeFit,
          equipmentFit: row.wEquipmentFit,
          history: row.wHistory,
        },
        threshold: row.threshold,
        topN: row.topN,
        roadFactor: row.roadFactor,
        avgTruckSpeedKmh: row.avgTruckSpeedKmh,
        candidateLimit: row.candidateLimit,
      };
    });
  }

  async cancellation(): Promise<CancellationPolicyValues & { id: string }> {
    return this.cached('cancellation', async () => {
      const row = await this.db.cancellationPolicy.findFirst({
        where: { effectiveFrom: { lte: new Date() } },
        orderBy: { effectiveFrom: 'desc' },
      });
      if (!row) throw unavailable('CANCELLATION_POLICY_MISSING', 'İptal politikası tanımlı değil');
      return {
        id: row.id,
        tiers: row.tiers as unknown as CancellationTier[],
        deadheadRatePerKm: toDecimal(row.deadheadRatePerKm),
        noShowGraceMinutes: row.noShowGraceMinutes,
        noShowSuspendStreak: row.noShowSuspendStreak,
      };
    });
  }

  async countryVisaGroups(): Promise<Record<string, string | null>> {
    return this.cached('countries', async () => {
      const rows = await this.db.countryRule.findMany();
      return Object.fromEntries(rows.map((r) => [r.countryCode, r.visaGroup]));
    });
  }

  async vatExemptInternational(countryCode: string): Promise<boolean> {
    const rows = await this.cached('countryRules', () => this.db.countryRule.findMany());
    return rows.find((r) => r.countryCode === countryCode)?.vatExemptInternational ?? true;
  }

  /**
   * `from` → `to` kuru (1 from = rate to). En güncel ≤ 72 saatlik kayıt; yoksa ters kur;
   * yoksa TRY üzerinden çapraz kur. Hiçbiri yoksa 503 FX_RATE_UNAVAILABLE (#24).
   */
  async fxRate(from: Currency, to: Currency, tx: DbOrTx = this.db): Promise<Decimal> {
    if (from === to) return new Decimal(1);
    const direct = await this.latestRate(tx, from, to);
    if (direct) return direct;
    const inverse = await this.latestRate(tx, to, from);
    if (inverse) return new Decimal(1).div(inverse);
    if (from !== 'TRY' && to !== 'TRY') {
      const a = await this.fxRate(from, 'TRY', tx);
      const b = await this.fxRate('TRY', to, tx);
      return a.times(b);
    }
    throw unavailable('FX_RATE_UNAVAILABLE', `${from}/${to} için güncel kur yok`);
  }

  private async latestRate(tx: DbOrTx, base: Currency, quote: Currency): Promise<Decimal | null> {
    const row = await tx.exchangeRate.findFirst({
      where: {
        base,
        quote,
        effectiveAt: { lte: new Date(), gte: new Date(Date.now() - FX_MAX_AGE_MS) },
      },
      orderBy: { effectiveAt: 'desc' },
    });
    return row ? toDecimal(row.rate) : null;
  }

  /** Eşleştirmede toplu kullanım için senkron dönüştürücü üretir (tüm kurlar önceden okunur). */
  async fxConverter(): Promise<(amount: Decimal, from: Currency, to: Currency) => Decimal> {
    const pairs: [Currency, Currency][] = [
      ['EUR', 'TRY'],
      ['USD', 'TRY'],
      ['EUR', 'USD'],
    ];
    const rates = new Map<string, Decimal>();
    for (const [a, b] of pairs) {
      try {
        const r = await this.fxRate(a, b);
        rates.set(`${a}${b}`, r);
        rates.set(`${b}${a}`, new Decimal(1).div(r));
      } catch {
        /* kur yoksa o çift dönüştürülemez */
      }
    }
    return (amount, from, to) => {
      if (from === to) return amount;
      const r = rates.get(`${from}${to}`);
      if (!r) throw unavailable('FX_RATE_UNAVAILABLE', `${from}/${to} için güncel kur yok`);
      return amount.times(r);
    };
  }
}

@Global()
@Module({ providers: [PlatformConfigService], exports: [PlatformConfigService] })
export class PlatformModule {}
