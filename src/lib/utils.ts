import { format, parseISO, differenceInDays, differenceInMonths } from 'date-fns'
import { ar } from 'date-fns/locale'

// ═══════════════════════════════════════════
//  تنسيق التاريخ
// ═══════════════════════════════════════════
export function formatDate(date: string | null | undefined, pattern = 'dd/MM/yyyy'): string {
  if (!date) return ''
  try {
    return format(parseISO(date), pattern, { locale: ar })
  } catch {
    return date
  }
}

export function formatDateTime(date: string | null | undefined): string {
  if (!date) return ''
  try {
    return format(parseISO(date), 'dd/MM/yyyy - hh:mm a', { locale: ar })
  } catch {
    return date
  }
}

// ═══════════════════════════════════════════
//  العملة — دينار بحريني بدون أصفار زائدة
//  150.000 → "150 د.ب"   |   150.5 → "150.500 د.ب"
// ═══════════════════════════════════════════
export function formatCurrency(amount: number | null | undefined, suffix = 'د.ب'): string {
  const num = Number(amount ?? 0)
  if (isNaN(num)) return `0 ${suffix}`
  const negative = num < 0
  const abs = Math.abs(num)
  // 3 خانات ثم حذف الأصفار الزائدة من اليمين
  const trimmed = abs.toFixed(3).replace(/\.?0+$/, '')
  const [intPart, decPart] = trimmed.split('.')
  const formattedInt = parseInt(intPart, 10).toLocaleString('en-US')
  const result = decPart ? `${formattedInt}.${decPart}` : formattedInt
  return `${negative ? '-' : ''}${result} ${suffix}`
}

// رقم فقط بدون عملة (للحقول والإدخال)
export function formatNumber(amount: number | null | undefined): string {
  const num = Number(amount ?? 0)
  if (isNaN(num)) return '0'
  const trimmed = Math.abs(num).toFixed(3).replace(/\.?0+$/, '')
  const [intPart, decPart] = trimmed.split('.')
  const formattedInt = parseInt(intPart, 10).toLocaleString('en-US')
  const sign = num < 0 ? '-' : ''
  return decPart ? `${sign}${formattedInt}.${decPart}` : `${sign}${formattedInt}`
}

// ═══════════════════════════════════════════
//  تحويل الرقم إلى كلمات (تفقيط) بالدينار
// ═══════════════════════════════════════════
export function tafqit(amount: number): string {
  const num = Math.floor(Math.abs(amount))
  const fils = Math.round((Math.abs(amount) - num) * 1000)
  if (num === 0 && fils === 0) return 'صفر دينار'

  const ones = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة',
    'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر',
    'سبعة عشر', 'ثمانية عشر', 'تسعة عشر']
  const tens = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون']
  const hundreds = ['', 'مائة', 'مئتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة']

  const threeDigits = (n: number): string => {
    let s = ''
    const h = Math.floor(n / 100)
    const rest = n % 100
    if (h > 0) s += hundreds[h]
    if (rest > 0) {
      if (s) s += ' و'
      if (rest < 20) s += ones[rest]
      else {
        const t = Math.floor(rest / 10)
        const o = rest % 10
        if (o > 0) s += ones[o] + ' و' + tens[t]
        else s += tens[t]
      }
    }
    return s
  }

  let words = ''
  const millions = Math.floor(num / 1_000_000)
  const thousands = Math.floor((num % 1_000_000) / 1000)
  const remainder = num % 1000

  if (millions > 0) {
    words += millions === 1 ? 'مليون' : millions === 2 ? 'مليونان' : threeDigits(millions) + ' مليون'
  }
  if (thousands > 0) {
    if (words) words += ' و'
    words += thousands === 1 ? 'ألف' : thousands === 2 ? 'ألفان' : threeDigits(thousands) + ' ألف'
  }
  if (remainder > 0) {
    if (words) words += ' و'
    words += threeDigits(remainder)
  }

  let result = words + ' دينار'
  if (fils > 0) result += ' و' + threeDigits(fils) + ' فلس'
  return result + ' لا غير'
}

// ═══════════════════════════════════════════
//  تسلسل الأرقام (فواتير، أوامر شراء)
// ═══════════════════════════════════════════
export function nextSerial(existingNumbers: string[], seed: number): string {
  const nums = existingNumbers
    .map(n => parseInt(String(n).replace(/\D/g, ''), 10))
    .filter(n => !isNaN(n))
  const max = nums.length > 0 ? Math.max(...nums) : seed - 1
  return String(Math.max(max, seed - 1) + 1)
}

// ═══════════════════════════════════════════
//  دمج أصناف CSS
// ═══════════════════════════════════════════
export function clsx(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}

// ═══════════════════════════════════════════
//  حساب مكافأة نهاية الخدمة (قانون عمل البحرين)
//  أول 3 سنوات: نصف راتب/سنة | بعدها: راتب كامل/سنة
// ═══════════════════════════════════════════
export function calcEndOfService(basicSalary: number, joinDate: string, endDate?: string): number {
  if (!joinDate || !basicSalary) return 0
  try {
    const start = parseISO(joinDate)
    const end = endDate ? parseISO(endDate) : new Date()
    const months = differenceInMonths(end, start)
    if (months <= 0) return 0
    const years = months / 12
    if (years <= 3) return (basicSalary / 2) * years
    return (basicSalary / 2) * 3 + basicSalary * (years - 3)
  } catch {
    return 0
  }
}

// ═══════════════════════════════════════════
//  حساب أيام الإجازة المستحقة حتى الآن
// ═══════════════════════════════════════════
export function calcAccruedLeave(annualDays: number, joinDate: string): number {
  if (!joinDate) return 0
  try {
    const months = differenceInMonths(new Date(), parseISO(joinDate))
    return Math.min((annualDays / 12) * months, annualDays)
  } catch {
    return 0
  }
}

// ═══════════════════════════════════════════
//  الأيام المتبقية حتى تاريخ معيّن (للتنبيهات)
// ═══════════════════════════════════════════
export function daysUntil(dateStr: string | null | undefined): number {
  if (!dateStr) return 9999
  try {
    const target = parseISO(dateStr)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return differenceInDays(target, today)
  } catch {
    return 9999
  }
}

// مستوى التنبيه حسب الأيام المتبقية
export type AlertLevel = 'critical' | 'warning' | 'notice' | 'ok'
export function alertLevel(days: number): AlertLevel {
  if (days < 0) return 'critical'
  if (days <= 7) return 'critical'
  if (days <= 14) return 'warning'
  if (days <= 30) return 'notice'
  return 'ok'
}

export const alertStyles: Record<AlertLevel, { bg: string; border: string; text: string; badge: string }> = {
  critical: { bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-700',    badge: 'bg-red-100 text-red-800' },
  warning:  { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', badge: 'bg-orange-100 text-orange-800' },
  notice:   { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', badge: 'bg-yellow-100 text-yellow-800' },
  ok:       { bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-700',  badge: 'bg-green-100 text-green-800' },
}

// ═══════════════════════════════════════════
//  فتح واتساب برسالة جاهزة
// ═══════════════════════════════════════════
export function openWhatsApp(phone: string, message: string) {
  const cleaned = phone.replace(/\D/g, '')
  let number = cleaned
  if (number.startsWith('00')) number = number.slice(2)
  if (number.length === 8) number = '973' + number  // إضافة مفتاح البحرين تلقائياً
  window.open(`https://wa.me/${number}?text=${encodeURIComponent(message)}`, '_blank')
}

// ═══════════════════════════════════════════
//  فتح الإيميل برسالة جاهزة
// ═══════════════════════════════════════════
export function openEmail(to: string, subject: string, body: string) {
  window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

// ═══════════════════════════════════════════
//  تخصصات المقاولين من الباطن
// ═══════════════════════════════════════════
export const subcontractorSpecialtyLabel: Record<string, string> = {
  excavation: 'حفر وترسية',
  electrical: 'كهرباء',
  plumbing: 'سباكة',
  finishing: 'تشطيبات (صبغ / جبس)',
  tiles: 'بلاط وسيراميك',
  other: 'أخرى',
}

export const subcontractorSpecialtyColor: Record<string, string> = {
  excavation: 'bg-amber-100 text-amber-800',
  electrical: 'bg-yellow-100 text-yellow-800',
  plumbing: 'bg-blue-100 text-blue-800',
  finishing: 'bg-purple-100 text-purple-800',
  tiles: 'bg-green-100 text-green-800',
  other: 'bg-slate-100 text-slate-700',
}