// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, '/');
          if (normalizedId.includes('/src/pages/EmailPage')) return 'page-email';
          if (normalizedId.includes('/src/pages/ZakazkaDetail')) return 'page-zakazka-detail';
          if (normalizedId.includes('/src/pages/NastaveniPage')) return 'page-nastaveni';
          if (normalizedId.includes('/src/pages/DashboardPage')) return 'page-dashboard';
          if (normalizedId.includes('/src/pages/VyrobniListPage')) return 'page-production';
          if (normalizedId.includes('/src/pages/Recipe') || normalizedId.includes('/src/pages/IngredientsPage')) return 'page-recipes';
          if (normalizedId.includes('/src/pages/Venue')) return 'page-venues';
          if (normalizedId.includes('/src/pages/ClientPortal')) return 'page-client-portal';
          if (normalizedId.includes('/src/pages/Voucher')) return 'page-vouchers';
          if (!normalizedId.includes('node_modules')) return undefined;
          if (normalizedId.includes('@sentry')) return 'vendor-sentry';
          if (normalizedId.includes('react') || normalizedId.includes('react-dom') || normalizedId.includes('react-router-dom')) return 'vendor-react';
          if (normalizedId.includes('@tanstack')) return 'vendor-query';
          if (normalizedId.includes('xlsx')) return 'vendor-xlsx';
          if (normalizedId.includes('lucide-react')) return 'vendor-icons';
          return 'vendor';
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/uploads': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
});
