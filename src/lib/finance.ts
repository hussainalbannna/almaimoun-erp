// ════════════════════════════════════════════════════════════════════
//  المحرك المالي الموحّد — نظام الميمون ERP
//  ⭐ المصدر المعتمد الوحيد لكل الحسابات المالية في النظام ⭐
//  كل صفحة (لوحة التحكم، المالية، التقارير، تفاصيل المشروع...)
//  تستدعي هذه الدوال — نفس الرقم في كل مكان، دائماً.
//
//  القواعد المحاسبية الثابتة المطبّقة هنا:
//  1) رؤية السيولة: الشيك لا يُحسب مصروفاً إلا بعد صرفه فعلياً
//     (جدول cheques هو مصدر الحقيقة لحالة الشيك)
//  2) تاريخ الفاتورة الفعلي (entry_date) هو المعتمد للفترات، لا تاريخ الإدخال
//  3) تكلفة العمالة: شهري = الراتب الكامل / 26 يوم عمل × أيام الحضور
//     يومي = الأجر اليومي × أيام الحضور — والأوفر تايم يُضاف
//  4) الضريبة: مشتريات 10% قابلة للاسترداد — فواتير العميل معفاة صفر
// ════════════════════════════════════════════════════════════════════

import { supabase } from './supabase'

// ─── ثوابت معتمدة ────────────────────────────────────────────────────
export const MONTHLY_WORK_DAYS = 26 // الجمعة إجازة مدفوعة

// ─── أدوات التاريخ ───────────────────────────────────────────────────
export const todayStr = (): string => new Date().toISOString().slice(0, 10)

// ─── أنواع مشتركة ────────────────────────────────────────────────────
export interface PurchaseLike {
  amount: number | null
  payment_method: string | null
  check_due_date: string | null
  entry_date?: string | null
  created_at?: string | null
  tax_rate?: number | null
  subtotal?: number | null
}

export interface SubPaymentLike {
  amount: number | null
  payment_method: string | null
  check_due_date: string | null
  payment_date?: string | null
}

export interface ChequeRow {
  id: string
  amount: number
  due_date: string | null
  status: string
  cheque_type: string
  direction: string
  related_type: string
  related_id: string | null
  party_name: string
  project_id: string | null
}

export interface WorkerPayLike {
  id: string
  pay_type?: string | null
  daily_rate?: number | null
  actual_salary?: number | null
  basic_salary?: number | null
  social_allowance?: number | null
}

// ════════════════════════════════════════════════════════════════════
//  الشيكات — الحالة من جدول cheques (مصدر الحقيقة)
// ════════════════════════════════════════════════════════════════════

// جلب كل الشيكات (لصفحات تحتاج التفاصيل)
export async function fetchCheques(): Promise<ChequeRow[]> {
  const { data } = await supabase
    .from('cheques')
    .select('id, amount, due_date, status, cheque_type, direction, related_type, related_id, party_name, project_id')
    .order('due_date', { ascending: true })
  return (data ?? []) as ChequeRow[]
}

// مجموعة معرّفات الفواتير/الدفعات التي شيكها غير مصروف (pending)
// تُستخدم لاستبعادها من المصاريف الفعلية بدقة
export interface PendingChequeSets {
  purchaseIds: Set<string>
  subPaymentIds: Set<string>
  pendingTotal: number // إجمالي الشيكات الصادرة المعلّقة (آجلة فقط، بدون ضمان)
  guaranteeTotal: number // إجمالي شيكات الضمان القائمة (التزام محتمل، ليس مصروفاً)
}

// دالة نقية — تحسب من شيكات مجلوبة مسبقاً (قابلة للاختبار وتتجنّب الجلب المكرّر)
export function computePendingChequeSets(cheques: ChequeRow[]): PendingChequeSets {
  const purchaseIds = new Set<string>()
  const subPaymentIds = new Set<string>()
  let pendingTotal = 0
  let guaranteeTotal = 0
  for (const c of cheques) {
    if (c.direction !== 'outgoing') continue
    if (c.status === 'pending' && c.cheque_type === 'guarantee') {
      guaranteeTotal += Number(c.amount || 0)
      continue
    }
    if (c.status !== 'pending' || c.cheque_type !== 'deferred') continue
    pendingTotal += Number(c.amount || 0)
    if (c.related_type === 'purchase_invoice' && c.related_id) purchaseIds.add(c.related_id)
    if (c.related_type === 'subcontractor_payment' && c.related_id) subPaymentIds.add(c.related_id)
  }
  return { purchaseIds, subPaymentIds, pendingTotal, guaranteeTotal }
}

// غلاف يجلب الشيكات ثم يحسب
export async function fetchPendingChequeSets(): Promise<PendingChequeSets> {
  return computePendingChequeSets(await fetchCheques())
}

// ════════════════════════════════════════════════════════════════════
//  المشتريات — فصل المدفوع فعلاً عن الشيكات الآجلة المعلّقة
// ════════════════════════════════════════════════════════════════════

// التاريخ الفعلي للفاتورة (تاريخ الفاتورة نفسها، وإلا تاريخ الإدخال)
export function purchaseEffectiveDate(inv: PurchaseLike): string {
  return (inv.entry_date || inv.created_at || '').slice(0, 10)
}

// المنطق الاحتياطي (بدون جدول cheques): شيك آجل موعده لم يحل = معلّق
export function isDeferredUncleared(inv: PurchaseLike, today: string = todayStr()): boolean {
  return inv.payment_method === 'deferred_cheque'
    && !!inv.check_due_date
    && inv.check_due_date > today
}

export interface PurchaseSplit {
  paidTotal: number      // مصروف فعلي (يُخصم من الربح)
  deferredTotal: number  // شيكات آجلة معلّقة (التزام قادم، لا يُخصم)
  taxRecoverable: number // ضريبة قابلة للاسترداد (من الفواتير كلها)
}

// الفصل الدقيق — يعتمد جدول cheques إن مرّرت pendingPurchaseIds
// وإلا يستخدم المنطق الاحتياطي بالتاريخ
export function splitPurchases(
  invoices: Array<PurchaseLike & { id?: string }>,
  pendingPurchaseIds?: Set<string>,
  today: string = todayStr()
): PurchaseSplit {
  let paidTotal = 0, deferredTotal = 0, taxRecoverable = 0
  for (const inv of invoices) {
    const amt = Number(inv.amount || 0)
    const sub = Number(inv.subtotal || 0)
    const rate = Number(inv.tax_rate ?? 10)
    taxRecoverable += sub > 0 ? amt - sub : (rate > 0 ? amt - amt / (1 + rate / 100) : 0)
    const isPending = pendingPurchaseIds && inv.id
      ? pendingPurchaseIds.has(inv.id)
      : isDeferredUncleared(inv, today)
    if (isPending) deferredTotal += amt
    else paidTotal += amt
  }
  return { paidTotal, deferredTotal, taxRecoverable }
}

// دفعات مقاولي الباطن — نفس المبدأ
export function splitSubPayments(
  payments: Array<SubPaymentLike & { id?: string }>,
  pendingSubIds?: Set<string>,
  today: string = todayStr()
): { paidTotal: number; deferredTotal: number } {
  let paidTotal = 0, deferredTotal = 0
  for (const p of payments) {
    const amt = Number(p.amount || 0)
    const isPending = pendingSubIds && p.id
      ? pendingSubIds.has(p.id)
      : (p.payment_method === 'cheque' && !!p.check_due_date && p.check_due_date > today)
    if (isPending) deferredTotal += amt
    else paidTotal += amt
  }
  return { paidTotal, deferredTotal }
}

// ════════════════════════════════════════════════════════════════════
//  تكلفة العمالة — من الحضور الفعلي (القاعدة المعتمدة)
// ════════════════════════════════════════════════════════════════════

// الراتب الكامل للعامل الشهري
export function workerFullSalary(w: WorkerPayLike): number {
  const actual = Number(w.actual_salary || 0)
  if (actual > 0) return actual
  return Number(w.basic_salary || 0) + Number(w.social_allowance || 0)
}

// تكلفة يوم العمل الواحد لأي عامل
export function workerDayCost(w: WorkerPayLike): number {
  if (w.pay_type === 'daily') return Number(w.daily_rate || 0)
  return workerFullSalary(w) / MONTHLY_WORK_DAYS
}

export interface LaborDetail {
  workerId: string
  days: number
  cost: number
  type: 'monthly' | 'daily'
}

// حساب تكلفة العمالة من خريطة (عامل → أيام حضور)
export function computeLaborCost(
  daysByWorker: Map<string, number>,
  workers: WorkerPayLike[]
): { total: number; details: LaborDetail[] } {
  let total = 0
  const details: LaborDetail[] = []
  for (const w of workers) {
    const days = daysByWorker.get(w.id) || 0
    if (days <= 0) continue
    const cost = workerDayCost(w) * days
    total += cost
    details.push({ workerId: w.id, days, cost, type: w.pay_type === 'daily' ? 'daily' : 'monthly' })
  }
  details.sort((a, b) => b.cost - a.cost)
  return { total, details }
}

// ════════════════════════════════════════════════════════════════════
//  ملخّص السيولة الشامل (للوحات) — كل صغيرة وكبيرة
// ════════════════════════════════════════════════════════════════════
export interface CashPosition {
  pendingChequesTotal: number   // شيكات آجلة صادرة معلّقة (التزام قادم)
  guaranteeChequesTotal: number // شيكات ضمان قائمة
  dueWithin7Days: number        // منها: تستحق خلال 7 أيام
  overduePending: number        // منها: استحقت ولم تُسوَّ (تحتاج تسوية فورية)
}

// دالة نقية — تحسب مركز السيولة من شيكات مجلوبة مسبقاً
export function computeCashPosition(cheques: ChequeRow[], today: string = todayStr()): CashPosition {
  const in7 = new Date(new Date(today).getTime() + 7 * 86400000).toISOString().slice(0, 10)
  let pendingChequesTotal = 0, guaranteeChequesTotal = 0, dueWithin7Days = 0, overduePending = 0
  for (const c of cheques) {
    if (c.direction !== 'outgoing' || c.status !== 'pending') continue
    const amt = Number(c.amount || 0)
    if (c.cheque_type === 'guarantee') { guaranteeChequesTotal += amt; continue }
    pendingChequesTotal += amt
    if (c.due_date && c.due_date < today) overduePending += amt
    else if (c.due_date && c.due_date <= in7) dueWithin7Days += amt
  }
  return { pendingChequesTotal, guaranteeChequesTotal, dueWithin7Days, overduePending }
}

// غلاف يجلب الشيكات ثم يحسب
export async function fetchCashPosition(): Promise<CashPosition> {
  return computeCashPosition(await fetchCheques())
}