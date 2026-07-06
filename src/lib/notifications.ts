import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard, FileText, ShoppingCart, Users, Building2,
  Settings, FileArchive, HardHat, Receipt, UserCog,
  ClipboardList, BookOpen, Truck, BarChart2, Phone, CreditCard,
  Bot, Calendar, Bell, Calculator, Wrench, ListTodo, PieChart, Package, KeyRound, Banknote,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string          // نص عنصر القائمة الجانبية
  icon: LucideIcon
  end?: boolean          // مطابقة تامّة للمسار (للوحة التحكم فقط حتى لا تبقى نشطة في كل الصفحات)
  title?: string         // عنوان الترويسة إن اختلف عن label (وإلا يُستخدم label)
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

// ═══════════════════════════════════════════════════════════════════
//  المصدر الموحّد الوحيد لكل بيانات المسارات:
//  تقرأ منه القائمة الجانبية (Sidebar) وعناوين الترويسة (AppLayout).
//  أي إضافة/تعديل صفحة تتم هنا فقط — لا تكرار.
// ═══════════════════════════════════════════════════════════════════
export const navGroups: NavGroup[] = [
  {
    label: 'الرئيسية',
    items: [
      { to: '/', label: 'لوحة التحكم', icon: LayoutDashboard, end: true },
      { to: '/assistant', label: 'المساعد الذكي', icon: Bot },
      { to: '/calendar', label: 'التقويم', icon: Calendar },
      { to: '/notifications', label: 'مركز الإشعارات', icon: Bell },
    ],
  },
  {
    label: 'المبيعات والعروض',
    items: [
      { to: '/quotations', label: 'عروض الأسعار', icon: Calculator },
    ],
  },
  {
    label: 'إدارة المشاريع',
    items: [
      { to: '/projects', label: 'المشاريع والمراحل', icon: HardHat, title: 'المشاريع' },
      { to: '/daily-logs', label: 'تقارير الموقع وأوامر التغيير', icon: ClipboardList, title: 'تقارير الموقع' },
      { to: '/assets', label: 'الأصول والمعدات', icon: Package },
      { to: '/rentals', label: 'الإيجارات والمصاريف', icon: KeyRound },
    ],
  },
  {
    label: 'الموارد البشرية',
    items: [
      { to: '/workers', label: 'العمالة والسجلات', icon: Users, title: 'العمالة' },
      { to: '/payroll', label: 'كشف الرواتب', icon: UserCog },
      { to: '/subcontractors', label: 'مقاولو الباطن', icon: Wrench },
      { to: '/tasks', label: 'المهام والتذكيرات', icon: ListTodo },
    ],
  },
  {
    label: 'المالية والمحاسبة',
    items: [
      { to: '/finance', label: 'اللوحة المالية', icon: PieChart },
      { to: '/cheques', label: 'مركز الشيكات', icon: Banknote },
      { to: '/invoices', label: 'الفواتير', icon: FileText },
      { to: '/receipts', label: 'الإيصالات', icon: Receipt },
      { to: '/cashbook', label: 'دفتر الصندوق', icon: BookOpen },
    ],
  },
  {
    label: 'المشتريات',
    items: [
      { to: '/purchases', label: 'الفواتير والمدفوعات', icon: CreditCard, title: 'فواتير الشراء' },
      { to: '/lpos', label: 'أوامر الشراء (LPO)', icon: ShoppingCart, title: 'أوامر الشراء' },
      { to: '/suppliers', label: 'الموردون', icon: Truck },
    ],
  },
  {
    label: 'الدليل',
    items: [
      { to: '/contacts', label: 'جهات الاتصال', icon: Phone },
      { to: '/customers', label: 'العملاء', icon: Building2 },
    ],
  },
  {
    label: '',
    items: [
      { to: '/reports', label: 'التقارير والإحصائيات', icon: BarChart2 },
      { to: '/documents', label: 'المستندات', icon: FileArchive },
      { to: '/settings', label: 'الإعدادات', icon: Settings },
    ],
  },
]

// عناوين ثابتة لصفحات لا تظهر في القائمة الجانبية (صفحات الإنشاء)
const EXTRA_TITLES: Record<string, string> = {
  '/quotations/new': 'عرض سعر جديد',
  '/projects/new': 'مشروع جديد',
  '/invoices/new': 'فاتورة جديدة',
  '/receipts/new': 'إيصال جديد',
  '/lpos/new': 'أمر شراء جديد',
  '/purchases/new': 'فاتورة شراء جديدة',
  '/workers/new': 'عامل جديد',
  '/subcontractors/new': 'مقاول باطن جديد',
  '/suppliers/new': 'مورد جديد',
  '/customers/new': 'عميل جديد',
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

// خريطة العنوان المباشر لكل مسار — مبنية آلياً من navGroups (مع تجاوز title) + العناوين الإضافية
const PAGE_TITLES: Record<string, string> = (() => {
  const map: Record<string, string> = {}
  for (const group of navGroups) {
    for (const item of group.items) {
      map[item.to] = item.title ?? item.label
    }
  }
  return { ...map, ...EXTRA_TITLES }
})()

// حلّ عنوان الصفحة الحالية: مطابقة مباشرة ← مسار فرعي ديناميكي ← مطابقة المسار الأب
export function resolvePageTitle(pathname: string): string {
  const exact = PAGE_TITLES[pathname]
  if (exact) return exact

  for (const [fragment, label] of DYNAMIC_TITLES) {
    if (pathname.includes(fragment)) return label
  }

  // مثال: /quotations/123 → عروض الأسعار
  const parent = '/' + pathname.split('/')[1]
  return PAGE_TITLES[parent] ?? ''
}