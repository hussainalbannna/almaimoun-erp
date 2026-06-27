import { format, parseISO } from 'date-fns'
import { ar } from 'date-fns/locale'
import type { InvoiceStatus, LPOStatus } from '../types'

export function formatDate(date: string | null | undefined, pattern = 'dd/MM/yyyy'): string {
  if (!date) return ''
  try {
    return format(parseISO(date), pattern, { locale: ar })
  } catch {
    return date
  }
}

export function formatCurrency(amount: number, currency = 'BHD'): string {
  return `${Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ${currency}`
}

export function formatCurrencyEn(amount: number, currency = 'BHD'): string {
  return `${Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ${currency}`
}

// Returns the next sequential number from existing records
// Seeds: invoices start at 184, LPOs start at 1036
export function nextSerial(existingNumbers: string[], seed: number): string {
  const nums = existingNumbers
    .map(n => parseInt(n.replace(/\D/g, ''), 10))
    .filter(n => !isNaN(n))
  const max = nums.length > 0 ? Math.max(...nums) : seed - 1
  return String(Math.max(max, seed - 1) + 1)
}

export function clsx(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}

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

export function openWhatsApp(phone: string, message: string) {
  const cleaned = phone.replace(/\D/g, '')
  const number = cleaned.startsWith('00') ? cleaned.slice(2) : cleaned
  const url = `https://wa.me/${number}?text=${encodeURIComponent(message)}`
  window.open(url, '_blank')
}

export function openEmail(to: string, subject: string, body: string) {
  const url = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  window.location.href = url
}
