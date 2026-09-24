'use client';

import { ErrorView } from '@/components/states';

export default function Error(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorView {...props} />;
}
