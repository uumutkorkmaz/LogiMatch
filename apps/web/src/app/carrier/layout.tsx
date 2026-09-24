import type { ReactNode } from 'react';
import { Shell } from '@/components/shell';

export default function CarrierLayout({ children }: { children: ReactNode }) {
  return <Shell panel="carrier">{children}</Shell>;
}
