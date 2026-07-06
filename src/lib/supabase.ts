import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// ════════════════════════════════════════════════════════════════
//  اتصال قاعدة البيانات — مُحسّن للسرعة والموثوقية
//  مؤسسة الميمون للمقاولات
// ════════════════════════════════════════════════════════════════

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// تحقق مبكر وواضح من وجود الإعدادات
if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '⚠️ إعدادات Supabase ناقصة. تأكد من VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY في ملف .env'
  )
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,      // حفظ الجلسة بين الزيارات
    autoRefreshToken: true,    // تجديد رمز الجلسة تلقائياً
    detectSessionInUrl: true,  // دعم روابط الدخول/الاستعادة
  },
  db: {
    schema: 'public',
  },
  global: {
    headers: { 'x-application-name': 'almaimoun-erp' },
    // إعادة محاولة ذكية عند انقطاع الشبكة (مهم للعمل في المواقع)
    fetch: fetchWithRetry,
  },
  realtime: {
    params: {
      eventsPerSecond: 5,  // حد معقول للتحديثات اللحظية (يمنع الإفراط)
    },
  },
})

// ─── إعادة المحاولة الذكية عند فشل الشبكة ──────────────────────────
// يعيد المحاولة فقط للطلبات الآمنة (GET/HEAD). إعادة محاولة الكتابة
// (POST/PATCH/DELETE) قد تُكرّر عملية نجحت أصلاً وضاعت استجابتها
// (فاتورة/دفعة مكرّرة) — خطر على سلامة البيانات، فنتركها تفشل بوضوح.
async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  retries = 2,
  backoff = 400
): Promise<Response> {
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
  const idempotent = method === 'GET' || method === 'HEAD'

  try {
    const res = await fetch(input, init)
    // أعد المحاولة فقط على أخطاء الخادم المؤقتة (5xx) وللطلبات الآمنة
    if (idempotent && res.status >= 500 && res.status < 600 && retries > 0) {
      await delay(backoff)
      return fetchWithRetry(input, init, retries - 1, backoff * 2)
    }
    return res
  } catch (err) {
    // خطأ شبكة (انقطاع) — أعد المحاولة للطلبات الآمنة فقط
    if (idempotent && retries > 0) {
      await delay(backoff)
      return fetchWithRetry(input, init, retries - 1, backoff * 2)
    }
    throw err
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ════════════════════════════════════════════════════════════════
//  دوال مساعدة ذكية — تبسّط الاستعلامات وتمنع الأخطاء
// ════════════════════════════════════════════════════════════════

// استعلام آمن: يُرجع مصفوفة دائماً (لا ينهار لو فشل)
export async function safeSelect<T = Record<string, unknown>>(
  table: string,
  columns = '*',
  // نستخدم any داخلياً لتفادي تعقيد أنواع supabase-js العميق؛ التوقيع العام يبقى مُنمَّطاً (T[])
  modify?: (q: any) => any
): Promise<T[]> {
  try {
    let query: any = supabase.from(table).select(columns)
    if (modify) query = modify(query)
    const { data, error } = await query
    if (error) { console.error(`[${table}] خطأ في القراءة:`, error.message); return [] }
    return (data ?? []) as T[]
  } catch (e) {
    console.error(`[${table}] استثناء:`, e)
    return []
  }
}

// جلب صف واحد بأمان (بدون انهيار single)
export async function safeSingle<T = Record<string, unknown>>(
  table: string,
  id: string,
  columns = '*'
): Promise<T | null> {
  try {
    const { data, error } = await supabase.from(table).select(columns).eq('id', id).limit(1)
    if (error || !data || data.length === 0) return null
    return data[0] as T
  } catch {
    return null
  }
}

// عدّ الصفوف بأمان (للإحصائيات السريعة)
export async function safeCount(
  table: string,
  modify?: (q: ReturnType<ReturnType<typeof supabase.from>['select']>) => unknown
): Promise<number> {
  try {
    let query = supabase.from(table).select('*', { count: 'exact', head: true })
    if (modify) query = modify(query) as typeof query
    const { count, error } = await query
    if (error) return 0
    return count ?? 0
  } catch {
    return 0
  }
}

// ─── كشف حالة الاتصال (أونلاين/أوفلاين) ────────────────────────────
// مفيد لعرض مؤشر للمستخدم عند العمل في المواقع بشبكة ضعيفة
export function onConnectionChange(callback: (online: boolean) => void): () => void {
  const handleOnline = () => callback(true)
  const handleOffline = () => callback(false)
  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)
  // إرجاع دالة لإلغاء الاستماع
  return () => {
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
  }
}

export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true
}