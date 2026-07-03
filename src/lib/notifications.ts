import { safeSelect } from './supabase'

export type AlertLevel = 'overdue' | 'danger' | 'warning' | 'info'
export type AlertKind = 'cheque' | 'installment' | 'worker_doc' | 'asset_doc' | 'invoice' | 'task' | 'quote'

export interface AppAlert {
  id: string
  kind: AlertKind
  level: AlertLevel
  urgent: boolean        // نبضة: اليوم أو باقي يوم واحد
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

// ═══ منطق المستوى الموحّد حسب نوع الإشعار ═══
// مالي (أقساط/شيكات/فواتير/عروض): عتبات قصيرة (أكثر إلحاحاً)
//   أحمر ≤ 3 | برتقالي ≤ 5 | أصفر ≤ 7
// وثائق (إقامة/بطاقة/جواز/تأمين/استمارة): عتبات أطول (التجديد يحتاج وقت)
//   أحمر ≤ 7 | برتقالي ≤ 15 | أصفر ≤ 30
// فات الموعد = overdue (رمادي حزين) | اليوم أو باقي يوم = urgent (نبضة)

type Track = 'financial' | 'document'

function classify(days: number | null, track: Track): { level: AlertLevel; urgent: boolean } {
  if (days === null) return { level: 'info', urgent: false }
  if (days < 0) return { level: 'overdue', urgent: false }   // فات الموعد
  const urgent = days <= 1                                     // اليوم أو باقي يوم → نبضة
  if (track === 'financial') {
    if (days <= 3) return { level: 'danger', urgent }
    if (days <= 5) return { level: 'warning', urgent }
    return { level: 'info', urgent }                           // ≤ 7
  } else {
    if (days <= 7) return { level: 'danger', urgent }
    if (days <= 15) return { level: 'warning', urgent }
    return { level: 'info', urgent }                           // ≤ 30
  }
}

// عتبة الظهور القصوى لكل مسار
const MAX_FINANCIAL = 7
const MAX_DOCUMENT = 30

// ─── أنواع صفوف الاستعلامات (تحلّ محل الكاست وتلتقط أخطاء أسماء الحقول وقت البناء) ───
interface WorkerRow {
  id: string
  name: string
  name_en: string | null
  visa_expiry: string | null
  cpr_expiry: string | null
  passport_expiry: string | null
  status: string | null
}
interface AssetRow {
  id: string
  name: string
  insurance_expiry: string | null
  registration_expiry: string | null
  payment_method: string | null
  bank_name: string | null
  monthly_installment: number | null
  total_installments: number | null
  paid_installments: number | null
  next_installment_date: string | null
}
interface InvoiceRow {
  id: string
  invoice_number: string
  customer_name: string
  total: number | null
  status: string
  due_date: string | null
}
interface PurchaseInvoiceRow {
  id: string
  supplier_name: string
  amount: number | null
  payment_method: string | null
  check_due_date: string | null
}
interface SubPaymentRow {
  id: string
  amount: number | null
  payment_method: string | null
  check_due_date: string | null
}
interface TaskRow {
  id: string
  title: string
  due_date: string | null
  status: string
}
interface QuoteRow {
  id: string
  quote_number: string
  customer_name: string
  valid_until: string | null
  status: string
  total: number | null
}

// جلب كل التنبيهات من قاعدة البيانات
// كل استعلام يفشل بأمان عبر safeSelect ويعيد [] دون إسقاط بقية التنبيهات
export async function fetchAllAlerts(): Promise<AppAlert[]> {
  const alerts: AppAlert[] = []

  const [workers, assets, invoices, purchaseInvoices, subPayments, tasks, quotes] = await Promise.all([
    safeSelect<WorkerRow>('workers', 'id,name,name_en,visa_expiry,cpr_expiry,passport_expiry,status'),
    safeSelect<AssetRow>('assets', 'id,name,insurance_expiry,registration_expiry,payment_method,bank_name,monthly_installment,total_installments,paid_installments,next_installment_date'),
    safeSelect<InvoiceRow>('invoices', 'id,invoice_number,customer_name,total,status,due_date'),
    safeSelect<PurchaseInvoiceRow>('purchase_invoices', 'id,supplier_name,amount,payment_method,check_due_date'),
    safeSelect<SubPaymentRow>('subcontractor_payments', 'id,amount,payment_method,check_due_date'),
    safeSelect<TaskRow>('tasks', 'id,title,due_date,status'),
    safeSelect<QuoteRow>('quotations', 'id,quote_number,customer_name,valid_until,status,total'),
  ])

  const subtitleDays = (d: number, verb: { past: string; today: string; future: string }) =>
    d < 0 ? `${verb.past} ${Math.abs(d)} يوم` : d === 0 ? verb.today : `${verb.future} ${d} يوم`

  // وثائق العمال
  for (const w of workers) {
    if (w.status === 'inactive') continue
    for (const [label, value, field] of [
      ['الإقامة/التأشيرة', w.visa_expiry, 'visa_expiry'],
      ['البطاقة الذكية', w.cpr_expiry, 'cpr_expiry'],
      ['جواز السفر', w.passport_expiry, 'passport_expiry'],
    ] as const) {
      const d = daysUntil(value)
      if (d !== null && d <= MAX_DOCUMENT) {
        const { level, urgent } = classify(d, 'document')
        alerts.push({
          id: `worker-${w.id}-${field}`,
          kind: 'worker_doc',
          level, urgent,
          title: `${label} — ${w.name}`,
          subtitle: subtitleDays(d, { past: 'منتهية منذ', today: 'تنتهي اليوم', future: 'تنتهي بعد' }),
          date: value,
          daysLeft: d,
          link: `/workers/${w.id}/edit`,
        })
      }
    }
  }

  // وثائق المعدات
  for (const a of assets) {
    for (const [label, value, field] of [
      ['تأمين', a.insurance_expiry, 'insurance_expiry'],
      ['استمارة', a.registration_expiry, 'registration_expiry'],
    ] as const) {
      const d = daysUntil(value)
      if (d !== null && d <= MAX_DOCUMENT) {
        const { level, urgent } = classify(d, 'document')
        alerts.push({
          id: `asset-${a.id}-${field}`,
          kind: 'asset_doc',
          level, urgent,
          title: `${label} ${a.name}`,
          subtitle: subtitleDays(d, { past: 'منتهية منذ', today: 'تنتهي اليوم', future: 'تنتهي بعد' }),
          date: value,
          daysLeft: d,
          link: '/assets',
        })
      }
    }
  }

  // أقساط الأصول (البيكاب والمعدات الممولة بنكياً)
  for (const a of assets) {
    if (a.payment_method === 'installment' && a.next_installment_date) {
      const paid = Number(a.paid_installments) || 0
      const total = Number(a.total_installments) || 0
      const notFullyPaid = total === 0 || paid < total
      if (notFullyPaid) {
        const d = daysUntil(a.next_installment_date)
        if (d !== null && d <= MAX_FINANCIAL) {
          const { level, urgent } = classify(d, 'financial')
          const monthly = Number(a.monthly_installment) || 0
          const bank = a.bank_name || ''
          const remaining = total > 0 ? (total - paid) * monthly : 0
          alerts.push({
            id: `installment-${a.id}`,
            kind: 'installment',
            level, urgent,
            title: `قسط ${a.name}${bank ? ` — ${bank}` : ''}`,
            subtitle: `${subtitleDays(d, { past: 'تأخر', today: 'مستحق اليوم', future: 'بعد' })}${remaining > 0 ? ` • المتبقي ${remaining.toLocaleString('en-US')} د.ب` : ''}`,
            date: a.next_installment_date,
            daysLeft: d,
            amount: monthly,
            link: '/assets',
          })
        }
      }
    }
  }

  // الشيكات الآجلة (موردين)
  for (const p of purchaseInvoices) {
    if (p.payment_method === 'deferred_cheque' && p.check_due_date) {
      const d = daysUntil(p.check_due_date)
      if (d !== null && d <= MAX_FINANCIAL) {
        const { level, urgent } = classify(d, 'financial')
        alerts.push({
          id: `pcheque-${p.id}`,
          kind: 'cheque',
          level, urgent,
          title: `شيك مستحق — ${p.supplier_name}`,
          subtitle: subtitleDays(d, { past: 'تأخر', today: 'مستحق اليوم', future: 'بعد' }),
          date: p.check_due_date,
          daysLeft: d,
          amount: Number(p.amount) || 0,
          link: '/purchases',
        })
      }
    }
  }

  // الشيكات الآجلة (مقاولو الباطن)
  for (const s of subPayments) {
    if (s.payment_method === 'cheque' && s.check_due_date) {
      const d = daysUntil(s.check_due_date)
      if (d !== null && d <= MAX_FINANCIAL) {
        const { level, urgent } = classify(d, 'financial')
        alerts.push({
          id: `scheque-${s.id}`,
          kind: 'cheque',
          level, urgent,
          title: 'شيك مقاول باطن مستحق',
          subtitle: subtitleDays(d, { past: 'تأخر', today: 'مستحق اليوم', future: 'بعد' }),
          date: s.check_due_date,
          daysLeft: d,
          amount: Number(s.amount) || 0,
          link: '/subcontractors',
        })
      }
    }
  }

  // الفواتير غير المدفوعة المتأخرة
  for (const inv of invoices) {
    if (inv.status !== 'paid' && inv.due_date) {
      const d = daysUntil(inv.due_date)
      if (d !== null && d <= MAX_FINANCIAL) {
        const { level, urgent } = classify(d, 'financial')
        alerts.push({
          id: `invoice-${inv.id}`,
          kind: 'invoice',
          level, urgent,
          title: `فاتورة ${inv.invoice_number} — ${inv.customer_name}`,
          subtitle: subtitleDays(d, { past: 'متأخرة', today: 'تستحق اليوم', future: 'تستحق بعد' }),
          date: inv.due_date,
          daysLeft: d,
          amount: Number(inv.total) || 0,
          link: `/invoices/${inv.id}/view`,
        })
      }
    }
  }

  // المهام المتأخرة أو القريبة
  for (const t of tasks) {
    if (t.status !== 'done' && t.due_date) {
      const d = daysUntil(t.due_date)
      if (d !== null && d <= MAX_FINANCIAL) {
        const { level, urgent } = classify(d, 'financial')
        alerts.push({
          id: `task-${t.id}`,
          kind: 'task',
          level, urgent,
          title: `مهمة: ${t.title}`,
          subtitle: subtitleDays(d, { past: 'متأخرة', today: 'مستحقة اليوم', future: 'بعد' }),
          date: t.due_date,
          daysLeft: d,
          link: '/tasks',
        })
      }
    }
  }

  // عروض الأسعار القريبة من الانتهاء (مُرسلة ولم يُرد عليها)
  for (const q of quotes) {
    if (q.status === 'sent' && q.valid_until) {
      const d = daysUntil(q.valid_until)
      if (d !== null && d <= MAX_FINANCIAL) {
        const { level, urgent } = classify(d, 'financial')
        alerts.push({
          id: `quote-${q.id}`,
          kind: 'quote',
          level, urgent,
          title: `عرض ${q.quote_number} — ${q.customer_name}`,
          subtitle: subtitleDays(d, { past: 'انتهت صلاحيته منذ', today: 'ينتهي اليوم', future: 'ينتهي بعد' }),
          date: q.valid_until,
          daysLeft: d,
          amount: Number(q.total) || 0,
          link: `/quotations/${q.id}`,
        })
      }
    }
  }

  // ═══ الترتيب حسب درجة اللون والإلحاح ═══
  // 1. متأخر (overdue) أولاً — مشكلة قائمة تحتاج حل فوري
  // 2. أحمر نابض (urgent) — اليوم/باقي يوم
  // 3. أحمر (danger)
  // 4. برتقالي (warning)
  // 5. أصفر (info)
  // داخل كل فئة: الأقرب موعداً أولاً
  const rank = (a: AppAlert): number => {
    if (a.level === 'overdue') return 0
    if (a.urgent) return 1
    if (a.level === 'danger') return 2
    if (a.level === 'warning') return 3
    return 4
  }
  alerts.sort((a, b) => {
    const ra = rank(a), rb = rank(b)
    if (ra !== rb) return ra - rb
    return (a.daysLeft ?? 999) - (b.daysLeft ?? 999)
  })

  return alerts
}