'use client';

import {
  ADR_CLASSES,
  COUNTRY_NAMES,
  createLoadSchema,
  FOREIGN_CITIES,
  TR_PROVINCES,
  TRAILER_FEATURES,
  TRAILER_TYPES,
} from '@logimatch/shared';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Field,
  Input,
  Select,
  Stepper,
  Textarea,
} from '@logimatch/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { errorText, post } from '@/lib/api-client';
import { formatKm, formatMoney, fromLocalInput, toLocalInput } from '@/lib/format';

interface Place {
  address: string;
  city: string;
  district: string;
  country: string;
  windowStart: string;
  windowEnd: string;
}

interface FormValues {
  pickup: Place;
  delivery: Place;
  cargoType: string;
  cargoDescription: string;
  weightKg: string;
  volumeM3: string;
  loadingMeters: string;
  palletCount: string;
  palletType: string;
  isStackable: boolean;
  isFragile: boolean;
  requiredTrailerTypes: string[];
  requiredFeatures: string[];
  isAdr: boolean;
  adrClass: string;
  unNumber: string;
  packingGroup: string;
  requiresTempControl: boolean;
  minTempC: string;
  maxTempC: string;
  loadingMethod: string;
  unloadingMethod: string;
  pricingMode: 'FIXED' | 'OPEN_TO_OFFER';
  budgetMin: string;
  budgetMax: string;
  currency: 'TRY' | 'EUR' | 'USD';
  paymentTerm: string;
  withholdingApplies: boolean;
}

interface Estimate {
  distanceKm: number | null;
  durationMin: number | null;
  routeStatus: string;
  suggestedMin: string | null;
  suggestedMax: string | null;
  commissionPreview?: string;
  vat?: string;
  withholding?: string;
  carrierPayout?: string;
}

const STEP_FIELDS = [
  ['pickup', 'delivery', 'transportScope'],
  [
    'cargoType',
    'cargoDescription',
    'weightKg',
    'volumeM3',
    'loadingMeters',
    'palletCount',
    'palletType',
  ],
  [
    'requiredTrailerTypes',
    'requiredFeatures',
    'isAdr',
    'adrClass',
    'unNumber',
    'packingGroup',
    'requiresTempControl',
    'minTempC',
    'maxTempC',
  ],
  ['pricingMode', 'budgetMin', 'budgetMax', 'currency', 'paymentTerm'],
];

const num = (v: string) => (v === '' ? undefined : Number(v.replace(',', '.')));
const str = (v: string) => (v.trim() === '' ? undefined : v.trim());
const at = (h: number) => toLocalInput(new Date(Date.now() + h * 3_600_000));

/** Form değerlerini API gövdesine çevirir (backend ile aynı şemayla doğrulanır). */
function toPayload(v: FormValues) {
  const place = (p: Place) => ({
    address: p.address,
    city: p.city,
    district: str(p.district),
    country: p.country,
    windowStart: p.windowStart ? fromLocalInput(p.windowStart) : undefined,
    windowEnd: p.windowEnd ? fromLocalInput(p.windowEnd) : undefined,
  });
  const intl = v.pickup.country !== 'TR' || v.delivery.country !== 'TR';
  return {
    pickup: place(v.pickup),
    delivery: place(v.delivery),
    stops: [],
    cargoType: v.cargoType,
    cargoDescription: str(v.cargoDescription),
    weightKg: num(v.weightKg),
    volumeM3: num(v.volumeM3),
    loadingMeters: num(v.loadingMeters),
    palletCount: num(v.palletCount),
    palletType: str(v.palletType),
    isStackable: v.isStackable,
    isFragile: v.isFragile,
    requiredTrailerTypes: v.requiredTrailerTypes,
    requiredFeatures: v.requiredFeatures,
    isAdr: v.isAdr,
    adrClass: v.isAdr ? str(v.adrClass) : undefined,
    unNumber: v.isAdr ? str(v.unNumber) : undefined,
    packingGroup: v.isAdr ? str(v.packingGroup) : undefined,
    requiresTempControl: v.requiresTempControl,
    minTempC: v.requiresTempControl ? num(v.minTempC) : undefined,
    maxTempC: v.requiresTempControl ? num(v.maxTempC) : undefined,
    loadingMethod: str(v.loadingMethod),
    unloadingMethod: str(v.unloadingMethod),
    transportScope: intl ? 'INTERNATIONAL' : 'DOMESTIC',
    customsRequired: intl,
    pricingMode: v.pricingMode,
    budgetMin: v.pricingMode === 'FIXED' ? undefined : str(v.budgetMin),
    budgetMax: str(v.budgetMax),
    currency: v.currency,
    paymentTerm: v.paymentTerm,
    withholdingApplies: v.withholdingApplies,
    visibility: 'PUBLIC',
    invitedCarrierCompanyIds: [],
  };
}

export function LoadWizard() {
  const t = useTranslations();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [busy, setBusy] = useState(false);

  const form = useForm<FormValues>({
    defaultValues: {
      pickup: {
        address: '',
        city: 'İstanbul',
        district: '',
        country: 'TR',
        windowStart: at(24),
        windowEnd: at(32),
      },
      delivery: {
        address: '',
        city: 'Ankara',
        district: '',
        country: 'TR',
        windowStart: at(44),
        windowEnd: at(56),
      },
      cargoType: '',
      cargoDescription: '',
      weightKg: '',
      volumeM3: '',
      loadingMeters: '',
      palletCount: '',
      palletType: 'EUR',
      isStackable: false,
      isFragile: false,
      requiredTrailerTypes: ['TENTELI'],
      requiredFeatures: [],
      isAdr: false,
      adrClass: '3',
      unNumber: '',
      packingGroup: 'II',
      requiresTempControl: false,
      minTempC: '2',
      maxTempC: '8',
      loadingMethod: 'RAMPA',
      unloadingMethod: 'RAMPA',
      pricingMode: 'OPEN_TO_OFFER',
      budgetMin: '',
      budgetMax: '',
      currency: 'TRY',
      paymentTerm: 'VADELI_30',
      withholdingApplies: false,
    },
  });
  const { register, watch, setValue } = form;
  const v = watch();

  // Canlı fiyat önizleme (debounce 500 ms).
  const estimateKey = JSON.stringify([
    v.pickup.city,
    v.pickup.country,
    v.delivery.city,
    v.delivery.country,
    v.requiredTrailerTypes[0],
    v.weightKg,
    v.isAdr,
    v.requiresTempControl,
    v.currency,
    v.budgetMax,
    v.withholdingApplies,
  ]);
  useEffect(() => {
    const id = setTimeout(() => {
      const weight = num(v.weightKg) ?? 20000;
      if (!v.pickup.city || !v.delivery.city) return;
      post<Estimate>('/pricing/estimate', {
        origin: { city: v.pickup.city, country: v.pickup.country },
        destination: { city: v.delivery.city, country: v.delivery.country },
        trailerType: v.requiredTrailerTypes[0] ?? 'TENTELI',
        weightKg: Math.max(1, Math.round(weight)),
        isAdr: v.isAdr,
        requiresTempControl: v.requiresTempControl,
        transportScope:
          v.pickup.country !== 'TR' || v.delivery.country !== 'TR' ? 'INTERNATIONAL' : 'DOMESTIC',
        currency: v.currency,
        amount: str(v.budgetMax),
        withholdingApplies: v.withholdingApplies,
      })
        .then(setEstimate)
        .catch(() => setEstimate(null));
    }, 500);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estimateKey]);

  const validate = (upTo: number): boolean => {
    const r = createLoadSchema.safeParse(toPayload(form.getValues()));
    const allowed = new Set(STEP_FIELDS.slice(0, upTo + 1).flat());
    const errs: Record<string, string> = {};
    if (!r.success) {
      for (const i of r.error.issues) {
        const root = String(i.path[0]);
        if (allowed.has(root)) errs[i.path.join('.')] = i.message;
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const submit = async (publish: boolean) => {
    if (!validate(3)) return;
    setBusy(true);
    setSubmitError(null);
    try {
      const load = await post<{ id: string; geocodeStatus: string }>(
        '/loads',
        toPayload(form.getValues()),
      );
      if (publish && load.geocodeStatus !== 'FAILED') await post(`/loads/${load.id}/publish`);
      router.push(`/dashboard/loads/${load.id}`);
    } catch (err) {
      setSubmitError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const cities = useMemo(
    () => ({
      TR: TR_PROVINCES.map((p) => p.name),
      foreign: FOREIGN_CITIES.map((c) => c.name),
    }),
    [],
  );
  const err = (k: string) => errors[k];
  const toggle = (name: 'requiredTrailerTypes' | 'requiredFeatures', value: string) => {
    const cur = form.getValues(name);
    setValue(name, cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value]);
  };

  // Not: bileşen değil düz render fonksiyonu — aksi halde her render'da input'lar yeniden kurulup odak kaybolur.
  const placeFields = (prefix: 'pickup' | 'delivery') => (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={t('load.country')}>
        <Select {...register(`${prefix}.country`)} aria-label={`${prefix} country`}>
          {Object.entries(COUNTRY_NAMES).map(([c, n]) => (
            <option key={c} value={c}>
              {n}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t('load.city')} error={err(`${prefix}.city`)}>
        <Input
          list={`cities-${prefix}`}
          {...register(`${prefix}.city`)}
          aria-label={`${prefix} city`}
        />
        <datalist id={`cities-${prefix}`}>
          {(v[prefix].country === 'TR' ? cities.TR : cities.foreign).map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>
      <Field label={t('load.district')}>
        <Input {...register(`${prefix}.district`)} aria-label={`${prefix} district`} />
      </Field>
      <Field label={t('load.address')} error={err(`${prefix}.address`)}>
        <Input {...register(`${prefix}.address`)} aria-label={`${prefix} address`} />
      </Field>
      <Field label={t('load.windowStart')} error={err(`${prefix}.windowStart`)}>
        <Input
          type="datetime-local"
          {...register(`${prefix}.windowStart`)}
          aria-label={`${prefix} window start`}
        />
      </Field>
      <Field label={t('load.windowEnd')} error={err(`${prefix}.windowEnd`)}>
        <Input
          type="datetime-local"
          {...register(`${prefix}.windowEnd`)}
          aria-label={`${prefix} window end`}
        />
      </Field>
    </div>
  );

  const steps = [
    t('load.steps.route'),
    t('load.steps.cargo'),
    t('load.steps.requirements'),
    t('load.steps.price'),
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <Card>
        <CardHeader>
          <Stepper steps={steps} current={step} />
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {step === 0 ? (
            <>
              <section>
                <h3 className="mb-3 font-semibold">{t('load.pickup')}</h3>
                {placeFields('pickup')}
              </section>
              <section>
                <h3 className="mb-3 font-semibold">{t('load.delivery')}</h3>
                {placeFields('delivery')}
              </section>
              {err('transportScope') ? <Alert tone="danger">{err('transportScope')}</Alert> : null}
            </>
          ) : null}

          {step === 1 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('load.cargoType')} error={err('cargoType')} className="sm:col-span-2">
                <Input
                  {...register('cargoType')}
                  placeholder="Paletli gıda, tekstil, beyaz eşya…"
                  aria-label={t('load.cargoType')}
                />
              </Field>
              <Field label={t('load.weightKg')} error={err('weightKg')}>
                <Input
                  inputMode="numeric"
                  {...register('weightKg')}
                  aria-label={t('load.weightKg')}
                />
              </Field>
              <Field label={t('load.volumeM3')} error={err('volumeM3')}>
                <Input inputMode="decimal" {...register('volumeM3')} />
              </Field>
              <Field label={t('load.loadingMeters')} error={err('loadingMeters')}>
                <Input inputMode="decimal" {...register('loadingMeters')} />
              </Field>
              <Field label={t('load.palletCount')} error={err('palletCount')}>
                <Input inputMode="numeric" {...register('palletCount')} />
              </Field>
              <Field label={t('load.palletType')}>
                <Select {...register('palletType')}>
                  <option value="EUR">EUR (120×80)</option>
                  <option value="IND">IND (120×100)</option>
                </Select>
              </Field>
              <div className="flex items-end gap-4">
                <Checkbox label={t('load.stackable')} {...register('isStackable')} />
                <Checkbox label={t('load.fragile')} {...register('isFragile')} />
              </div>
              <Field label={t('load.cargoDescription')} className="sm:col-span-2">
                <Textarea {...register('cargoDescription')} />
              </Field>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="flex flex-col gap-5">
              <Field label={t('load.trailerTypes')} error={err('requiredTrailerTypes')}>
                <div className="flex flex-wrap gap-2">
                  {TRAILER_TYPES.map((tt) => (
                    <button
                      key={tt}
                      type="button"
                      aria-pressed={v.requiredTrailerTypes.includes(tt)}
                      onClick={() => toggle('requiredTrailerTypes', tt)}
                      className={`rounded-full border px-3 py-1 text-sm ${v.requiredTrailerTypes.includes(tt) ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-accent'}`}
                    >
                      {t(`enums.trailerType.${tt}`)}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label={t('load.features')}>
                <div className="flex flex-wrap gap-2">
                  {TRAILER_FEATURES.map((f) => (
                    <button
                      key={f}
                      type="button"
                      aria-pressed={v.requiredFeatures.includes(f)}
                      onClick={() => toggle('requiredFeatures', f)}
                      className={`rounded-full border px-3 py-1 text-sm ${v.requiredFeatures.includes(f) ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-accent'}`}
                    >
                      {t(`enums.trailerFeature.${f}`)}
                    </button>
                  ))}
                </div>
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t('load.loadingMethod')}>
                  <Select {...register('loadingMethod')}>
                    {['RAMPA', 'VINC', 'FORKLIFT', 'ELLE'].map((h) => (
                      <option key={h} value={h}>
                        {t(`enums.handling.${h}`)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t('load.unloadingMethod')}>
                  <Select {...register('unloadingMethod')}>
                    {['RAMPA', 'VINC', 'FORKLIFT', 'ELLE'].map((h) => (
                      <option key={h} value={h}>
                        {t(`enums.handling.${h}`)}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="rounded-lg border border-border p-3">
                <Checkbox label={t('load.adr')} {...register('isAdr')} />
                {v.isAdr ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <Field label={t('load.adrClass')} error={err('adrClass')}>
                      <Select {...register('adrClass')}>
                        {ADR_CLASSES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label={t('load.unNumber')} error={err('unNumber')}>
                      <Input {...register('unNumber')} placeholder="1203" />
                    </Field>
                    <Field label={t('load.packingGroup')}>
                      <Select {...register('packingGroup')}>
                        {['I', 'II', 'III'].map((g) => (
                          <option key={g}>{g}</option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                ) : null}
              </div>
              <div className="rounded-lg border border-border p-3">
                <Checkbox label={t('load.tempControl')} {...register('requiresTempControl')} />
                {v.requiresTempControl ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Field label={t('load.minTemp')} error={err('minTempC')}>
                      <Input inputMode="decimal" {...register('minTempC')} />
                    </Field>
                    <Field label={t('load.maxTemp')}>
                      <Input inputMode="decimal" {...register('maxTempC')} />
                    </Field>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('load.pricingMode')}>
                <Select {...register('pricingMode')}>
                  <option value="OPEN_TO_OFFER">{t('enums.pricingMode.OPEN_TO_OFFER')}</option>
                  <option value="FIXED">{t('enums.pricingMode.FIXED')}</option>
                </Select>
              </Field>
              <Field label={t('load.currency')}>
                <Select {...register('currency')}>
                  <option>TRY</option>
                  <option>EUR</option>
                  <option>USD</option>
                </Select>
              </Field>
              {v.pricingMode === 'OPEN_TO_OFFER' ? (
                <Field label={t('load.budgetMin')} error={err('budgetMin')}>
                  <Input inputMode="decimal" {...register('budgetMin')} />
                </Field>
              ) : null}
              <Field label={t('load.budgetMax')} error={err('budgetMax')}>
                <Input
                  inputMode="decimal"
                  {...register('budgetMax')}
                  aria-label={t('load.budgetMax')}
                />
              </Field>
              <Field label={t('load.paymentTerm')}>
                <Select {...register('paymentTerm')}>
                  {['PESIN', 'VADELI_30', 'VADELI_60', 'KAPIDA'].map((p) => (
                    <option key={p} value={p}>
                      {t(`enums.paymentTerm.${p}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="flex items-end">
                <Checkbox label={t('load.withholding')} {...register('withholdingApplies')} />
              </div>
            </div>
          ) : null}

          {submitError ? <Alert tone="danger">{submitError}</Alert> : null}
          <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-4">
            <Button variant="ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
              {t('common.back')}
            </Button>
            {step < 3 ? (
              <Button onClick={() => validate(step) && setStep((s) => s + 1)}>
                {t('common.next')}
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" disabled={busy} onClick={() => void submit(false)}>
                  {t('load.saveDraft')}
                </Button>
                <Button disabled={busy} onClick={() => void submit(true)}>
                  {t('load.saveAndPublish')}
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="h-fit lg:sticky lg:top-20" data-testid="estimate">
        <CardHeader>
          <CardTitle>{t('load.estimate')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {!estimate ? (
            <p className="text-muted-foreground">{t('common.loading')}</p>
          ) : estimate.routeStatus === 'ROUTE_NOT_FOUND' ? (
            <Alert tone="warning">{t('load.routeNotFound')}</Alert>
          ) : (
            <>
              <Row k={t('load.distance')} v={formatKm(estimate.distanceKm)} />
              <Row
                k={t('load.duration')}
                v={
                  estimate.durationMin
                    ? `${Math.floor(estimate.durationMin / 60)} sa ${estimate.durationMin % 60} dk`
                    : '—'
                }
              />
              <Row
                k={t('load.suggested')}
                v={`${formatMoney(estimate.suggestedMin, v.currency)} – ${formatMoney(estimate.suggestedMax, v.currency)}`}
              />
              <div className="my-1 border-t border-border" />
              <Row
                k={t('load.commission')}
                v={formatMoney(estimate.commissionPreview, v.currency)}
              />
              <Row k={t('load.vat')} v={formatMoney(estimate.vat, v.currency)} />
              <Row
                k={t('load.withholdingAmount')}
                v={formatMoney(estimate.withholding, v.currency)}
              />
              <Row
                k={t('load.carrierPayout')}
                v={formatMoney(estimate.carrierPayout, v.currency)}
              />
              {estimate.suggestedMin && estimate.suggestedMax ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={() => {
                    setValue('budgetMin', String(Math.round(Number(estimate.suggestedMin))));
                    setValue('budgetMax', String(Math.round(Number(estimate.suggestedMax))));
                  }}
                >
                  Öneriyi bütçeye uygula
                </Button>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right font-medium tabular-nums">{v}</span>
    </div>
  );
}
