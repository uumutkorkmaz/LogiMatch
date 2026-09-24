import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/shell';
import { LoadWizard } from './load-wizard';

export default async function NewLoadPage() {
  const t = await getTranslations('load');
  return (
    <>
      <PageHeader title={t('wizardTitle')} />
      <LoadWizard />
    </>
  );
}
