import { defineConfig } from 'vite';

// Dieses Projekt wird als Sub-App unter /bilder/ deployed (Render Static Site).
// Der CRA-Build landet in ../build, der Vite-Build legt den Builder in
// ../build/bilder/ ab. Wichtig: npm run build im Root MUSS den CRA-Build ZUERST
// ausfuehren, weil CRA build/ leert.
export default defineConfig({
  root: '.',
  base: '/bilder/',
  server: {
    port: 5173,
    strictPort: false,
    open: false,
  },
  build: {
    outDir: '../build/bilder',
    emptyOutDir: true,
    sourcemap: false,
  },
});
