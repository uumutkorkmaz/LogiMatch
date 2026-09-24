import { describe, expect, it } from 'vitest';
import {
  computeCompliance,
  DEFAULT_RULES,
  type DocForCompliance,
  NO_EXPIRY,
  scopeValidUntil,
} from './compliance';

const now = new Date('2026-10-01T00:00:00Z');
const ok = (
  type: DocForCompliance['type'],
  expiresAt: string | null = '2027-06-01',
): DocForCompliance => ({
  type,
  status: 'APPROVED',
  expiresAt: expiresAt ? new Date(expiresAt) : null,
});

describe('scopeValidUntil', () => {
  it('is the earliest end among groups, latest within a group', () => {
    const docs = [
      ok('DRIVING_LICENSE', '2030-01-01'),
      ok('PSIKOTEKNIK', '2027-03-01'),
      ok('SRC4', '2026-12-01'),
      ok('SRC3', '2028-01-01'),
    ];
    expect(
      scopeValidUntil(
        DEFAULT_RULES.filter((r) => r.ownerType === 'DRIVER'),
        'DOMESTIC',
        docs,
        now,
      ),
    ).toEqual(new Date('2027-03-01'));
  });

  it('is null when a group is missing, pending, rejected or already expired', () => {
    const rules = DEFAULT_RULES.filter((r) => r.ownerType === 'VEHICLE');
    expect(scopeValidUntil(rules, 'DOMESTIC', [ok('VEHICLE_LICENSE')], now)).toBeNull();
    expect(
      scopeValidUntil(
        rules,
        'DOMESTIC',
        [ok('VEHICLE_LICENSE'), { ...ok('INSPECTION'), status: 'PENDING' }],
        now,
      ),
    ).toBeNull();
    expect(
      scopeValidUntil(
        rules,
        'DOMESTIC',
        [ok('VEHICLE_LICENSE'), ok('INSPECTION', '2026-09-01')],
        now,
      ),
    ).toBeNull();
  });

  it('treats documents without expiry as valid forever; no rules means no constraint', () => {
    const rules = DEFAULT_RULES.filter((r) => r.ownerType === 'VEHICLE');
    expect(
      scopeValidUntil(
        rules,
        'DOMESTIC',
        [ok('VEHICLE_LICENSE', null), ok('INSPECTION', null)],
        now,
      ),
    ).toEqual(NO_EXPIRY);
    expect(scopeValidUntil([], 'DOMESTIC', [], now)).toEqual(NO_EXPIRY);
  });
});

describe('computeCompliance', () => {
  const companyDocs = [
    ok('TAX_CERTIFICATE', null),
    ok('SIGNATURE_CIRCULAR', null),
    ok('ACTIVITY_CERTIFICATE', '2027-12-31'),
    ok('K1', '2030-01-01'),
    ok('CARRIER_LIABILITY', '2027-02-01'),
  ];

  it('company: domestic ok, international requires C2/C3/L2/R1 (K2 never counts)', () => {
    const r = computeCompliance('COMPANY', DEFAULT_RULES, companyDocs, now);
    expect(r.complianceValidUntil).toEqual(new Date('2027-02-01'));
    expect(r.intlValidUntil).toBeNull();
    const withC2 = computeCompliance(
      'COMPANY',
      DEFAULT_RULES,
      [...companyDocs, ok('C2', '2029-01-01')],
      now,
    );
    expect(withC2.intlValidUntil).toEqual(new Date('2027-02-01'));
    const onlyK2 = computeCompliance(
      'COMPANY',
      DEFAULT_RULES,
      [...companyDocs.filter((d) => d.type !== 'K1'), ok('K2')],
      now,
    );
    expect(onlyK2.complianceValidUntil).toBeNull();
  });

  it('driver: ADR via ADR certificate or SRC5; international via SRC3 + passport', () => {
    const base = [ok('DRIVING_LICENSE'), ok('PSIKOTEKNIK'), ok('SRC4')];
    const r = computeCompliance('DRIVER', DEFAULT_RULES, [...base, ok('SRC5', '2026-12-01')], now);
    expect(r.adrValidUntil).toEqual(new Date('2026-12-01'));
    expect(r.intlValidUntil).toBeNull();
    const intl = computeCompliance(
      'DRIVER',
      DEFAULT_RULES,
      [...base, ok('SRC3'), ok('PASSPORT', '2027-01-01')],
      now,
    );
    expect(intl.intlValidUntil).toEqual(new Date('2027-01-01'));
  });

  it('trailer: FRIGO_ATP additionally needs an ATP certificate', () => {
    const docs = [ok('VEHICLE_LICENSE', null), ok('INSPECTION', '2027-05-01')];
    expect(
      computeCompliance('TRAILER', DEFAULT_RULES, docs, now, { trailerType: 'TENTELI' })
        .complianceValidUntil,
    ).toEqual(new Date('2027-05-01'));
    expect(
      computeCompliance('TRAILER', DEFAULT_RULES, docs, now, { trailerType: 'FRIGO_ATP' })
        .complianceValidUntil,
    ).toBeNull();
    expect(
      computeCompliance(
        'TRAILER',
        DEFAULT_RULES,
        [...docs, ok('ATP_CERTIFICATE', '2027-01-01')],
        now,
        { trailerType: 'FRIGO_ATP' },
      ).complianceValidUntil,
    ).toEqual(new Date('2027-01-01'));
  });

  it('vehicle: registration + inspection', () => {
    expect(
      computeCompliance('VEHICLE', DEFAULT_RULES, [ok('VEHICLE_LICENSE'), ok('INSPECTION')], now)
        .complianceValidUntil,
    ).toEqual(new Date('2027-06-01'));
  });
});
