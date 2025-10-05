import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";
import { resolve } from 'path'

const projectRoot = process.env.PROJECT_ROOT || import.meta.dirname

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      '@': resolve(projectRoot, 'src')
    }
  },
  // Configure build output
  build: {
    outDir: process.env.VERCEL ? 'dist' : 'api/dist',
    emptyOutDir: true,
    sourcemap: true
  },
  // Configure dev server for Shopify App Bridge
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5173
    }
  },
  // Ensure proper base path for Shopify embedding
  base: '/',
});
