import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Search, Trash2, Edit, Eye, X, Paperclip, FileText, AlertTriangle,
  Building2, Truck, Home, Zap, Wrench, Package, Calendar, Wallet, CreditCard,
  LayoutDashboard, ListChecks, Receipt, TrendingUp, Clock, CheckCircle2, DollarSign
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatCurrency, formatDate } from '../../lib/utils'
import { openStoredFile, compressImage, fileToDataUrl } from '../../lib/ai'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import toast from 'react-hot-toast'

// ── الأنواع ──
interface Rental {
  id: string
  name: string
  category: string
  rental_type: string          // temporary | recurring
  vendor_name: string
  project_id: string | null
  project_name: string
  cost: number
  billing_cycle: string        // daily | weekly | monthly | one_time
  start_date: string | null
  end_date: string | null
  due_day: number | null
  status: string               // active | ended
  contract_data: string
  notes: string
  created_at: string
}
interface RentalPayment {
  id: string
  rental_id: string
  amount: number
  payment_date: string
  period_label: string
  payment_method: string
  proof_data: string
  notes: string
  created_at: string
}

// ── ثوابت العرض ──
const CATEGORY_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  equipment: { label: 'معدات', icon: <Wrench size={15} />, color: '#7b4a2d' },
  scaffolding: { label: 'سقالات', icon: <Package size={15} />, color: '#c4925a' },
  vehicle: { label: 'مركبة', icon: <Truck size={15} />, color: '#1e3a5f' },
  shop: { label: 'محل/مكتب', icon: <Building2 size={15} />, color: '#7c3aed' },
  housing: { label: 'سكن عمال', icon: <Home size={15} />, color: '#0891b2' },
  electricity: { label: 'كهرباء', icon: <Zap size={15} />, color: '#ca8a04' },
  other: { label: 'أخرى', icon: <Package size={15} />, color: '#64748b' },
}
const CYCLE_LABELS: Record<string, string> = { daily: 'يومي', weekly: 'أسبوعي', monthly: 'شهري', one_time: 'مرة واحدة' }
const PAYMENT_LABELS: Record<string, string> = { cash: 'نقداً', bank_transfer: 'تحويل بنكي', deferred_cheque: 'شيك آجل' }

const num = (v: unknown): number => Number(v) || 0
const todayStr = () => new Date().toISOString().slice(0, 10)
const isImageData = (d?: string) => !!d && d.startsWith('data:image')
const isPdfData = (d?: string) => !!d && d.startsWith('data:application/pdf')
const hasFile = (d?: string) => isImageData(d) || isPdfData(d)
const daysUntil = (date: string): number =>
  Math.round((new Date(date).getTime() - new Date(todayStr()).getTime()) / 86400000)

// التكلفة الشهرية التقديرية (لتوحيد المقارنة)
const monthlyEquivalent = (r: Rental): number => {
  const c = num(r.cost)
  if (r.billing_cycle === 'monthly') return c
  if (r.billing_cycle === 'weekly') return c * 4.33
  if (r.billing_cycle === 'daily') return c * 30
  return 0 // one_time لا يُحسب التزاماً شهرياً
}

type Tab = 'overview' | 'rentals' | 'payments'

export default function RentalsList() {
  const navigate = useNavigate()
  const [rentals, setRentals] = useState<Rental[]>([])
  const [payments, setPayments] = useState<RentalPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('overview')
  const [search, setSearch] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [previewImg, setPreviewImg] = useState<string | null>(null)
  const [viewRental, setViewRental] = useState<Rental | null>(null)

  // نموذج تسجيل دفعة
  const [payFor, setPayFor] = useState<Rental | null>(null)

  const load = async () => {
    setLoading(true)
    const [rRes, pRes] = await Promise.all([
      supabase.from('rentals').select('*'),
      supabase.from('rental_payments').select('*'),
    ])
    const rRows = ((rRes.data ?? []) as Rental[]).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    const pRows = ((pRes.data ?? []) as RentalPayment[]).sort((a, b) => (b.payment_date || '').localeCompare(a.payment_date || ''))
    setRentals(rRows)
    setPayments(pRows)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const handleDelete = async () => {
    if (!deleteId) return
    await supabase.from('rentals').delete().eq('id', deleteId)
    toast.success('تم حذف الإيجار')
    setDeleteId(null)
    if (viewRental?.id === deleteId) setViewRental(null)
    load()
  }

  const openDoc = (data: string) => {
    if (isImageData(data)) setPreviewImg(data)
    else openStoredFile(data, isPdfData(data) ? 'application/pdf' : '')
  }

  // مدفوعات إيجار معيّن
  const paymentsOf = (rentalId: string) => payments.filter(p => p.rental_id === rentalId)
  const paidTotal = (rentalId: string) => paymentsOf(rentalId).reduce((s, p) => s + num(p.amount), 0)

  // ── حسابات النظرة العامة ──
  const activeRentals = rentals.filter(r => r.status === 'active')
  const recurringActive = activeRentals.filter(r => r.rental_type === 'recurring')
  const monthlyCommitment = recurringActive.reduce((s, r) => s + monthlyEquivalent(r), 0)
  const totalPaid = payments.reduce((s, p) => s + num(p.amount), 0)

  // المستحق هذا الشهر (الدوري الذي لم تُسجّل له دفعة بهذا الشهر)
  const thisMonthPrefix = todayStr().slice(0, 7) // YYYY-MM
  const dueThisMonth = recurringActive.filter(r => {
    const paidThisMonth = paymentsOf(r.id).some(p => (p.payment_date || '').slice(0, 7) === thisMonthPrefix)
    return !paidThisMonth
  })
  const dueThisMonthTotal = dueThisMonth.reduce((s, r) => s + monthlyEquivalent(r), 0)

  // الإيجارات المؤقتة القريبة من الانتهاء (خلال 7 أيام)
  const endingSoon = activeRentals.filter(r =>
    r.rental_type === 'temporary' && r.end_date && r.end_date >= todayStr() && daysUntil(r.end_date) <= 7
  )

  // ── تصفية قائمة الإيجارات ──
  const filteredRentals = useMemo(() => activeRentals.concat(rentals.filter(r => r.status !== 'active')).filter(r => {
    const q = search.toLowerCase()
    return !q || r.name.toLowerCase().includes(q) || r.vendor_name.toLowerCase().includes(q) ||
      r.project_name.toLowerCase().includes(q) || (CATEGORY_META[r.category]?.label || '').includes(q)
  }), [rentals, activeRentals, search])

  const rentalName = (rentalId: string) => rentals.find(r => r.id === rentalId)?.name || '—'

  return (
    <div className="p-6" dir="rtl">
      {/* الترويسة */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #c4925a 0%, #7b4a2d 100%)' }}>
            <Receipt size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">الإيجارات والمصاريف الثابتة</h1>
            <p className="text-slate-500 text-sm mt-0.5">المعدات والسقالات والمركبات والإيجارات والمصاريف الدورية</p>
          </div>
        </div>
        <Button onClick={() => navigate('/rentals/new')} icon={<Plus size={16} />}>تسجيل إيجار / مصروف</Button>
      </div>

      {/* التبويبات */}
      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl mb-5 w-fit">
        {([
          { k: 'overview', label: 'نظرة عامة', icon: <LayoutDashboard size={15} /> },
          { k: 'rentals', label: 'الإيجارات والعقود', icon: <ListChecks size={15} /> },
          { k: 'payments', label: 'سجل الدفعات', icon: <Wallet size={15} /> },
        ] as { k: Tab; label: string; icon: React.ReactNode }[]).map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg font-medium transition-colors ${tab === t.k ? 'bg-white shadow-sm text-amber-700' : 'text-slate-500 hover:text-slate-700'}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">جاري التحميل...</div>
      ) : (
        <>
          {/* ═══════════ تبويب: نظرة عامة ═══════════ */}
          {tab === 'overview' && (
            <div className="space-y-5">
              {/* تنبيهات */}
              {endingSoon.length > 0 && (
                <div className="flex items-start gap-2 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 text-sm">
                  <Clock size={18} className="text-orange-600 shrink-0 mt-0.5" />
                  <div className="text-orange-800">
                    <strong>{endingSoon.length}</strong> إيجار مؤقت قارب على الانتهاء (خلال 7 أيام):
                    <span className="text-orange-700"> {endingSoon.map(r => r.name).join('، ')}</span>
                  </div>
                </div>
              )}
              {dueThisMonth.length > 0 && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm">
                  <AlertTriangle size={18} className="text-red-600 shrink-0 mt-0.5" />
                  <div className="text-red-800">
                    <strong>{dueThisMonth.length}</strong> مصروف دوري مستحق هذا الشهر ولم تُسجّل دفعته (إجمالي {formatCurrency(dueThisMonthTotal)}):
                    <span className="text-red-700"> {dueThisMonth.map(r => r.name).join('، ')}</span>
                  </div>
                </div>
              )}

              {/* بطاقات */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="text-xs text-slate-400 flex items-center gap-1 mb-1"><TrendingUp size={13} /> الالتزام الشهري الثابت</div>
                  <div className="text-lg font-bold text-slate-800">{formatCurrency(monthlyCommitment)}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{recurringActive.length} مصروف دوري</div>
                </div>
                <div className={`rounded-xl border p-4 ${dueThisMonthTotal > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
                  <div className="text-xs flex items-center gap-1 mb-1" style={{ color: dueThisMonthTotal > 0 ? '#b91c1c' : '#94a3b8' }}><Calendar size={13} /> مستحق هذا الشهر</div>
                  <div className="text-lg font-bold" style={{ color: dueThisMonthTotal > 0 ? '#dc2626' : '#334155' }}>{formatCurrency(dueThisMonthTotal)}</div>
                  <div className="text-[11px] mt-0.5" style={{ color: dueThisMonthTotal > 0 ? '#b91c1c' : '#94a3b8' }}>{dueThisMonth.length} لم تُدفع بعد</div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="text-xs text-slate-400 flex items-center gap-1 mb-1"><CheckCircle2 size={13} /> إيجارات نشطة</div>
                  <div className="text-lg font-bold text-slate-800">{activeRentals.length}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{activeRentals.filter(r => r.rental_type === 'temporary').length} مؤقت · {recurringActive.length} دوري</div>
                </div>
                <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4">
                  <div className="text-xs text-emerald-700 flex items-center gap-1 mb-1"><DollarSign size={13} /> إجمالي المدفوع</div>
                  <div className="text-lg font-bold text-emerald-700">{formatCurrency(totalPaid)}</div>
                  <div className="text-[11px] text-emerald-600 mt-0.5">{payments.length} دفعة مسجّلة</div>
                </div>
              </div>

              {/* توزيع حسب الفئة */}
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="font-bold text-slate-700 mb-4">التوزيع حسب الفئة (الالتزام الشهري)</h3>
                {recurringActive.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-4">لا توجد مصاريف دورية نشطة</p>
                ) : (
                  <div className="space-y-2.5">
                    {Object.keys(CATEGORY_META).map(cat => {
                      const items = recurringActive.filter(r => r.category === cat)
                      if (items.length === 0) return null
                      const sum = items.reduce((s, r) => s + monthlyEquivalent(r), 0)
                      const pct = monthlyCommitment > 0 ? (sum / monthlyCommitment) * 100 : 0
                      const meta = CATEGORY_META[cat]
                      return (
                        <div key={cat}>
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span className="flex items-center gap-1.5 text-slate-600" style={{ color: meta.color }}>{meta.icon} {meta.label} <span className="text-slate-400 text-xs">({items.length})</span></span>
                            <span className="font-semibold text-slate-700">{formatCurrency(sum)}</span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: meta.color }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══════════ تبويب: الإيجارات والعقود ═══════════ */}
          {tab === 'rentals' && (
            <div className="space-y-4">
              <div className="relative max-w-xs">
                <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="بحث بالاسم أو الجهة أو المشروع..."
                  className="w-full pr-9 pl-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30" />
              </div>

              {filteredRentals.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
                  <Receipt size={40} className="mx-auto mb-3 text-slate-300" />
                  <p>{search ? 'لا نتائج' : 'لا توجد إيجارات مسجلة بعد'}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredRentals.map(r => {
                    const meta = CATEGORY_META[r.category] || CATEGORY_META.other
                    const paid = paidTotal(r.id)
                    const isEnded = r.status !== 'active'
                    const isEndingSoon = r.rental_type === 'temporary' && r.end_date && r.end_date >= todayStr() && daysUntil(r.end_date) <= 7
                    const paidThisMonth = paymentsOf(r.id).some(p => (p.payment_date || '').slice(0, 7) === thisMonthPrefix)
                    return (
                      <div key={r.id} className={`bg-white rounded-xl border p-4 transition-shadow hover:shadow-md ${isEnded ? 'border-slate-200 opacity-70' : isEndingSoon ? 'border-orange-200' : 'border-slate-200'}`}>
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white shrink-0" style={{ background: meta.color }}>{meta.icon}</div>
                            <div>
                              <div className="font-bold text-slate-800 text-sm">{r.name}</div>
                              <div className="text-xs text-slate-400">{meta.label}{r.vendor_name ? ` · ${r.vendor_name}` : ''}</div>
                            </div>
                          </div>
                          <Badge color={r.rental_type === 'recurring' ? 'blue' : 'amber'}>{r.rental_type === 'recurring' ? 'دوري' : 'مؤقت'}</Badge>
                        </div>

                        <div className="flex items-center justify-between text-sm mb-2">
                          <span className="text-slate-500">{CYCLE_LABELS[r.billing_cycle]}</span>
                          <span className="font-bold" style={{ color: '#7b4a2d' }}>{formatCurrency(num(r.cost))}</span>
                        </div>

                        {/* تفاصيل حسب النوع */}
                        {r.rental_type === 'temporary' ? (
                          <div className="text-xs text-slate-500 flex items-center gap-1 mb-2">
                            <Calendar size={12} />
                            {r.start_date ? formatDate(r.start_date) : '—'} ← {r.end_date ? formatDate(r.end_date) : '—'}
                            {isEndingSoon && <span className="text-orange-600 font-bold mr-1">(باقي {daysUntil(r.end_date!)} يوم)</span>}
                          </div>
                        ) : (
                          <div className="text-xs text-slate-500 flex items-center gap-1 mb-2">
                            <Calendar size={12} /> استحقاق يوم {r.due_day || '—'} من كل شهر
                            {paidThisMonth ? <span className="text-emerald-600 font-medium mr-1">· دُفع هذا الشهر ✓</span> : <span className="text-red-500 font-medium mr-1">· لم يُدفع هذا الشهر</span>}
                          </div>
                        )}

                        {r.project_name && (
                          <div className="text-xs mb-2">
                            <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full inline-flex items-center gap-1"><Building2 size={11} /> {r.project_name}</span>
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                          <span className="text-xs text-slate-400">مدفوع: <span className="font-semibold text-emerald-700">{formatCurrency(paid)}</span></span>
                          <div className="flex gap-1">
                            <button onClick={() => setPayFor(r)} className="text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-2.5 py-1 rounded-lg font-medium flex items-center gap-1" title="تسجيل دفعة"><Plus size={12} /> دفعة</button>
                            <button onClick={() => setViewRental(r)} className="p-1.5 text-slate-400 hover:text-amber-600 rounded-lg hover:bg-amber-50" title="استعراض"><Eye size={14} /></button>
                            <button onClick={() => navigate(`/rentals/${r.id}/edit`)} className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-blue-50" title="تعديل"><Edit size={14} /></button>
                            <button onClick={() => setDeleteId(r.id)} className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50" title="حذف"><Trash2 size={14} /></button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ═══════════ تبويب: سجل الدفعات ═══════════ */}
          {tab === 'payments' && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              {payments.length === 0 ? (
                <div className="p-12 text-center text-slate-400">
                  <Wallet size={40} className="mx-auto mb-3 text-slate-300" />
                  <p>لا توجد دفعات مسجلة بعد</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th className="px-4 py-2.5 text-right font-semibold text-slate-600 text-xs">الإيجار</th>
                        <th className="px-4 py-2.5 text-right font-semibold text-slate-600 text-xs">الفترة</th>
                        <th className="px-4 py-2.5 text-right font-semibold text-slate-600 text-xs">المبلغ</th>
                        <th className="px-4 py-2.5 text-right font-semibold text-slate-600 text-xs">طريقة الدفع</th>
                        <th className="px-4 py-2.5 text-right font-semibold text-slate-600 text-xs">إثبات</th>
                        <th className="px-4 py-2.5 text-right font-semibold text-slate-600 text-xs">تاريخ الدفع</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {payments.map(p => (
                        <tr key={p.id} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3 font-medium text-slate-800">{rentalName(p.rental_id)}</td>
                          <td className="px-4 py-3 text-slate-600 text-xs">{p.period_label || '—'}</td>
                          <td className="px-4 py-3 font-bold whitespace-nowrap" style={{ color: '#7b4a2d' }}>{formatCurrency(num(p.amount))}</td>
                          <td className="px-4 py-3"><Badge color={p.payment_method === 'deferred_cheque' ? 'amber' : p.payment_method === 'bank_transfer' ? 'blue' : 'green'}>{PAYMENT_LABELS[p.payment_method] ?? p.payment_method}</Badge></td>
                          <td className="px-4 py-3">
                            {hasFile(p.proof_data) ? (
                              <button onClick={() => openDoc(p.proof_data)} className="flex items-center gap-1 text-xs bg-slate-100 hover:bg-amber-100 text-slate-600 hover:text-amber-700 px-2.5 py-1 rounded-lg"><Paperclip size={12} /> عرض</button>
                            ) : <span className="text-slate-300 text-xs">—</span>}
                          </td>
                          <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">{formatDate(p.payment_date)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <ConfirmDialog open={!!deleteId} title="حذف الإيجار" message="هل أنت متأكد من حذف هذا الإيجار؟ ستُحذف جميع دفعاته أيضاً. لا يمكن التراجع." confirmLabel="حذف" onConfirm={handleDelete} onCancel={() => setDeleteId(null)} danger />

      {/* نافذة تسجيل دفعة */}
      {payFor && (
        <PaymentModal rental={payFor} onClose={() => setPayFor(null)} onSaved={() => { setPayFor(null); load() }} onPreviewImage={setPreviewImg} />
      )}

      {/* نافذة استعراض الإيجار */}
      {viewRental && (
        <RentalViewModal rental={viewRental} payments={paymentsOf(viewRental.id)} onClose={() => setViewRental(null)}
          onEdit={() => navigate(`/rentals/${viewRental.id}/edit`)} onDelete={() => setDeleteId(viewRental.id)}
          onOpenDoc={openDoc} />
      )}

      {/* معاينة الصورة */}
      {previewImg && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6" onClick={() => setPreviewImg(null)}>
          <div className="relative max-w-4xl max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <button onClick={() => setPreviewImg(null)} className="absolute -top-3 -right-3 bg-white text-slate-700 rounded-full w-8 h-8 flex items-center justify-center shadow-lg hover:bg-slate-100"><X size={18} /></button>
            <img src={previewImg} alt="معاينة" className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl" />
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════ نافذة تسجيل دفعة ═══════════
function PaymentModal({ rental, onClose, onSaved, onPreviewImage }: {
  rental: Rental; onClose: () => void; onSaved: () => void; onPreviewImage: (d: string) => void
}) {
  const [saving, setSaving] = useState(false)
  const [amount, setAmount] = useState(String(rental.cost || ''))
  const [paymentDate, setPaymentDate] = useState(todayStr())
  const [periodLabel, setPeriodLabel] = useState('')
  const [method, setMethod] = useState('cash')
  const [proof, setProof] = useState('')

  const uploadProof = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) { toast.error('الحجم أقل من 10 ميجا'); return }
    try {
      const data = file.type.startsWith('image/') ? await compressImage(file) : await fileToDataUrl(file)
      setProof(data)
    } catch { toast.error('تعذّر رفع الملف') }
  }

  const save = async () => {
    if (!amount || Number(amount) <= 0) { toast.error('أدخل المبلغ'); return }
    setSaving(true)
    const { error } = await supabase.from('rental_payments').insert({
      rental_id: rental.id,
      amount: Number(amount),
      payment_date: paymentDate,
      period_label: periodLabel,
      payment_method: method,
      proof_data: proof,
    })
    if (error) { toast.error('فشل الحفظ: ' + error.message); setSaving(false); return }
    toast.success('تم تسجيل الدفعة')
    setSaving(false)
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-800">تسجيل دفعة</h3>
            <p className="text-xs text-slate-400">{rental.name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">المبلغ (د.ب) *</label>
            <input type="number" step="0.001" value={amount} onChange={e => setAmount(e.target.value)} dir="ltr"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">تاريخ الدفع</label>
              <input type="date" value={paymentDate} max={todayStr()} onChange={e => setPaymentDate(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">الفترة</label>
              <input type="text" value={periodLabel} onChange={e => setPeriodLabel(e.target.value)} placeholder="يناير 2026"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">طريقة الدفع</label>
            <select value={method} onChange={e => setMethod(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30">
              <option value="cash">نقداً</option>
              <option value="bank_transfer">تحويل بنكي</option>
              <option value="deferred_cheque">شيك آجل</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">إثبات الدفع</label>
            <label className="flex items-center gap-2 px-3 py-2.5 border border-dashed border-slate-300 rounded-lg text-sm text-slate-500 cursor-pointer hover:border-amber-400 transition-colors">
              <Paperclip size={15} /> اختر ملفاً (صورة أو PDF)
              <input type="file" accept="image/*,.pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadProof(f); e.target.value = '' }} />
            </label>
            {proof && (
              <div className="mt-2 relative inline-block">
                {isImageData(proof) ? (
                  <button onClick={() => onPreviewImage(proof)} className="w-20 h-20 rounded-lg border border-slate-200 overflow-hidden block"><img src={proof} alt="إثبات" className="w-full h-full object-cover" /></button>
                ) : (
                  <div className="w-20 h-20 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center"><FileText size={24} className="text-red-500" /></div>
                )}
                <button onClick={() => setProof('')} className="absolute -top-1.5 -left-1.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center"><X size={12} /></button>
              </div>
            )}
          </div>
          <div className="flex gap-2 pt-1">
            <Button onClick={save} loading={saving}>حفظ الدفعة</Button>
            <Button variant="secondary" onClick={onClose}>إلغاء</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ═══════════ نافذة استعراض الإيجار ═══════════
function RentalViewModal({ rental, payments, onClose, onEdit, onDelete, onOpenDoc }: {
  rental: Rental; payments: RentalPayment[]; onClose: () => void; onEdit: () => void; onDelete: () => void; onOpenDoc: (d: string) => void
}) {
  const meta = CATEGORY_META[rental.category] || CATEGORY_META.other
  const paid = payments.reduce((s, p) => s + num(p.amount), 0)
  return (
    <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white" style={{ background: meta.color }}>{meta.icon}</div>
            <div>
              <h3 className="font-bold text-slate-800">{rental.name}</h3>
              <p className="text-xs text-slate-400">{meta.label} · {CYCLE_LABELS[rental.billing_cycle]}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-5">
          {/* التكلفة */}
          <div className="rounded-xl p-4 flex items-center justify-between" style={{ background: 'linear-gradient(135deg, #7b4a2d 0%, #9a6440 100%)' }}>
            <span className="text-white/90 text-sm font-medium">التكلفة ({CYCLE_LABELS[rental.billing_cycle]})</span>
            <span className="text-white font-black text-2xl" dir="ltr">{formatCurrency(num(rental.cost))}</span>
          </div>

          {/* تفاصيل */}
          <div className="grid grid-cols-2 gap-3">
            <Detail label="النوع" value={rental.rental_type === 'recurring' ? 'دوري ثابت' : 'مؤقت'} />
            {rental.vendor_name && <Detail label="الجهة المؤجّرة" value={rental.vendor_name} />}
            {rental.project_name && <Detail label="المشروع" value={rental.project_name} />}
            {rental.rental_type === 'temporary' ? (
              <>
                {rental.start_date && <Detail label="تاريخ البداية" value={formatDate(rental.start_date)} />}
                {rental.end_date && <Detail label="تاريخ النهاية" value={formatDate(rental.end_date)} />}
              </>
            ) : (
              rental.due_day && <Detail label="يوم الاستحقاق" value={`يوم ${rental.due_day} من كل شهر`} />
            )}
            <Detail label="إجمالي المدفوع" value={formatCurrency(paid)} highlight />
          </div>

          {rental.notes && (
            <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
              <div className="text-xs font-semibold text-slate-500 mb-1">ملاحظات</div>
              <div className="text-sm text-slate-700 whitespace-pre-wrap">{rental.notes}</div>
            </div>
          )}

          {/* العقد */}
          {hasFile(rental.contract_data) && (
            <div>
              <div className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-1.5"><Paperclip size={15} /> العقد المرفق</div>
              <button onClick={() => onOpenDoc(rental.contract_data)} className="w-32 rounded-xl border border-slate-200 overflow-hidden hover:border-amber-300 transition-colors">
                <div className="aspect-[4/3] bg-slate-50 flex items-center justify-center">
                  {isImageData(rental.contract_data) ? <img src={rental.contract_data} alt="العقد" className="w-full h-full object-cover" /> : <FileText size={28} className="text-red-500" />}
                </div>
              </button>
            </div>
          )}

          {/* الدفعات */}
          <div>
            <div className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-1.5"><Wallet size={15} /> الدفعات ({payments.length})</div>
            {payments.length === 0 ? (
              <p className="text-xs text-slate-400 bg-slate-50 rounded-lg p-3 text-center">لا توجد دفعات مسجّلة</p>
            ) : (
              <div className="space-y-2">
                {payments.map(p => (
                  <div key={p.id} className="flex items-center justify-between rounded-lg border border-slate-100 p-2.5">
                    <div>
                      <div className="text-sm font-medium text-slate-700">{p.period_label || formatDate(p.payment_date)}</div>
                      <div className="text-xs text-slate-400">{PAYMENT_LABELS[p.payment_method] ?? p.payment_method} · {formatDate(p.payment_date)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {hasFile(p.proof_data) && <button onClick={() => onOpenDoc(p.proof_data)} className="text-slate-400 hover:text-amber-600"><Paperclip size={14} /></button>}
                      <span className="font-bold text-sm" style={{ color: '#7b4a2d' }}>{formatCurrency(num(p.amount))}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2 border-t border-slate-100">
            <Button onClick={onEdit} icon={<Edit size={15} />}>تعديل</Button>
            <Button variant="secondary" onClick={onDelete} icon={<Trash2 size={15} />}>حذف</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Detail({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-2.5 ${highlight ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-100'}`}>
      <div className={`text-[11px] mb-0.5 ${highlight ? 'text-emerald-600' : 'text-slate-400'}`}>{label}</div>
      <div className={`text-sm font-medium ${highlight ? 'text-emerald-700' : 'text-slate-700'}`}>{value}</div>
    </div>
  )
}
