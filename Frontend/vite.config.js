import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'dynamic-logo-dev-middleware',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/logo.png') {
            res.writeHead(302, { Location: 'http://localhost:5000/api/public/logo' });
            return res.end();
          }
          if (req.url === '/favicon.ico') {
            res.writeHead(302, { Location: 'http://localhost:5000/api/public/favicon' });
            return res.end();
          }
          next();
        });
      }
    }
  ],
  server: {
    port: 5173,
    host: true
  },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Shared code must have its own chunk. Left unassigned, it is bundled into whichever library chunk uses
          // it first, and every visitor then downloads that library (the admin-only charts were loading this way).
          if (id.includes('vite/preload-helper') ||
              /node_modules\/(react|react-dom|react-router|react-router-dom|scheduler|react-is|use-sync-external-store|clsx)\//.test(id)) {
            return 'react-vendor';
          }
          if (id.includes('node_modules')) {
            if (id.includes('recharts')) {
              return 'recharts-vendor';
            }
            if (id.includes('framer-motion')) {
              return 'motion-vendor';
            }
            if (id.includes('react-icons') || id.includes('lucide-react')) {
              return 'icons-vendor';
            }
          }
        }
      }
    }
  }
});
