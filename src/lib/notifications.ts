import { supabase } from './supabase'

export type AlertLevel = 'danger' | 'warning' | 'info'
export type AlertKind = 'cheque' | 'worker_doc' | 'asset_doc' | 'invoice' | 'task' | 'quote'

export interface AppAlert {
  id: string
  kind: AlertKind
  level: AlertLevel
  title: string
  subtitle: string
  date: string | null
  daysLeft: number | null
  amount?: number
  link?: string
}

// عدد الأيام حتى تاريخ (سالب = منتهٍ/متأخر)
export function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  const target = new Date(dateStr)
  if (isNaN(target.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86400000)
}

function levelByDays(days: number | null, warnAt = 30): AlertLevel {
  if (days === null) return 'info'
  if (days < 0) return 'danger'
  if (days <= 7) return 'danger'
  if (days <= warnAt) return 'warning'
  return 'info'
}

// جلب كل التنبيهات من قاعدة البيانات
export async function fetchAllAlerts(): Promise<AppAlert[]> {
  const alerts: AppAlert[] = []

  const safe = async <T>(p: PromiseLike<{ data: T[] | null }>): Promise<T[]> => {
    try { const { data } = await p; return data ?? [] } catch { return [] }
  }

  const [workers, assets, invoices, purchaseInvoices, subPayments, tasks, quotes] = await Promise.all([
    safe(supabase.from('workers').select('id,name,visa_expiry,cpr_expiry,passport_expiry,status')),
    safe(supabase.from('assets').select('id,name,insurance_expiry,registration_expiry')),
    safe(supabase.from('invoices').select('id,invoice_number,customer_name,total,status,due_date')),
    safe(supabase.from('purchase_invoices').select('id,supplier_name,amount,payment_method,check_due_date')),
    safe(supabase.from('subcontractor_payments').select('id,amount,payment_method,check_due_date')),
    safe(supabase.from('tasks').select('id,title,due_date,status')),
    safe(supabase.from('quotations').select('id,quote_number,customer_name,valid_until,status,total')),
  ])

  // وثائق العمال
  for (const w of workers as Record<string, unknown>[]) {
    if (w.status === 'inactive') continue
    for (const [label, field] of [['الإقامة/التأشيرة', 'visa_expiry'], ['البطاقة الذكية', 'cpr_expiry'], ['جواز السفر', 'passport_expiry']] as const) {
      const d = daysUntil(w[field] as string)
      if (d !== null && d <= 45) {
        alerts.push({
          id: `worker-${w.id}-${field}`,
          kind: 'worker_doc',
          level: levelByDays(d, 45),
          title: `${label} — ${w.name}`,
          subtitle: d < 0 ? `منتهية منذ ${Math.abs(d)} يوم` : d === 0 ? 'تنتهي اليوم' : `تنتهي بعد ${d} يوم`,
          date: w[field] as string,
          daysLeft: d,
          link: `/workers/${w.id}/edit`,
        })
      }
    }
  }

  // وثائق المعدات
  for (const a of assets as Record<string, unknown>[]) {
    for (const [label, field] of [['تأمين', 'insurance_expiry'], ['استمارة', 'registration_expiry']] as const) {
      const d = daysUntil(a[field] as string)
      if (d !== null && d <= 45) {
        alerts.push({
          id: `asset-${a.id}-${field}`,
          kind: 'asset_doc',
          level: levelByDays(d, 45),
          title: `${label} ${a.name}`,
          subtitle: d < 0 ? `منتهية منذ ${Math.abs(d)} يوم` : d === 0 ? 'تنتهي اليوم' : `تنتهي بعد ${d} يوم`,
          date: a[field] as string,
          daysLeft: d,
          link: '/assets',
        })
      }
    }
  }

  // الشيكات الآجلة (موردين)
  for (const p of purchaseInvoices as Record<string, unknown>[]) {
    if (p.payment_method === 'deferred_cheque' && p.check_due_date) {
      const d = daysUntil(p.check_due_date as string)
      if (d !== null && d <= 30) {
        alerts.push({
          id: `pcheque-${p.id}`,
          kind: 'cheque',
          level: levelByDays(d, 30),
          title: `شيك مستحق — ${p.supplier_name}`,
          subtitle: d < 0 ? `تأخر ${Math.abs(d)} يوم` : d === 0 ? 'مستحق اليوم' : `بعد ${d} يوم`,
          date: p.check_due_date as string,
          daysLeft: d,
          amount: Number(p.amount) || 0,
          link: '/purchases',
        })
      }
    }
  }

  // الشيكات الآجلة (مقاولو الباطن)
  for (const s of subPayments as Record<string, unknown>[]) {
    if (s.payment_method === 'cheque' && s.check_due_date) {
      const d = daysUntil(s.check_due_date as string)
      if (d !== null && d <= 30) {
        alerts.push({
          id: `scheque-${s.id}`,
          kind: 'cheque',
          level: levelByDays(d, 30),
          title: 'شيك مقاول باطن مستحق',
          subtitle: d < 0 ? `تأخر ${Math.abs(d)} يوم` : d === 0 ? 'مستحق اليوم' : `بعد ${d} يوم`,
          date: s.check_due_date as string,
          daysLeft: d,
          amount: Number(s.amount) || 0,
          link: '/subcontractors',
        })
      }
    }
  }

  // الفواتير غير المدفوعة المتأخرة
  for (const inv of invoices as Record<string, unknown>[]) {
    if (inv.status !== 'paid' && inv.due_date) {
      const d = daysUntil(inv.due_date as string)
      if (d !== null && d <= 14) {
        alerts.push({
          id: `invoice-${inv.id}`,
          kind: 'invoice',
          level: levelByDays(d, 14),
          title: `فاتورة ${inv.invoice_number} — ${inv.customer_name}`,
          subtitle: d < 0 ? `متأخرة ${Math.abs(d)} يوم` : d === 0 ? 'تستحق اليوم' : `تستحق بعد ${d} يوم`,
          date: inv.due_date as string,
          daysLeft: d,
          amount: Number(inv.total) || 0,
          link: `/invoices/${inv.id}/view`,
        })
      }
    }
  }

  // المهام المتأخرة أو القريبة
  for (const t of tasks as Record<string, unknown>[]) {
    if (t.status !== 'done' && t.due_date) {
      const d = daysUntil(t.due_date as string)
      if (d !== null && d <= 3) {
        alerts.push({
          id: `task-${t.id}`,
          kind: 'task',
          level: d < 0 ? 'danger' : d <= 1 ? 'warning' : 'info',
          title: `مهمة: ${t.title}`,
          subtitle: d < 0 ? `متأخرة ${Math.abs(d)} يوم` : d === 0 ? 'مستحقة اليوم' : `بعد ${d} يوم`,
          date: t.due_date as string,
          daysLeft: d,
          link: '/tasks',
        })
      }
    }
  }

  // عروض الأسعار القريبة من الانتهاء (مُرسلة ولم يُرد عليها)
  for (const q of quotes as Record<string, unknown>[]) {
    if (q.status === 'sent' && q.valid_until) {
      const d = daysUntil(q.valid_until as string)
      if (d !== null && d <= 7) {
        alerts.push({
          id: `quote-${q.id}`,
          kind: 'quote',
          level: d < 0 ? 'danger' : 'warning',
          title: `عرض ${q.quote_number} — ${q.customer_name}`,
          subtitle: d < 0 ? `انتهت صلاحيته منذ ${Math.abs(d)} يوم` : d === 0 ? 'ينتهي اليوم' : `ينتهي بعد ${d} يوم`,
          date: q.valid_until as string,
          daysLeft: d,
          amount: Number(q.total) || 0,
          link: `/quotations/${q.id}`,
        })
      }
    }
  }

  // ترتيب: الأخطر أولاً، ثم الأقرب موعداً
  const order: Record<AlertLevel, number> = { danger: 0, warning: 1, info: 2 }
  alerts.sort((a, b) => {
    if (order[a.level] !== order[b.level]) return order[a.level] - order[b.level]
    return (a.daysLeft ?? 999) - (b.daysLeft ?? 999)
  })

  return alerts
}