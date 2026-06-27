import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'

const pageTitles: Record<string, string> = {
  '/': 'لوحة التحكم',
  '/invoices': 'الفواتير',
  '/invoices/new': 'فاتورة جديدة',
  '/lpos': 'أوامر الشراء',
  '/lpos/new': 'أمر شراء جديد',
  '/customers': 'العملاء',
  '/customers/new': 'عميل جديد',
  '/suppliers': 'الموردون',
  '/suppliers/new': 'مورد جديد',
  '/documents': 'المستندات',
  '/settings': 'الإعدادات',
}

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()

  const title =
    pageTitles[location.pathname] ??
    (location.pathname.includes('/edit') ? 'تعديل' :
     location.pathname.includes('/view') ? 'عرض' : '')

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
