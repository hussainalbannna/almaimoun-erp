import {
  LayoutDashboard, FileText, ShoppingCart, Users, Building2,
  Settings, FileArchive, HardHat, Receipt, UserCog,
  ClipboardList, BookOpen, Truck, BarChart2, Phone, CreditCard,
  Bot, Calendar, Bell, Calculator, Wrench, ListTodo, PieChart, Package, KeyRound, Banknote,
  type LucideIcon,
} from 'lucide-react'

// ════════════════════════════════════════════════════════════════════
//  مصدر الحقيقة الموحّد للتنقّل وعناوين الصفحات
//
//  كانت قائمة الشريط الجانبي (navGroups) وخريطة عناوين الهيدر
//  (PAGE_TITLES) معرَّفتين في ملفين منفصلين، فأي مسار جديد يتطلب
//  تعديل الاثنين — ونسيان أحدهما يُنتج عنواناً فارغاً (كما حدث
//  فعلياً مع صفحة الإيجارات). هنا يُعرَّف كل مسار مرة واحدة:
//  تسميته في القائمة، وعنوانه في الهيدر (إن اختلف)، وأيقونته.
// ════════════════════════════════════════════════════════════════════

export interface NavItem {
  to: string
  /** التسمية الظاهرة في الشريط الجانبي */
  label: string
  /** عنوان الصفحة في الهيدر — إن لم يُحدَّد تُستخدم التسمية نفسها */
  pageTitle?: string
  icon: LucideIcon
  /** مطابقة تامّة للمسار (للوحة التحكم فقط حتى لا تبقى نشطة في كل الصفحات) */
  end?: boolean
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
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
      { to: '/projects', label: 'المشاريع والمراحل', pageTitle: 'المشاريع', icon: HardHat },
      { to: '/daily-logs', label: 'تقارير الموقع وأوامر التغيير', pageTitle: 'تقارير الموقع', icon: ClipboardList },
      { to: '/assets', label: 'الأصول والمعدات', icon: Package },
      { to: '/rentals', label: 'الإيجارات والمصاريف', icon: KeyRound },
    ],
  },
  {
    label: 'الموارد البشرية',
    items: [
      { to: '/workers', label: 'العمالة والسجلات', pageTitle: 'العمالة', icon: Users },
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
      { to: '/purchases', label: 'الفواتير والمدفوعات', pageTitle: 'فواتير الشراء', icon: CreditCard },
      { to: '/lpos', label: 'أوامر الشراء (LPO)', pageTitle: 'أوامر الشراء', icon: ShoppingCart },
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

// عناوين المسارات التي لا تظهر في الشريط الجانبي (صفحات الإنشاء)
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

// خريطة العناوين المبنية تلقائياً من القائمة الجانبية + صفحات الإنشاء —
// أي مسار جديد يُضاف في NAV_GROUPS يحصل على عنوانه في الهيدر تلقائياً
const PAGE_TITLES: Record<string, string> = {
  ...Object.fromEntries(
    NAV_GROUPS.flatMap(g => g.items).map(item => [item.to, item.pageTitle ?? item.label]),
  ),
  ...EXTRA_TITLES,
}

/** حلّ عنوان الصفحة: مطابقة مباشرة ← مسار فرعي ديناميكي ← مطابقة المسار الأب */
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