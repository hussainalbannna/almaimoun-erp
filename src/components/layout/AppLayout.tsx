import { useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'

// خريطة العناوين حسب المسار (مطابقة مباشرة)
const PAGE_TITLES: Record<string, string> = {
  '/': 'لوحة التحكم',
  '/reports': 'التقارير والإحصائيات',
  // المساعد والتقويم والإشعارات
  '/assistant': 'المساعد الذكي',
  '/calendar': 'التقويم',
  '/notifications': 'مركز الإشعارات',
  // عروض الأسعار
  '/quotations': 'عروض الأسعار',
  '/quotations/new': 'عرض سعر جديد',
  // المشاريع
  '/projects': 'المشاريع',
  '/projects/new': 'مشروع جديد',
  // الفواتير
  '/invoices': 'الفواتير',
  '/invoices/new': 'فاتورة جديدة',
  // الإيصالات
  '/receipts': 'الإيصالات',
  '/receipts/new': 'إيصال جديد',
  // المالية
  '/finance': 'اللوحة المالية',
  '/cheques': 'مركز الشيكات',
  '/cashbook': 'دفتر الصندوق',
  // أوامر الشراء والمشتريات
  '/lpos': 'أوامر الشراء',
  '/lpos/new': 'أمر شراء جديد',
  '/purchases': 'فواتير الشراء',
  '/purchases/new': 'فاتورة شراء جديدة',
  // العمالة
  '/workers': 'العمالة',
  '/workers/new': 'عامل جديد',
  '/payroll': 'كشف الرواتب',
  // المهام والتقارير
  '/tasks': 'المهام والتذكيرات',
  '/daily-logs': 'تقارير الموقع',
  // مقاولو الباطن والأصول
  '/subcontractors': 'مقاولو الباطن',
  '/subcontractors/new': 'مقاول باطن جديد',
  '/assets': 'الأصول والمعدات',
  // الموردون والعملاء وجهات الاتصال
  '/suppliers': 'الموردون',
  '/suppliers/new': 'مورد جديد',
  '/customers': 'العملاء',
  '/customers/new': 'عميل جديد',
  '/contacts': 'جهات الاتصال',
  // أخرى
  '/documents': 'المستندات',
  '/settings': 'الإعدادات',
}

// عناوين المسارات الفرعية الديناميكية — تُطابَق بالتضمين (الترتيب مقصود من الأخص للأعم)
const DYNAMIC_TITLES: ReadonlyArray<readonly [string, string]> = [
  ['/statement', 'كشف حساب'],
  ['/edit', 'تعديل'],
  ['/view', 'عرض'],
  ['/profile', 'ملف العامل'],
  ['/deliveries', 'الاستلامات'],
  ['/vos/new', 'أمر تغيير جديد'],
]

// حلّ عنوان الصفحة: مطابقة مباشرة ← مسار فرعي ديناميكي ← مطابقة المسار الأب
function resolvePageTitle(pathname: string): string {
  const exact = PAGE_TITLES[pathname]
  if (exact) return exact

  for (const [fragment, label] of DYNAMIC_TITLES) {
    if (pathname.includes(fragment)) return label
  }

  // مثال: /quotations/123 → عروض الأسعار
  const parent = '/' + pathname.split('/')[1]
  return PAGE_TITLES[parent] ?? ''
}

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()

  // العنوان يُحسب فقط عند تغيّر المسار (لا عند فتح/إغلاق القائمة)
  const title = useMemo(() => resolvePageTitle(location.pathname), [location.pathname])

  // إغلاق القائمة الجانبية تلقائياً عند أي تنقّل (شبكة أمان للجوال)
  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  // إغلاق القائمة بمفتاح Escape أثناء فتحها على الجوال
  useEffect(() => {
    if (!sidebarOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [sidebarOpen])

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 print:block print:h-auto print:overflow-visible print:bg-white">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden print:block print:overflow-visible">
        <Header onMenuClick={() => setSidebarOpen(true)} title={title} />
        <main className="flex-1 overflow-auto p-4 lg:p-6 print:p-0 print:overflow-visible">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
