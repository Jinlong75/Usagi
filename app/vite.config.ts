import { defineConfig } from 'vite';

export default defineConfig({ base: './', build: { outDir: 'dist', rolldownOptions: { input: ['index.html', 'bubble.html', 'chat.html', 'settings.html'] } } });
