import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'

const pageTitles: Record<string, string> = {
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

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()

  // عنوان الصفحة: مطابقة مباشرة، ثم حالات خاصة، ثم الأطول مطابقةً للمسارات الفرعية
  const path = location.pathname
  let title = pageTitles[path]
  if (!title) {
    if (path.includes('/statement')) title = 'كشف حساب'
    else if (path.includes('/edit')) title = 'تعديل'
    else if (path.includes('/view')) title = 'عرض'
    else if (path.includes('/profile')) title = 'ملف العامل'
    else if (path.includes('/deliveries')) title = 'الاستلامات'
    else if (path.includes('/vos/new')) title = 'أمر تغيير جديد'
    else {
      // مطابقة المسار الأب (مثل /quotations/123 → عروض الأسعار)
      const base = '/' + path.split('/')[1]
      title = pageTitles[base] ?? ''
    }
  }

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
