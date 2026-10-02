/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative paths, so the build works at tim39.github.io/game/ or in any other folder.
  base: './',
  build: {
    target: 'es2022',
    // Phaser alone is over 1 MB minified, so the default 500 kB warning would fire on every build.
    chunkSizeWarningLimit: 2000,
  },
  test: {
    include: ['src/**/*.test.ts', 'tools/**/*.test.ts'],
    environment: 'node',
  },
});
