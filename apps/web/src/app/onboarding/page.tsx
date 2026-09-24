'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createCompanySchema, TR_PROVINCES } from '@logimatch/shared';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Select,
} from '@logimatch/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { errorText, post } from '@/lib/api-client';

type Values = z.input<typeof createCompanySchema>;

export default function OnboardingPage() {
  const t = useTranslations('onboarding');
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(createCompanySchema),
    defaultValues: {
      legalName: '',
      taxOffice: '',
      taxNumber: '',
      address: '',
      city: 'İstanbul',
      type: 'SHIPPER',
    },
  });
  const e = form.formState.errors;

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const clean = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== ''));
      await post('/companies', clean);
      window.location.href = values.type === 'CARRIER' ? '/carrier/company' : '/dashboard/company';
    } catch (err) {
      setError(errorText(err));
    }
  });

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t('title')}</CardTitle>
          <p className="text-sm text-muted-foreground">{t('text')}</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
            <Field label={t('type')} className="sm:col-span-2">
              <Select {...form.register('type')}>
                <option value="SHIPPER">{t('typeShipper')}</option>
                <option value="CARRIER">{t('typeCarrier')}</option>
                <option value="BOTH">{t('typeBoth')}</option>
              </Select>
            </Field>
            <Field label={t('legalName')} error={e.legalName?.message} className="sm:col-span-2">
              <Input {...form.register('legalName')} />
            </Field>
            <Field label={t('taxNumber')} error={e.taxNumber?.message}>
              <Input inputMode="numeric" {...form.register('taxNumber')} />
            </Field>
            <Field label={t('taxOffice')} error={e.taxOffice?.message}>
              <Input {...form.register('taxOffice')} />
            </Field>
            <Field label={t('city')} error={e.city?.message}>
              <Select {...form.register('city')}>
                {TR_PROVINCES.map((p) => (
                  <option key={p.plateCode} value={p.name}>
                    {p.plateCode} · {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('district')}>
              <Input {...form.register('district')} />
            </Field>
            <Field label={t('address')} error={e.address?.message} className="sm:col-span-2">
              <Input {...form.register('address')} />
            </Field>
            <Field label={t('iban')} error={e.iban?.message} className="sm:col-span-2">
              <Input placeholder="TR00 0000 0000 0000 0000 0000 00" {...form.register('iban')} />
            </Field>
            {error ? (
              <Alert tone="danger" className="sm:col-span-2">
                {error}
              </Alert>
            ) : null}
            <Button type="submit" className="sm:col-span-2" disabled={form.formState.isSubmitting}>
              {t('submit')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
