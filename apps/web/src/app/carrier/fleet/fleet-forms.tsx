'use client';

import {
  createDriverSchema,
  createTrailerSchema,
  createVehicleSchema,
  TRAILER_FEATURES,
  TRAILER_TYPES,
  VEHICLE_TYPES,
} from '@logimatch/shared';
import { Alert, Button, Card, CardContent, Checkbox, Field, Input, Select } from '@logimatch/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ZodTypeAny } from 'zod';
import { errorText, post } from '@/lib/api-client';

type Kind = 'vehicle' | 'trailer' | 'driver';

/** Araç / dorse / şoför ekleme formları — backend ile aynı zod şemaları. */
export function FleetForms() {
  const t = useTranslations();
  const router = useRouter();
  const [kind, setKind] = useState<Kind | null>(null);
  const [v, setV] = useState<Record<string, string | boolean | string[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const open = (k: Kind) => {
    setKind(k);
    setErrors({});
    setError(null);
    setV(
      k === 'vehicle'
        ? { plate: '', type: 'TRACTOR', brand: '', model: '', year: '2022', euroNorm: 'Euro 6' }
        : k === 'trailer'
          ? {
              plate: '',
              trailerType: 'TENTELI',
              capacityKg: '24000',
              volumeM3: '86',
              lengthCm: '1360',
              widthCm: '248',
              heightCm: '270',
              loadingMeters: '13.6',
              palletCapacity: '33',
              axleCount: '3',
              features: [],
              minTempC: '',
              maxTempC: '',
            }
          : {
              fullName: '',
              phone: '',
              userEmail: '',
              srcTypes: ['SRC4'],
              adrClasses: [],
              hasPsikoteknik: true,
              visaCountries: '',
            },
    );
  };

  const n = (x: unknown) => (x === '' || x === undefined ? undefined : Number(x));
  const body = (): { path: string; schema: ZodTypeAny; data: Record<string, unknown> } => {
    if (kind === 'vehicle')
      return { path: '/vehicles', schema: createVehicleSchema, data: { ...v, year: n(v.year) } };
    if (kind === 'trailer')
      return {
        path: '/trailers',
        schema: createTrailerSchema,
        data: {
          ...v,
          capacityKg: n(v.capacityKg),
          volumeM3: n(v.volumeM3),
          lengthCm: n(v.lengthCm),
          widthCm: n(v.widthCm),
          heightCm: n(v.heightCm),
          loadingMeters: n(v.loadingMeters),
          palletCapacity: n(v.palletCapacity),
          axleCount: n(v.axleCount),
          minTempC: n(v.minTempC),
          maxTempC: n(v.maxTempC),
        },
      };
    return {
      path: '/drivers',
      schema: createDriverSchema,
      data: {
        ...v,
        phone: v.phone || undefined,
        userEmail: v.userEmail || undefined,
        visaCountries: String(v.visaCountries || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      },
    };
  };

  const submit = async () => {
    const b = body();
    const r = b.schema.safeParse(b.data);
    if (!r.success) {
      setErrors(Object.fromEntries(r.error.issues.map((i) => [i.path.join('.'), i.message])));
      return;
    }
    try {
      await post(b.path, b.data);
      setKind(null);
      router.refresh();
    } catch (err) {
      setError(errorText(err));
    }
  };

  const text = (
    name: string,
    label: string,
    props: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <Field label={label} error={errors[name]}>
      <Input
        value={String(v[name] ?? '')}
        onChange={(e) => setV({ ...v, [name]: e.target.value })}
        {...props}
      />
    </Field>
  );
  const toggleArr = (name: string, val: string) => {
    const cur = (v[name] as string[]) ?? [];
    setV({ ...v, [name]: cur.includes(val) ? cur.filter((x) => x !== val) : [...cur, val] });
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant={kind === 'vehicle' ? 'default' : 'outline'}
          onClick={() => open('vehicle')}
        >
          + {t('fleet.addVehicle')}
        </Button>
        <Button
          variant={kind === 'trailer' ? 'default' : 'outline'}
          onClick={() => open('trailer')}
        >
          + {t('fleet.addTrailer')}
        </Button>
        <Button variant={kind === 'driver' ? 'default' : 'outline'} onClick={() => open('driver')}>
          + {t('fleet.addDriver')}
        </Button>
      </div>
      {kind ? (
        <Card className="mt-4">
          <CardContent className="grid gap-3 pt-5 sm:grid-cols-3">
            {kind === 'vehicle' ? (
              <>
                {text('plate', t('fleet.plate'), { placeholder: '34 ABC 123' })}
                <Field label={t('fleet.type')}>
                  <Select
                    value={String(v.type)}
                    onChange={(e) => setV({ ...v, type: e.target.value })}
                  >
                    {VEHICLE_TYPES.map((x) => (
                      <option key={x} value={x}>
                        {t(`enums.vehicleType.${x}`)}
                      </option>
                    ))}
                  </Select>
                </Field>
                {text('brand', t('fleet.brand'))}
                {text('model', t('fleet.model'))}
                {text('year', t('fleet.year'), { inputMode: 'numeric' })}
                {text('euroNorm', 'Euro')}
              </>
            ) : null}
            {kind === 'trailer' ? (
              <>
                {text('plate', t('fleet.plate'), { placeholder: '34 ABC 123' })}
                <Field label={t('fleet.type')}>
                  <Select
                    value={String(v.trailerType)}
                    onChange={(e) => setV({ ...v, trailerType: e.target.value })}
                  >
                    {TRAILER_TYPES.map((x) => (
                      <option key={x} value={x}>
                        {t(`enums.trailerType.${x}`)}
                      </option>
                    ))}
                  </Select>
                </Field>
                {text('capacityKg', t('fleet.capacityKg'), { inputMode: 'numeric' })}
                {text('volumeM3', t('fleet.volumeM3'), { inputMode: 'decimal' })}
                {text('loadingMeters', t('fleet.ldm'), { inputMode: 'decimal' })}
                {text('palletCapacity', t('fleet.pallets'), { inputMode: 'numeric' })}
                {text('lengthCm', 'Boy (cm)', { inputMode: 'numeric' })}
                {text('widthCm', 'En (cm)', { inputMode: 'numeric' })}
                {text('heightCm', 'Yükseklik (cm)', { inputMode: 'numeric' })}
                {text('axleCount', t('fleet.axles'), { inputMode: 'numeric' })}
                {text('minTempC', t('load.minTemp'), { inputMode: 'decimal' })}
                {text('maxTempC', t('load.maxTemp'), { inputMode: 'decimal' })}
                <div className="flex flex-wrap gap-3 sm:col-span-3">
                  {TRAILER_FEATURES.map((f) => (
                    <Checkbox
                      key={f}
                      label={t(`enums.trailerFeature.${f}`)}
                      checked={(v.features as string[])?.includes(f)}
                      onChange={() => toggleArr('features', f)}
                    />
                  ))}
                </div>
              </>
            ) : null}
            {kind === 'driver' ? (
              <>
                {text('fullName', t('auth.fullName'))}
                {text('phone', t('auth.phone'))}
                {text('userEmail', `${t('auth.email')} (${t('common.optional')})`)}
                <div className="flex flex-wrap gap-3 sm:col-span-3">
                  {['SRC3', 'SRC4', 'SRC5'].map((s) => (
                    <Checkbox
                      key={s}
                      label={s}
                      checked={(v.srcTypes as string[])?.includes(s)}
                      onChange={() => toggleArr('srcTypes', s)}
                    />
                  ))}
                  {['2', '3', '8'].map((c) => (
                    <Checkbox
                      key={c}
                      label={`ADR ${c}`}
                      checked={(v.adrClasses as string[])?.includes(c)}
                      onChange={() => toggleArr('adrClasses', c)}
                    />
                  ))}
                  <Checkbox
                    label="Psikoteknik"
                    checked={Boolean(v.hasPsikoteknik)}
                    onChange={(e) => setV({ ...v, hasPsikoteknik: e.target.checked })}
                  />
                </div>
                {text('visaCountries', 'Vize (SCHENGEN, GB…)')}
              </>
            ) : null}
            {error ? (
              <Alert tone="danger" className="sm:col-span-3">
                {error}
              </Alert>
            ) : null}
            <div className="flex gap-2 sm:col-span-3">
              <Button onClick={() => void submit()}>{t('common.save')}</Button>
              <Button variant="ghost" onClick={() => setKind(null)}>
                {t('common.cancel')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
