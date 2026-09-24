'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchema } from '@logimatch/shared';
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
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';

type Values = z.input<typeof registerSchema>;

export default function RegisterPage() {
  const t = useTranslations('auth');
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: '', password: '', fullName: '', role: 'SHIPPER_USER', locale: 'tr' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...values, phone: values.phone || undefined }),
    });
    const body = (await res.json()) as {
      home?: string;
      detail?: string;
      errors?: { path: string; message: string }[];
    };
    if (!res.ok)
      return setError(
        [body.detail, ...(body.errors?.map((e) => `${e.path}: ${e.message}`) ?? [])]
          .filter(Boolean)
          .join(' · '),
      );
    window.location.href = body.home ?? '/onboarding';
  });
  const e = form.formState.errors;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t('registerTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <Field label={t('role')} htmlFor="role">
            <Select id="role" {...form.register('role')}>
              <option value="SHIPPER_USER">{t('roleShipper')}</option>
              <option value="CARRIER_USER">{t('roleCarrier')}</option>
            </Select>
          </Field>
          <Field label={t('fullName')} error={e.fullName?.message} htmlFor="fullName">
            <Input id="fullName" autoComplete="name" {...form.register('fullName')} />
          </Field>
          <Field label={t('email')} error={e.email?.message} htmlFor="email">
            <Input id="email" type="email" autoComplete="email" {...form.register('email')} />
          </Field>
          <Field label={t('phone')} error={e.phone?.message} htmlFor="phone" hint="05xx xxx xx xx">
            <Input id="phone" type="tel" autoComplete="tel" {...form.register('phone')} />
          </Field>
          <Field
            label={t('password')}
            error={e.password?.message}
            htmlFor="password"
            hint="En az 8 karakter, harf ve rakam"
          >
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              {...form.register('password')}
            />
          </Field>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {t('submitRegister')}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            {t('haveAccount')}{' '}
            <Link href="/login" className="text-primary hover:underline">
              {t('submitLogin')}
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
