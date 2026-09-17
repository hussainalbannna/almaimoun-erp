import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  History, Filter, RefreshCw, Search, Plus, Pencil, Trash2, AlertTriangle,
  ChevronDown, Copy, User, Database, X, ShieldCheck,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatDateTime, timeAgo } from '../../lib/utils'
import { OWNER_EMAIL } from '../../lib/authz'
import toast from 'react-hot-toast'

// ════════════════════════════════════════════════════════════════════
//  سجل نشاط الموظفين — عرض للقراءة فقط فوق public.audit_log
//
//  يعرض كل إضافة/تعديل/حذف قام بها أي مستخدم: مَن، ماذا، متى، والقيم
//  قبل/بعد. القراءة محروسة على مستوى القاعدة (RLS: المالك فقط) — هذه
//  الشاشة واجهة عرض فوق ذلك الحارس، لا بديلاً عنه.
// ════════════════════════════════════════════════════════════════════

const MAX_ROWS = 500 // نجلب أحدث 500 حدثاً (مع الفلاتر) — يكفي للمراجعة ويُبقي الصفحة خفيفة

interface AuditRow {
  id: number
  happened_at: string
  txid: number | null
  actor_id: string | null
  actor_email: string | null
  actor_jwt_role: string | null
  db_session_user: string | null
  action: 'INSERT' | 'UPDATE' | 'DELETE' | 'TRUNCATE'
  table_name: string
  record_id: string | null
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
}

const AUDIT_COLUMNS =
  'id, happened_at, txid, actor_id, actor_email, actor_jwt_role, db_session_user, action, table_name, record_id, old_data, new_data'

// ─── وصف كل نوع عملية: تسمية عربية ولون وأيقونة ──────────────────────
const ACTION_META: Record<
  AuditRow['action'],
  { label: string; badge: string; icon: typeof Plus; ring: string }
> = {
  INSERT: { label: 'إضافة', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: Plus, ring: 'border-r-emerald-400' },
  UPDATE: { label: 'تعديل', badge: 'bg-amber-50 text-amber-700 border-amber-200', icon: Pencil, ring: 'border-r-amber-400' },
  DELETE: { label: 'حذف', badge: 'bg-red-50 text-red-700 border-red-200', icon: Trash2, ring: 'border-r-red-400' },
  TRUNCATE: { label: 'محو جدول', badge: 'bg-red-100 text-red-800 border-red-300', icon: AlertTriangle, ring: 'border-r-red-500' },
}

// ─── أسماء المستخدمين المعروفين (بريد → اسم للعرض) ───────────────────
const ACTOR_LABELS: Record<string, string> = {
  [OWNER_EMAIL]: 'حسين البناء (المالك)',
  'afafalbanna@gmail.com': 'عفاف البناء',
  'nebras2008bh@gmail.com': 'نبراس',
  'wadeeea.adel@gmail.com': 'وديعة عادل',
  'zainab.alawi85@gmail.com': 'زينب العلوي',
}

// ─── تسميات عربية لجداول قاعدة البيانات الشائعة (fallback: الاسم الخام) ─
const TABLE_LABELS: Record<string, string> = {
  projects: 'المشاريع', quotations: 'عروض الأسعار', invoices: 'الفواتير',
  receipts: 'الإيصالات', assets: 'الأصول والمعدات', rentals: 'الإيجارات',
  workers: 'العمالة', daily_logs: 'تقارير الموقع', daily_log_workers: 'عمّال التقارير',
  tasks: 'المهام', subcontractors: 'مقاولو الباطن', subcontractor_assignments: 'تكليفات الباطن',
  suppliers: 'الموردون', customers: 'العملاء', contacts: 'جهات الاتصال',
  lpos: 'أوامر الشراء', lpo_items: 'بنود أوامر الشراء', purchase_invoices: 'فواتير الشراء',
  cheques: 'الشيكات', cashbook: 'دفتر الصندوق', cash_transactions: 'حركات الصندوق',
  payroll: 'الرواتب', payroll_items: 'بنود الرواتب', documents: 'المستندات',
  notifications: 'الإشعارات', project_phases: 'مراحل المشاريع', variation_orders: 'أوامر التغيير',
  invoice_items: 'بنود الفواتير', quotation_items: 'بنود العروض', settings: 'الإعدادات',
}

const tableLabel = (t: string) => TABLE_LABELS[t] ?? t
const actorLabel = (email: string | null) =>
  email ? (ACTOR_LABELS[email] ?? email) : 'النظام / غير معروف'

// ─── جلب السجل مع الفلاتر (يرمي عند الخطأ → fail-loud في الواجهة) ─────
interface Filters {
  actor: string
  action: string
  table: string
  from: string
  to: string
}

async function fetchAudit(filters: Filters): Promise<AuditRow[]> {
  let query = supabase
    .from('audit_log')
    .select(AUDIT_COLUMNS)
    .order('happened_at', { ascending: false })
    .limit(MAX_ROWS)

  if (filters.actor) query = query.eq('actor_email', filters.actor)
  if (filters.action) query = query.eq('action', filters.action)
  if (filters.table) query = query.eq('table_name', filters.table)
  if (filters.from) query = query.gte('happened_at', new Date(filters.from + 'T00:00:00').toISOString())
  if (filters.to) query = query.lte('happened_at', new Date(filters.to + 'T23:59:59.999').toISOString())

  const { data, error } = await query
  if (error) throw new Error(error.message) // مهم: نرمي كي تُظهر الواجهة خطأً صريحاً لا قائمة فارغة مضلِّلة
  return (data ?? []) as AuditRow[]
}

// ─── تحويل قيمة حقل إلى نص للعرض ──────────────────────────────────────
const REDACTED_MARKER = '[[ملف/صورة — غير معروض]]'

function displayValue(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'نعم' : 'لا'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'string') {
    if (v === '') return '(فارغ)'
    // بيانات base64 مُنقّاة من الخادم قد تظهر كعلامة — نعرضها بشكل ودّي
    if (v.startsWith('data:') || v.includes('REDACTED') || v.includes('__redacted__')) return REDACTED_MARKER
    return v
  }
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}

// حقول تقنية لا تُفيد في المراجعة البشرية — نُخفيها من العرض
const HIDDEN_FIELDS = new Set(['id', 'created_at', 'updated_at', 'user_id', 'created_by', 'updated_by'])

interface FieldChange {
  key: string
  before: unknown
  after: unknown
}

// حساب الحقول المتغيّرة بين نسختين (للتعديل)
function computeChanges(oldD: Record<string, unknown> | null, newD: Record<string, unknown> | null): FieldChange[] {
  const keys = new Set<string>([...Object.keys(oldD ?? {}), ...Object.keys(newD ?? {})])
  const changes: FieldChange[] = []
  for (const key of keys) {
    if (HIDDEN_FIELDS.has(key)) continue
    const before = oldD?.[key]
    const after = newD?.[key]
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      changes.push({ key, before, after })
    }
  }
  return changes
}

// كل الحقول ذات القيمة (للإضافة/الحذف) بلا الحقول التقنية الفارغة
function meaningfulEntries(d: Record<string, unknown> | null): [string, unknown][] {
  if (!d) return []
  return Object.entries(d).filter(([k, v]) => !HIDDEN_FIELDS.has(k) && v !== null && v !== '' && v !== undefined)
}

export default function ActivityLog() {
  const queryClient = useQueryClient()
  const [filters, setFilters] = useState<Filters>({ actor: '', action: '', table: '', from: '', to: '' })
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)

  const { data: rows = [], isLoading, isError, isFetching } = useQuery({
    queryKey: ['audit-log', filters],
    queryFn: () => fetchAudit(filters),
  })

  const reload = () => queryClient.invalidateQueries({ queryKey: ['audit-log'] })

  // خيارات الفلاتر: الموظفون (المعروفون + من ظهر فعلاً) والجداول (مما ظهر)
  const actorOptions = useMemo(() => {
    const set = new Set<string>(Object.keys(ACTOR_LABELS))
    rows.forEach(r => r.actor_email && set.add(r.actor_email))
    return Array.from(set)
  }, [rows])

  const tableOptions = useMemo(() => {
    const set = new Set<string>()
    rows.forEach(r => set.add(r.table_name))
    return Array.from(set).sort()
  }, [rows])

  // بحث نصّي محلّي (بعد فلاتر الخادم): على المعرّف أو اسم الجدول أو بريد المنفّذ
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r =>
      (r.record_id ?? '').toLowerCase().includes(q) ||
      r.table_name.toLowerCase().includes(q) ||
      tableLabel(r.table_name).includes(q) ||
      (r.actor_email ?? '').toLowerCase().includes(q) ||
      actorLabel(r.actor_email).includes(q),
    )
  }, [rows, search])

  const hasActiveFilter = Boolean(filters.actor || filters.action || filters.table || filters.from || filters.to || search)
  const clearFilters = () => { setFilters({ actor: '', action: '', table: '', from: '', to: '' }); setSearch('') }

  const copyJson = (obj: unknown) => {
    try {
      navigator.clipboard.writeText(JSON.stringify(obj, null, 2))
      toast.success('نُسخت البيانات')
    } catch {
      toast.error('تعذّر النسخ')
    }
  }

  return (
    <div className="space-y-4">
      {/* ── ترويسة ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center">
            <History className="text-amber-600" size={22} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800">سجل نشاط الموظفين</h1>
            <p className="text-xs text-slate-400 flex items-center gap-1">
              <ShieldCheck size={12} className="text-emerald-500" />
              مرئي لك وحدك — كل إضافة وتعديل وحذف داخل النظام
            </p>
          </div>
        </div>
        <button
          onClick={reload}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
        >
          <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />
          تحديث
        </button>
      </div>

      {/* ── الفلاتر ── */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center gap-2 mb-3 text-slate-500 text-sm font-medium">
          <Filter size={15} /> تصفية
          {hasActiveFilter && (
            <button onClick={clearFilters} className="mr-auto inline-flex items-center gap-1 text-xs text-amber-700 hover:underline">
              <X size={12} /> مسح الفلاتر
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {/* الموظف */}
          <select
            value={filters.actor}
            onChange={e => setFilters(f => ({ ...f, actor: e.target.value }))}
            className="border border-slate-200 rounded-lg text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
          >
            <option value="">كل الموظفين</option>
            {actorOptions.map(email => (
              <option key={email} value={email}>{actorLabel(email)}</option>
            ))}
          </select>

          {/* نوع العملية */}
          <select
            value={filters.action}
            onChange={e => setFilters(f => ({ ...f, action: e.target.value }))}
            className="border border-slate-200 rounded-lg text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
          >
            <option value="">كل العمليات</option>
            <option value="INSERT">إضافة</option>
            <option value="UPDATE">تعديل</option>
            <option value="DELETE">حذف</option>
            <option value="TRUNCATE">محو جدول</option>
          </select>

          {/* الجدول/القسم */}
          <select
            value={filters.table}
            onChange={e => setFilters(f => ({ ...f, table: e.target.value }))}
            className="border border-slate-200 rounded-lg text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
          >
            <option value="">كل الأقسام</option>
            {tableOptions.map(t => (
              <option key={t} value={t}>{tableLabel(t)}</option>
            ))}
          </select>

          {/* من تاريخ */}
          <input
            type="date"
            value={filters.from}
            onChange={e => setFilters(f => ({ ...f, from: e.target.value }))}
            className="border border-slate-200 rounded-lg text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
            aria-label="من تاريخ"
          />

          {/* إلى تاريخ */}
          <input
            type="date"
            value={filters.to}
            onChange={e => setFilters(f => ({ ...f, to: e.target.value }))}
            className="border border-slate-200 rounded-lg text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
            aria-label="إلى تاريخ"
          />

          {/* بحث نصّي */}
          <div className="relative">
            <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="بحث بالمعرّف أو القسم..."
              className="w-full pr-9 pl-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
            />
          </div>
        </div>
      </div>

      {/* ── القائمة ── */}
      {isError ? (
        <div className="p-12 text-center border-2 border-red-300 rounded-xl bg-white">
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
            <AlertTriangle size={28} className="text-red-400" />
          </div>
          <p className="text-red-700 font-semibold">تعذّر تحميل سجل النشاط — قد تكون القائمة ناقصة. لا تعتمد على هذه الشاشة الآن.</p>
          <button onClick={reload} className="mt-3 inline-block text-sm text-amber-700 hover:underline">إعادة المحاولة</button>
        </div>
      ) : isLoading ? (
        <div className="p-12 text-center text-slate-400 bg-white rounded-xl border border-slate-200">جاري التحميل...</div>
      ) : filtered.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-xl border border-slate-200">
          <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
            <History size={28} className="text-slate-300" />
          </div>
          <p className="text-slate-500 font-medium">
            {hasActiveFilter ? 'لا يوجد نشاط مطابق للفلاتر' : 'لا يوجد نشاط مُسجّل بعد'}
          </p>
          {!hasActiveFilter && (
            <p className="text-slate-400 text-xs mt-1">يبدأ التسجيل تلقائياً مع أول حركة يقوم بها أي موظف.</p>
          )}
        </div>
      ) : (
        <>
          <div className="text-xs text-slate-400 px-1">
            {filtered.length} حدثاً{rows.length >= MAX_ROWS ? ` (أحدث ${MAX_ROWS} — ضيّق الفلاتر لرؤية أقدم)` : ''}
          </div>
          <div className="space-y-2">
            {filtered.map(row => {
              const meta = ACTION_META[row.action]
              const Icon = meta.icon
              const isOpen = expanded === row.id
              const changes = row.action === 'UPDATE' ? computeChanges(row.old_data, row.new_data) : []

              return (
                <div
                  key={row.id}
                  className={`bg-white rounded-xl border border-slate-200 border-r-4 ${meta.ring} overflow-hidden`}
                >
                  {/* سطر الحدث */}
                  <button
                    onClick={() => setExpanded(isOpen ? null : row.id)}
                    className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-right hover:bg-slate-50 transition-colors"
                  >
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border font-medium ${meta.badge}`}>
                      <Icon size={13} /> {meta.label}
                    </span>
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-slate-700">
                      <Database size={13} className="text-slate-400" /> {tableLabel(row.table_name)}
                    </span>
                    <span className="inline-flex items-center gap-1 text-sm text-slate-500">
                      <User size={13} className="text-slate-400" /> {actorLabel(row.actor_email)}
                    </span>
                    {row.record_id && (
                      <span className="text-xs text-slate-400 font-mono truncate max-w-[160px]" title={row.record_id}>
                        #{row.record_id}
                      </span>
                    )}
                    <span className="mr-auto flex items-center gap-2 text-xs text-slate-400">
                      <span title={formatDateTime(row.happened_at)}>{timeAgo(row.happened_at)}</span>
                      <ChevronDown size={15} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </span>
                  </button>

                  {/* التفاصيل */}
                  {isOpen && (
                    <div className="border-t border-slate-100 p-4 space-y-4 bg-slate-50/50">
                      {/* معلومات دقيقة */}
                      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
                        <span>الوقت الكامل: <span className="text-slate-700">{formatDateTime(row.happened_at)}</span></span>
                        <span>المنفّذ: <span className="text-slate-700">{row.actor_email ?? '—'}</span></span>
                        {row.actor_jwt_role && <span>الدور: <span className="text-slate-700">{row.actor_jwt_role}</span></span>}
                      </div>

                      {/* حذف: عرض بارز للبيانات المحذوفة (قابلة للاسترجاع) */}
                      {row.action === 'DELETE' && (
                        <div className="rounded-lg border border-red-200 bg-red-50/50 p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-semibold text-red-700 flex items-center gap-1">
                              <Trash2 size={14} /> السجل المحذوف
                            </span>
                            <button
                              onClick={() => copyJson(row.old_data)}
                              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
                            >
                              <Copy size={12} /> نسخ البيانات
                            </button>
                          </div>
                          <FieldTable entries={meaningfulEntries(row.old_data)} />
                          <p className="text-[11px] text-red-600/70 mt-2">
                            البيانات محفوظة كاملة هنا — لا شيء يضيع. (الاسترجاع بضغطة زر ضمن التحديث القادم.)
                          </p>
                        </div>
                      )}

                      {/* تعديل: الحقول المتغيّرة فقط (قبل ← بعد) */}
                      {row.action === 'UPDATE' && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3">
                          <span className="text-sm font-semibold text-amber-700 flex items-center gap-1 mb-2">
                            <Pencil size={14} /> ما الذي تغيّر ({changes.length})
                          </span>
                          {changes.length === 0 ? (
                            <p className="text-xs text-slate-400">لا تغيير ظاهر في الحقول (قد يكون تحديثاً تقنياً).</p>
                          ) : (
                            <div className="space-y-2">
                              {changes.map(c => (
                                <div key={c.key} className="grid grid-cols-1 sm:grid-cols-[130px_1fr] gap-1 text-xs">
                                  <span className="font-medium text-slate-600">{c.key}</span>
                                  <div className="flex flex-col sm:flex-row sm:items-center gap-1">
                                    <span className="line-through text-red-500 bg-red-50 rounded px-1.5 py-0.5 break-all">{displayValue(c.before)}</span>
                                    <span className="text-slate-300">←</span>
                                    <span className="text-emerald-600 bg-emerald-50 rounded px-1.5 py-0.5 break-all">{displayValue(c.after)}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* إضافة: القيم الجديدة */}
                      {row.action === 'INSERT' && (
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
                          <span className="text-sm font-semibold text-emerald-700 flex items-center gap-1 mb-2">
                            <Plus size={14} /> البيانات المُضافة
                          </span>
                          <FieldTable entries={meaningfulEntries(row.new_data)} />
                        </div>
                      )}

                      {/* محو جدول */}
                      {row.action === 'TRUNCATE' && (
                        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                          محو كامل لبيانات الجدول «{tableLabel(row.table_name)}».
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ─── جدول حقول بسيط (مفتاح ← قيمة) للإضافة/الحذف ──────────────────────
function FieldTable({ entries }: { entries: [string, unknown][] }) {
  if (entries.length === 0) return <p className="text-xs text-slate-400">لا توجد بيانات معروضة.</p>
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
      {entries.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[110px_1fr] gap-2 text-xs py-0.5 border-b border-slate-100 last:border-0">
          <span className="font-medium text-slate-500 truncate" title={k}>{k}</span>
          <span className="text-slate-700 break-all">{displayValue(v)}</span>
        </div>
      ))}
    </div>
  )
}
