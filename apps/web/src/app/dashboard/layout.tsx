import type { ReactNode } from 'react';
import { Shell } from '@/components/shell';

export default function ShipperLayout({ children }: { children: ReactNode }) {
  return <Shell panel="shipper">{children}</Shell>;
}
