import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Isolated from vite.config.ts on purpose — the PWA + basic-ssl plugins
// trip Vitest's worker setup (HTTPS server, SW injection).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    globals: false,
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      reporter: ['text', 'html'],
    },
  },
});
