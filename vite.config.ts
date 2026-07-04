import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  // مُعرّف '@' يشير إلى src (مطابق لإعداد tsconfig.paths) لدعم مسارات الاستيراد المطلقة
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    include: ['pdfjs-dist'],
  },
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // عزل المكتبات الثقيلة المشتركة في حزم منفصلة تُجلب عند الحاجة فقط وتبقى مُخزَّنة مؤقتاً بين النشرات
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('pdfjs-dist')) return 'vendor-pdf'
          if (id.includes('tesseract')) return 'vendor-ocr'
          if (id.includes('xlsx')) return 'vendor-xlsx'
          if (id.includes('@supabase')) return 'vendor-supabase'
        },
      },
    },
  },
})