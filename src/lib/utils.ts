import { format, parseISO, differenceInDays, differenceInMonths } from 'date-fns'
import { ar } from 'date-fns/locale'
import type { InvoiceStatus, LPOStatus } from '../types'

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

// تاريخ نسبي مختصر (منذ كم) — مفيد للسجلات والنشاطات
export function timeAgo(date: string | null | undefined): string {
  if (!date) return ''
  try {
    const d = parseISO(date)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const mins = Math.floor(diffMs / 60000)
    if (mins < 1) return 'الآن'
    if (mins < 60) return `قبل ${mins} دقيقة`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `قبل ${hours} ساعة`
    const days = Math.floor(hours / 24)
    if (days < 30) return `قبل ${days} يوم`
    const months = Math.floor(days / 30)
    if (months < 12) return `قبل ${months} شهر`
    return `قبل ${Math.floor(months / 12)} سنة`
  } catch {
    return formatDate(date)
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
  const trimmed = abs.toFixed(3).replace(/\.?0+$/, '')
  const [intPart, decPart] = trimmed.split('.')
  const formattedInt = parseInt(intPart, 10).toLocaleString('en-US')
  const result = decPart ? `${formattedInt}.${decPart}` : formattedInt
  return `${negative ? '-' : ''}${result} ${suffix}`
}

// نسخة إنجليزية (للتوافق مع الصفحات القديمة)
export function formatCurrencyEn(amount: number | null | undefined, suffix = 'BHD'): string {
  return formatCurrency(amount, suffix)
}

// رقم فقط بدون عملة
export function formatNumber(amount: number | null | undefined): string {
  const num = Number(amount ?? 0)
  if (isNaN(num)) return '0'
  const trimmed = Math.abs(num).toFixed(3).replace(/\.?0+$/, '')
  const [intPart, decPart] = trimmed.split('.')
  const formattedInt = parseInt(intPart, 10).toLocaleString('en-US')
  const sign = num < 0 ? '-' : ''
  return decPart ? `${sign}${formattedInt}.${decPart}` : `${sign}${formattedInt}`
}

// نسبة مئوية منسّقة — لعرض هوامش الربح والإنجاز
export function formatPercent(value: number | null | undefined, decimals = 1): string {
  const num = Number(value ?? 0)
  if (isNaN(num)) return '0%'
  return `${num.toFixed(decimals).replace(/\.?0+$/, '')}%`
}

// حجم الملف بصيغة مقروءة — لنظام حفظ المستندات
export function formatFileSize(bytes: number | null | undefined): string {
  const b = Number(bytes ?? 0)
  if (b <= 0) return '0 ب'
  const units = ['ب', 'ك.ب', 'م.ب', 'غ.ب']
  const i = Math.floor(Math.log(b) / Math.log(1024))
  const size = b / Math.pow(1024, i)
  return `${size.toFixed(size >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
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
//  حالات الفاتورة
// ═══════════════════════════════════════════
export const invoiceStatusLabel: Record<InvoiceStatus, string> = {
  draft: 'مسودة',
  sent: 'مرسلة',
  paid: 'مدفوعة',
  overdue: 'متأخرة',
  cancelled: 'ملغاة',
}

export const invoiceStatusColor: Record<InvoiceStatus, string> = {
  draft: 'bg-slate-100 text-slate-700',
  sent: 'bg-blue-100 text-blue-700',
  paid: 'bg-green-100 text-green-700',
  overdue: 'bg-red-100 text-red-700',
  cancelled: 'bg-orange-100 text-orange-700',
}

// ═══════════════════════════════════════════
//  حالات أوامر الشراء
// ═══════════════════════════════════════════
export const lpoStatusLabel: Record<LPOStatus, string> = {
  draft: 'مسودة',
  sent: 'مرسل',
  approved: 'موافق عليه',
  received: 'مستلم',
  cancelled: 'ملغى',
}

export const lpoStatusColor: Record<LPOStatus, string> = {
  draft: 'bg-slate-100 text-slate-700',
  sent: 'bg-blue-100 text-blue-700',
  approved: 'bg-purple-100 text-purple-700',
  received: 'bg-green-100 text-green-700',
  cancelled: 'bg-orange-100 text-orange-700',
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

// ═══════════════════════════════════════════
//  ضريبة القيمة المضافة على المشتريات (قابلة للاسترداد)
//  ملاحظة: البناء الجديد معفى من الضريبة على المبيعات،
//  لكن نشتري من الموردين بضريبة 10% ونستردها ربع سنوياً
// ═══════════════════════════════════════════
export const BAHRAIN_VAT_RATE = 10

// استخراج مبلغ الضريبة من مبلغ شامل للضريبة
// مثال: فاتورة 110 شاملة → الضريبة = 10، الصافي = 100
export function extractVAT(grossAmount: number, rate = BAHRAIN_VAT_RATE): { net: number; vat: number } {
  const gross = Number(grossAmount) || 0
  const net = gross / (1 + rate / 100)
  const vat = gross - net
  return {
    net: Math.round(net * 1000) / 1000,
    vat: Math.round(vat * 1000) / 1000,
  }
}

// حساب الضريبة المضافة على مبلغ صافٍ
// مثال: 100 + ضريبة → الضريبة = 10، الإجمالي = 110
export function addVAT(netAmount: number, rate = BAHRAIN_VAT_RATE): { vat: number; gross: number } {
  const net = Number(netAmount) || 0
  const vat = Math.round((net * rate / 100) * 1000) / 1000
  return { vat, gross: Math.round((net + vat) * 1000) / 1000 }
}

// تحديد الربع الضريبي لتاريخ معيّن (للإقرار ربع السنوي)
// يُرجع مثل: "الربع الأول 2026" مع نطاق التواريخ
export function taxQuarter(dateStr: string | null | undefined): { quarter: number; year: number; label: string; from: string; to: string } | null {
  if (!dateStr) return null
  try {
    const d = parseISO(dateStr)
    const month = d.getMonth() // 0-11
    const year = d.getFullYear()
    const quarter = Math.floor(month / 3) + 1
    const names = ['الأول', 'الثاني', 'الثالث', 'الرابع']
    const fromMonth = (quarter - 1) * 3
    const from = `${year}-${String(fromMonth + 1).padStart(2, '0')}-01`
    const toMonthLast = new Date(year, fromMonth + 3, 0)
    const to = `${year}-${String(fromMonth + 3).padStart(2, '0')}-${String(toMonthLast.getDate()).padStart(2, '0')}`
    return { quarter, year, label: `الربع ${names[quarter - 1]} ${year}`, from, to }
  } catch {
    return null
  }
}

// ═══════════════════════════════════════════
//  حساب مكافأة نهاية الخدمة (قانون عمل البحرين)
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
//  تنظيف رقم الهاتف البحريني وتوحيده
// ═══════════════════════════════════════════
function normalizeBahrainPhone(phone: string): string {
  let n = phone.replace(/\D/g, '')
  if (n.startsWith('00973')) n = n.slice(5)
  else if (n.startsWith('00')) n = n.slice(2)
  else if (n.startsWith('973') && n.length === 11) n = n.slice(3)
  if (n.length === 8) n = '973' + n   // رقم بحريني محلي
  return n
}

// ═══════════════════════════════════════════
//  فتح واتساب برسالة جاهزة
// ═══════════════════════════════════════════
export function openWhatsApp(phone: string, message: string) {
  const number = normalizeBahrainPhone(phone)
  window.open(`https://wa.me/${number}?text=${encodeURIComponent(message)}`, '_blank')
}

// ═══════════════════════════════════════════
//  فتح الإيميل برسالة جاهزة
//  (window.open بدل location.href حتى لا يكسر تنقّل التطبيق)
// ═══════════════════════════════════════════
export function openEmail(to: string, subject: string, body: string) {
  const link = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  window.open(link, '_blank')
}