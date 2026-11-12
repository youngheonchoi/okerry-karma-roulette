import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react(), {
    name: 'app-color-theme',
    transformIndexHtml(html) {
      if (mode !== 'toss') return html;
      return html.replace('data-theme="dark"', 'data-theme="light"')
        .replace('name="theme-color" content="#14161a"', 'name="theme-color" content="#ffffff"')
        .replace('name="color-scheme" content="dark"', 'name="color-scheme" content="light"');
    },
  }],
  base: './',
}));
