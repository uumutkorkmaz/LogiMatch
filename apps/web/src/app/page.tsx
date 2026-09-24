import { Button, Card } from '@logimatch/ui';
import { BadgeCheck, Route, Scale } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { ACCESS_COOKIE, decodeClaims, homeFor } from '@/lib/session';

export default async function HomePage() {
  const t = await getTranslations('Home');
  const claims = decodeClaims((await cookies()).get(ACCESS_COOKIE)?.value);
  const features = [
    { icon: Route, title: t('features.matching'), text: t('features.matchingText') },
    { icon: BadgeCheck, title: t('features.safe'), text: t('features.safeText') },
    { icon: Scale, title: t('features.transparent'), text: t('features.transparentText') },
  ];
  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50 to-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <span className="flex items-center gap-2 text-lg font-bold">
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-sm text-primary-foreground">
            LM
          </span>
          LogiMatch
        </span>
        <div className="flex gap-2">
          {claims ? (
            <Button asChild>
              <Link href={homeFor(claims.role)}>Panel →</Link>
            </Button>
          ) : (
            <>
              <Button variant="ghost" asChild>
                <Link href="/login">{t('login')}</Link>
              </Button>
              <Button asChild>
                <Link href="/register">{t('register')}</Link>
              </Button>
            </>
          )}
        </div>
      </header>
      <section className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-16 md:py-24">
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight md:text-5xl">{t('tagline')}</h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          Türkiye merkezli dijital yük brokerliği: yük verenler ve taşıyıcılar doğrulanmış
          profillerle eşleşir, platform içinde pazarlık yapar, sevkiyatı uçtan uca takip eder.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button size="lg" asChild>
            <Link href="/register">{t('shipperCta')}</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/register">{t('carrierCta')}</Link>
          </Button>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {features.map((f) => (
            <Card key={f.title} className="p-5">
              <f.icon className="mb-3 size-6 text-primary" />
              <p className="font-semibold">{f.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
            </Card>
          ))}
        </div>
        <Card className="mt-6 p-5 text-sm">
          <p className="font-medium">{t('demo')}</p>
          <p className="mt-1 font-mono text-muted-foreground">
            shipper@logimatch.test · carrier@logimatch.test · admin@logimatch.test
          </p>
        </Card>
      </section>
    </main>
  );
}
