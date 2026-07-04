/// <reference types="vite/client" />

// أنواع صارمة لمتغيّرات البيئة المستخدمة في التطبيق — تمنح إكمالاً تلقائياً وأماناً على import.meta.env
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}