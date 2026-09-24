'use client';

import { Button, Checkbox, Input, Select } from '@logimatch/ui';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

export interface FilterField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'checkbox' | 'date';
  options?: { value: string; label: string }[];
}

/**
 * Sunucu tarafı filtre + URL durumu (paylaşılabilir link). Uygula → URL güncellenir,
 * sayfa sunucuda yeni parametrelerle yeniden render edilir.
 */
export function FilterBar({ fields }: { fields: FilterField[] }) {
  const t = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.name, params.get(f.name) ?? ''])),
  );

  const apply = (next: Record<string, string>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) q.set(k, v);
    for (const [k, v] of params.entries())
      if (!fields.some((f) => f.name === k) && k !== 'cursor') q.set(k, v);
    router.replace(`${pathname}${q.toString() ? `?${q.toString()}` : ''}`);
  };

  return (
    <form
      className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-3"
      onSubmit={(e) => {
        e.preventDefault();
        apply(values);
      }}
    >
      {fields.map((f) => (
        <div key={f.name} className="flex min-w-36 flex-col gap-1">
          {f.type !== 'checkbox' ? (
            <label className="text-xs text-muted-foreground" htmlFor={`f-${f.name}`}>
              {f.label}
            </label>
          ) : null}
          {f.type === 'select' ? (
            <Select
              id={`f-${f.name}`}
              value={values[f.name]}
              onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
            >
              <option value="">{t('all')}</option>
              {f.options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          ) : f.type === 'checkbox' ? (
            <Checkbox
              label={f.label}
              checked={values[f.name] === 'true'}
              onChange={(e) => setValues({ ...values, [f.name]: e.target.checked ? 'true' : '' })}
              className="h-10"
            />
          ) : (
            <Input
              id={`f-${f.name}`}
              type={f.type}
              value={values[f.name]}
              onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
              className="w-40"
            />
          )}
        </div>
      ))}
      <div className="flex gap-2">
        <Button type="submit">{t('filter')}</Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            const cleared = Object.fromEntries(fields.map((f) => [f.name, '']));
            setValues(cleared);
            apply(cleared);
          }}
        >
          {t('clear')}
        </Button>
      </div>
    </form>
  );
}

/** Durum sekmeleri (URL ?status=). */
export function StatusTabs({
  tabs,
  current,
}: {
  tabs: { value: string; label: string }[];
  current: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <div
      role="tablist"
      className="mb-4 flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1"
    >
      {tabs.map((tab) => (
        <button
          key={tab.value}
          role="tab"
          aria-selected={tab.value === current}
          onClick={() => {
            const q = new URLSearchParams(params.toString());
            q.delete('cursor');
            if (tab.value) q.set('status', tab.value);
            else q.delete('status');
            router.replace(`${pathname}?${q.toString()}`);
          }}
          className={`rounded-md px-3 py-1.5 text-sm ${tab.value === current ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'}`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
