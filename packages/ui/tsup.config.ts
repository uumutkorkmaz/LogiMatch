import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  external: ['react', 'react-dom'],
  // Paket etkileşimli bileşenler içerir; RSC'den import edilebilir (istemci sınırı burada).
  banner: { js: "'use client';" },
});
