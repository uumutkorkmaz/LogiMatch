'use client';

import { createTruckPostingSchema, FOREIGN_CITIES, TR_PROVINCES } from '@logimatch/shared';
import { Alert, Button, Card, CardContent, Checkbox, Field, Input, Select } from '@logimatch/ui';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { MapView } from '@/components/map-view';
import { errorText, post } from '@/lib/api-client';
import { fromLocalInput, toLocalInput } from '@/lib/format';

type Opt = { id: string; label: string };

/** Boş araç ilanı: harita üzerinde konum + tercih edilen destinasyonlar (çoklu). */
export function PostingForm({
  vehicles,
  trailers,
  drivers,
}: {
  vehicles: Opt[];
  trailers: Opt[];
  drivers: Opt[];
}) {
  const t = useTranslations();
  const router = useRouter();
  const [v, setV] = useState({
    vehicleId: vehicles[0]!.id,
    trailerId: trailers[0]!.id,
    driverId: drivers[0]!.id,
    availableFrom: toLocalInput(new Date(Date.now() + 2 * 3_600_000)),
    availableUntil: toLocalInput(new Date(Date.now() + 5 * 86_400_000)),
    city: 'İstanbul',
    district: '',
    address: '',
    maxDeadheadKm: '250',
    maxRouteDeviationKm: '',
    minPricePerKm: '',
    currency: 'TRY',
    acceptsAdr: false,
    acceptsPartialLoad: false,
    acceptsInternational: false,
  });
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [prefs, setPrefs] = useState<{ country: string; city?: string }[]>([]);
  const [prefInput, setPrefInput] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setV({
      ...v,
      [k]: e.target.type === 'checkbox' ? (e.target).checked : e.target.value,
    });

  const addPref = () => {
    const name = prefInput.trim();
    if (!name) return;
    const tr = TR_PROVINCES.find(
      (p) => p.name.toLocaleLowerCase('tr') === name.toLocaleLowerCase('tr'),
    );
    const foreign = FOREIGN_CITIES.find(
      (c) => c.name.toLocaleLowerCase('tr') === name.toLocaleLowerCase('tr'),
    );
    const entry = tr
      ? { country: 'TR', city: tr.name }
      : foreign
        ? { country: foreign.country, city: foreign.name }
        : /^[A-Za-z]{2}$/.test(name)
          ? { country: name.toUpperCase() }
          : null;
    if (entry && prefs.length < 10) setPrefs([...prefs, entry]);
    setPrefInput('');
  };

  const payload = () => ({
    vehicleId: v.vehicleId,
    trailerId: v.trailerId,
    driverId: v.driverId,
    availableFrom: fromLocalInput(v.availableFrom),
    availableUntil: fromLocalInput(v.availableUntil),
    origin: {
      address: v.address || `${v.district || v.city} merkez`,
      city: v.city,
      district: v.district || undefined,
      country: 'TR',
      ...(pin ?? {}),
    },
    preferredDestinations: prefs,
    maxDeadheadKm: Number(v.maxDeadheadKm),
    maxRouteDeviationKm: v.maxRouteDeviationKm ? Number(v.maxRouteDeviationKm) : undefined,
    minPricePerKm: v.minPricePerKm || undefined,
    currency: v.currency,
    acceptsAdr: v.acceptsAdr,
    acceptsPartialLoad: v.acceptsPartialLoad,
    acceptsInternational: v.acceptsInternational,
  });

  const submit = async (publish: boolean) => {
    const body = payload();
    const r = createTruckPostingSchema.safeParse(body);
    if (!r.success) {
      setErrors(Object.fromEntries(r.error.issues.map((i) => [i.path.join('.'), i.message])));
      return;
    }
    setErrors({});
    setBusy(true);
    setError(null);
    try {
      const p = await post<{ id: string }>('/truck-postings', body);
      if (publish) await post(`/truck-postings/${p.id}/publish`);
      router.push(`/carrier/postings/${p.id}`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardContent className="grid gap-4 pt-5 sm:grid-cols-2">
          <Field label={t('posting.vehicle')}>
            <Select value={v.vehicleId} onChange={set('vehicleId')}>
              {vehicles.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('posting.trailer')}>
            <Select value={v.trailerId} onChange={set('trailerId')}>
              {trailers.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('posting.driver')}>
            <Select value={v.driverId} onChange={set('driverId')}>
              {drivers.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('load.city')}>
            <Select value={v.city} onChange={set('city')}>
              {TR_PROVINCES.map((p) => (
                <option key={p.plateCode} value={p.name}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('load.district')}>
            <Input value={v.district} onChange={set('district')} />
          </Field>
          <Field label={t('load.address')}>
            <Input value={v.address} onChange={set('address')} />
          </Field>
          <Field label={t('posting.availableFrom')} error={errors.availableFrom}>
            <Input type="datetime-local" value={v.availableFrom} onChange={set('availableFrom')} />
          </Field>
          <Field label={t('posting.availableUntil')} error={errors.availableUntil}>
            <Input
              type="datetime-local"
              value={v.availableUntil}
              onChange={set('availableUntil')}
            />
          </Field>
          <Field label={t('posting.maxDeadhead')} error={errors.maxDeadheadKm}>
            <Input inputMode="numeric" value={v.maxDeadheadKm} onChange={set('maxDeadheadKm')} />
          </Field>
          <Field label={t('posting.maxDeviation')} hint={t('common.optional')}>
            <Input
              inputMode="numeric"
              value={v.maxRouteDeviationKm}
              onChange={set('maxRouteDeviationKm')}
            />
          </Field>
          <Field label={t('posting.minPricePerKm')} error={errors.minPricePerKm}>
            <Input
              inputMode="decimal"
              value={v.minPricePerKm}
              onChange={set('minPricePerKm')}
              placeholder="55"
            />
          </Field>
          <Field label={t('load.currency')}>
            <Select value={v.currency} onChange={set('currency')}>
              <option>TRY</option>
              <option>EUR</option>
              <option>USD</option>
            </Select>
          </Field>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Checkbox
              label={t('posting.acceptsAdr')}
              checked={v.acceptsAdr}
              onChange={set('acceptsAdr')}
            />
            <Checkbox
              label={t('posting.acceptsPartial')}
              checked={v.acceptsPartialLoad}
              onChange={set('acceptsPartialLoad')}
            />
            <Checkbox
              label={t('posting.acceptsIntl')}
              checked={v.acceptsInternational}
              onChange={set('acceptsInternational')}
            />
          </div>
          <Field
            label={t('posting.preferred')}
            className="sm:col-span-2"
            hint="İl adı, yabancı şehir veya ülke kodu (BG, RO, DE…)"
          >
            <div className="flex gap-2">
              <Input
                list="pref-cities"
                value={prefInput}
                onChange={(e) => setPrefInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addPref();
                  }
                }}
              />
              <datalist id="pref-cities">
                {[...TR_PROVINCES, ...FOREIGN_CITIES].map((c) => (
                  <option key={`${c.country}-${c.name}`} value={c.name} />
                ))}
              </datalist>
              <Button type="button" variant="outline" onClick={addPref}>
                +
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {prefs.map((p, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs"
                >
                  {p.city ?? p.country}
                  <button
                    type="button"
                    aria-label="kaldır"
                    onClick={() => setPrefs(prefs.filter((_, j) => j !== i))}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          </Field>
          {error ? (
            <Alert tone="danger" className="sm:col-span-2">
              {error}
            </Alert>
          ) : null}
          <div className="flex gap-2 sm:col-span-2">
            <Button variant="outline" disabled={busy} onClick={() => void submit(false)}>
              {t('load.saveDraft')}
            </Button>
            <Button disabled={busy} onClick={() => void submit(true)}>
              {t('load.saveAndPublish')}
            </Button>
          </div>
        </CardContent>
      </Card>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">{t('posting.pickOnMap')}</p>
        <MapView
          markers={pin ? [{ ...pin, label: t('posting.origin') }] : []}
          onPick={setPin}
          height={460}
        />
        <p className="text-xs text-muted-foreground">
          {pin ? `${pin.lat}, ${pin.lng}` : `${v.city} merkezi kullanılacak`}
        </p>
      </div>
    </div>
  );
}
