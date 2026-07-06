import { supabase } from './supabase'

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

// جلب كل التنبيهات من قاعدة البيانات
export async function fetchAllAlerts(): Promise<AppAlert[]> {
  const alerts: AppAlert[] = []

  // دالة معرّفة (لا سهمية) لتفادي أي التباس بين <T> وJSX في أي سياق
  async function safe<T>(p: PromiseLike<{ data: T[] | null }>): Promise<T[]> {
    try { const { data } = await p; return data ?? [] } catch { return [] }
  }

  const [workers, assets, invoices, cheques, tasks, quotes] = await Promise.all([
    safe(supabase.from('workers').select('id,name,name_en,visa_expiry,cpr_expiry,passport_expiry,status')),
    safe(supabase.from('assets').select('id,name,insurance_expiry,registration_expiry,payment_method,bank_name,monthly_installment,total_installments,paid_installments,next_installment_date')),
    safe(supabase.from('invoices').select('id,invoice_number,customer_name,total,status,due_date')),
    // الشيكات من مصدرها الرسمي (جدول cheques) — حالتها تُحدَّث عند الصرف في مركز الشيكات
    safe(supabase.from('cheques').select('id,party_name,amount,due_date,status,cheque_type,direction')),
    safe(supabase.from('tasks').select('id,title,due_date,status')),
    safe(supabase.from('quotations').select('id,quote_number,customer_name,valid_until,status,total')),
  ])

  const subtitleDays = (d: number, verb: { past: string; today: string; future: string }) =>
    d < 0 ? `${verb.past} ${Math.abs(d)} يوم` : d === 0 ? verb.today : `${verb.future} ${d} يوم`

  // وثائق العمال
  for (const w of workers as Record<string, unknown>[]) {
    if (w.status === 'inactive') continue
    for (const [label, field] of [['الإقامة/التأشيرة', 'visa_expiry'], ['البطاقة الذكية', 'cpr_expiry'], ['جواز السفر', 'passport_expiry']] as const) {
      const d = daysUntil(w[field] as string)
      if (d !== null && d <= MAX_DOCUMENT) {
        const { level, urgent } = classify(d, 'document')
        alerts.push({
          id: `worker-${w.id}-${field}`,
          kind: 'worker_doc',
          level, urgent,
          title: `${label} — ${w.name}`,
          subtitle: subtitleDays(d, { past: 'منتهية منذ', today: 'تنتهي اليوم', future: 'تنتهي بعد' }),
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
      if (d !== null && d <= MAX_DOCUMENT) {
        const { level, urgent } = classify(d, 'document')
        alerts.push({
          id: `asset-${a.id}-${field}`,
          kind: 'asset_doc',
          level, urgent,
          title: `${label} ${a.name}`,
          subtitle: subtitleDays(d, { past: 'منتهية منذ', today: 'تنتهي اليوم', future: 'تنتهي بعد' }),
          date: a[field] as string,
          daysLeft: d,
          link: '/assets',
        })
      }
    }
  }

  // أقساط الأصول (البيكاب والمعدات الممولة بنكياً)
  for (const a of assets as Record<string, unknown>[]) {
    if (a.payment_method === 'installment' && a.next_installment_date) {
      const paid = Number(a.paid_installments) || 0
      const total = Number(a.total_installments) || 0
      const notFullyPaid = total === 0 || paid < total
      if (notFullyPaid) {
        const d = daysUntil(a.next_installment_date as string)
        if (d !== null && d <= MAX_FINANCIAL) {
          const { level, urgent } = classify(d, 'financial')
          const monthly = Number(a.monthly_installment) || 0
          const bank = (a.bank_name as string) || ''
          const remaining = total > 0 ? (total - paid) * monthly : 0
          alerts.push({
            id: `installment-${a.id}`,
            kind: 'installment',
            level, urgent,
            title: `قسط ${a.name}${bank ? ` — ${bank}` : ''}`,
            subtitle: `${subtitleDays(d, { past: 'تأخر', today: 'مستحق اليوم', future: 'بعد' })}${remaining > 0 ? ` • المتبقي ${remaining.toLocaleString('en-US')} د.ب` : ''}`,
            date: a.next_installment_date as string,
            daysLeft: d,
            amount: monthly,
            link: '/assets',
          })
        }
      }
    }
  }

  // ═══ الشيكات — من جدول cheques (المصدر الرسمي للحالة) ═══
  // المعلّقة فقط (pending). المصروف (cleared) والمرتد (bounced) لا يظهر.
  // شيكات الضمان مستبعدة لأنها ليست دفعة مستحقة على موعد.
  for (const c of cheques as Record<string, unknown>[]) {
    if (c.status !== 'pending') continue
    if (c.cheque_type === 'guarantee') continue
    if (!c.due_date) continue
    const d = daysUntil(c.due_date as string)
    if (d === null || d > MAX_FINANCIAL) continue
    const { level, urgent } = classify(d, 'financial')
    const incoming = c.direction === 'incoming'
    const party = (c.party_name as string) || ''
    alerts.push({
      id: `cheque-${c.id}`,
      kind: 'cheque',
      level, urgent,
      title: incoming ? `شيك وارد${party ? ` — ${party}` : ''}` : `شيك مستحق${party ? ` — ${party}` : ''}`,
      subtitle: subtitleDays(d, incoming
        ? { past: 'تأخر إيداعه', today: 'يُودع اليوم', future: 'يُودع بعد' }
        : { past: 'تأخر', today: 'مستحق اليوم', future: 'بعد' }),
      date: c.due_date as string,
      daysLeft: d,
      amount: Number(c.amount) || 0,
      link: '/cheques',
    })
  }

  // الفواتير غير المدفوعة المتأخرة
  for (const inv of invoices as Record<string, unknown>[]) {
    if (inv.status !== 'paid' && inv.due_date) {
      const d = daysUntil(inv.due_date as string)
      if (d !== null && d <= MAX_FINANCIAL) {
        const { level, urgent } = classify(d, 'financial')
        alerts.push({
          id: `invoice-${inv.id}`,
          kind: 'invoice',
          level, urgent,
          title: `فاتورة ${inv.invoice_number} — ${inv.customer_name}`,
          subtitle: subtitleDays(d, { past: 'متأخرة', today: 'تستحق اليوم', future: 'تستحق بعد' }),
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
      if (d !== null && d <= MAX_FINANCIAL) {
        const { level, urgent } = classify(d, 'financial')
        alerts.push({
          id: `task-${t.id}`,
          kind: 'task',
          level, urgent,
          title: `مهمة: ${t.title}`,
          subtitle: subtitleDays(d, { past: 'متأخرة', today: 'مستحقة اليوم', future: 'بعد' }),
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
      if (d !== null && d <= MAX_FINANCIAL) {
        const { level, urgent } = classify(d, 'financial')
        alerts.push({
          id: `quote-${q.id}`,
          kind: 'quote',
          level, urgent,
          title: `عرض ${q.quote_number} — ${q.customer_name}`,
          subtitle: subtitleDays(d, { past: 'انتهت صلاحيته منذ', today: 'ينتهي اليوم', future: 'ينتهي بعد' }),
          date: q.valid_until as string,
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