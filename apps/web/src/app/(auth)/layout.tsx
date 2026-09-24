import Link from 'next/link';
import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-blue-50 to-background px-4 py-10">
      <Link href="/" className="mb-6 flex items-center gap-2 text-lg font-bold">
        <span className="grid size-8 place-items-center rounded-lg bg-primary text-sm text-primary-foreground">
          LM
        </span>
        LogiMatch
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
