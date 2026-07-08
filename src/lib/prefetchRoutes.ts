// ════════════════════════════════════════════════════════════════════
//  التحميل المسبق للصفحات (Route Prefetching)
//
//  عند مرور مؤشّر الفأرة فوق رابط في القائمة الجانبية، نبدأ تحميل حزمة
//  تلك الصفحة فوراً — قبل أن ينقر المستخدم. فحين ينقر فعلاً تكون الحزمة
//  جاهزة في الذاكرة، وتُفتح الصفحة فوراً بلا انتظار تحميل. هذا ما يعطي
//  الإحساس "الصاروخي" في التنقّل بين الصفحات لأول مرة.
//
//  نستخدم نفس دوال import() الكسولة المُعرّفة في App، فالمتصفّح يخزّن
//  نتيجة الاستيراد تلقائياً — الاستدعاء الثاني (عند النقر) يأتي من الكاش.
// ════════════════════════════════════════════════════════════════════

type Importer = () => Promise<unknown>

// خريطة: أول جزء من المسار → دالة استيراد صفحته
const PREFETCH_MAP: Record<string, Importer> = {
  '/': () => import('../pages/Dashboard'),
  '/assistant': () => import('../pages/assistant/AIAssistant'),
  '/calendar': () => import('../pages/calendar/CalendarView'),
  '/notifications': () => import('../pages/notifications/NotificationsCenter'),
  '/quotations': () => import('../pages/quotations/QuotationList'),
  '/projects': () => import('../pages/projects/ProjectList'),
  '/daily-logs': () => import('../pages/daily-logs/DailyLogList'),
  '/assets': () => import('../pages/assets/AssetList'),
  '/rentals': () => import('../pages/rentals/RentalsList'),
  '/workers': () => import('../pages/workers/WorkerList'),
  '/payroll': () => import('../pages/payroll/PayrollDashboard'),
  '/subcontractors': () => import('../pages/subcontractors/SubcontractorList'),
  '/tasks': () => import('../pages/tasks/TasksBoard'),
  '/finance': () => import('../pages/finance/FinanceDashboard'),
  '/cheques': () => import('../pages/cheques/ChequesCenter'),
  '/invoices': () => import('../pages/invoices/InvoiceList'),
  '/receipts': () => import('../pages/receipts/ReceiptList'),
  '/cashbook': () => import('../pages/cashbook/CashBook'),
  '/purchases': () => import('../pages/purchases/PurchaseInvoiceList'),
  '/lpos': () => import('../pages/lpos/LPOList'),
  '/suppliers': () => import('../pages/suppliers/SupplierList'),
  '/contacts': () => import('../pages/contacts/ContactsDirectory'),
  '/customers': () => import('../pages/customers/CustomerList'),
  '/reports': () => import('../pages/reports/ReportsPage'),
  '/documents': () => import('../pages/documents/DocumentsPage'),
  '/settings': () => import('../pages/settings/Settings'),
}

// تتبّع ما سبق تحميله مسبقاً حتى لا نكرّر الاستيراد لكل مرور فأرة
const prefetched = new Set<string>()

/**
 * يبدأ تحميل حزمة الصفحة المقابلة للمسار (إن لم تكن حُمّلت بعد).
 * يُستدعى عند مرور الفأرة على رابط أو لمسه. آمن للاستدعاء المتكرر.
 */
export function prefetchRoute(path: string): void {
  const key = '/' + (path.split('/')[1] ?? '')
  if (prefetched.has(key)) return
  const importer = PREFETCH_MAP[key]
  if (!importer) return
  prefetched.add(key)
  // نطلق التحميل ونتجاهل الأخطاء (مجرد تحسين، لا يؤثّر على عمل التطبيق)
  importer().catch(() => prefetched.delete(key))
}