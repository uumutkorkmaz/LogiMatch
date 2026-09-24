'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema } from '@logimatch/shared';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
} from '@logimatch/ui';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';

type Values = z.infer<typeof loginSchema>;

const DEMOS = [
  ['shipper@logimatch.test', 'Yük veren'],
  ['carrier@logimatch.test', 'Taşıyıcı'],
  ['admin@logimatch.test', 'Admin'],
] as const;

export function LoginForm() {
  const t = useTranslations('auth');
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(values),
    });
    const body = (await res.json()) as { home?: string; detail?: string };
    if (!res.ok) return setError(body.detail ?? t('failed'));
    window.location.href = params.get('next') ?? body.home ?? '/dashboard';
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t('loginTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <Field label={t('email')} error={form.formState.errors.email?.message} htmlFor="email">
            <Input id="email" type="email" autoComplete="email" {...form.register('email')} />
          </Field>
          <Field
            label={t('password')}
            error={form.formState.errors.password?.message}
            htmlFor="password"
          >
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              {...form.register('password')}
            />
          </Field>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {t('submitLogin')}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            {t('noAccount')}{' '}
            <Link href="/register" className="text-primary hover:underline">
              {t('submitRegister')}
            </Link>
          </p>
        </form>
        <div className="mt-6 border-t border-border pt-4">
          <p className="mb-2 text-xs text-muted-foreground">Demo (Demo1234!)</p>
          <div className="flex flex-wrap gap-2">
            {DEMOS.map(([email, label]) => (
              <Button
                key={email}
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  form.setValue('email', email);
                  form.setValue('password', 'Demo1234!');
                }}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
