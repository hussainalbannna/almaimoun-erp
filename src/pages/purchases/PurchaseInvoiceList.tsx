import { useEffect, useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Plus, Edit, Trash2, Search, FileText, AlertTriangle, Paperclip, Eye, X,
  Image as ImageIcon, Receipt, CreditCard, Building2, ChevronDown, ChevronLeft,
  Calendar, Truck, Wallet, LayoutGrid, List as ListIcon
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { PurchaseInvoice, PurchaseInvoiceDelivery } from '../../types'
import { formatCurrency, formatDate } from '../../lib/utils'
import { openStoredFile } from '../../lib/ai'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import toast from 'react-hot-toast'

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'نقداً',
  bank_transfer: 'تحويل بنكي',
  deferred_cheque: 'شيك آجل',
}
const PAYMENT_COLOR = (m: string): 'green' | 'blue' | 'amber' =>
  m === 'deferred_cheque' ? 'amber' : m === 'bank_transfer' ? 'blue' : 'green'

const num = (v: unknown): number => Number(v) || 0
const todayStr = () => new Date().toISOString().slice(0, 10)
const isImageData = (d?: string) => !!d && d.startsWith('data:image')
const isPdfData = (d?: string) => !!d && d.startsWith('data:application/pdf')
const hasFile = (d?: string) => isImageData(d) || isPdfData(d)
const daysUntil = (date: string): number =>
  Math.round((new Date(date).getTime() - new Date(todayStr()).getTime()) / 86400000)

// تاريخ الفاتورة الفعلي (entry_date) مع تراجع لتاريخ الإنشاء للفواتير القديمة
type InvoiceRow = PurchaseInvoice & { entry_date?: string | null }
const invoiceDate = (inv: InvoiceRow): string => inv.entry_date || inv.created_at

interface DocItem { label: string; data: string }

export default function PurchaseInvoiceList() {
  const navigate = useNavigate()
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [previewImg, setPreviewImg] = useState<string | null>(null)
  const [groupBy, setGroupBy] = useState<'project' | 'flat'>('project')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  // فاتورة قيد الاستعراض الكامل
  const [viewInv, setViewInv] = useState<InvoiceRow | null>(null)
  const [viewDeliveries, setViewDeliveries] = useState<PurchaseInvoiceDelivery[]>([])
  const [loadingView, setLoadingView] = useState(false)

  const load = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('purchase_invoices')
      .select('*')
    // الترتيب يدوياً حسب تاريخ الفاتورة الفعلي (entry_date)
    const rows = ((data ?? []) as InvoiceRow[]).sort((a, b) =>
      invoiceDate(b).localeCompare(invoiceDate(a))
    )
    setInvoices(rows)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleDelete = async () => {
    if (!deleteId) return
    await supabase.from('purchase_invoices').delete().eq('id', deleteId)
    toast.success('تم حذف فاتورة الشراء')
    setDeleteId(null)
    if (viewInv?.id === deleteId) setViewInv(null)
    load()
  }

  // فتح نافذة الاستعراض الكامل + جلب الديلفري نوت
  const openView = async (inv: InvoiceRow) => {
    setViewInv(inv)
    setViewDeliveries([])
    setLoadingView(true)
    const { data } = await supabase.from('purchase_invoice_deliveries')
      .select('*').eq('purchase_invoice_id', inv.id).order('created_at')
    setViewDeliveries((data ?? []) as PurchaseInvoiceDelivery[])
    setLoadingView(false)
  }

  const openDoc = (data: string) => {
    if (isImageData(data)) setPreviewImg(data)
    else openStoredFile(data, isPdfData(data) ? 'application/pdf' : '')
  }

  const getDocs = (inv: InvoiceRow): DocItem[] => {
    const docs: DocItem[] = []
    if (hasFile(inv.invoice_copy_data)) docs.push({ label: 'نسخة الفاتورة', data: inv.invoice_copy_data })
    if (hasFile(inv.payment_proof_data)) docs.push({ label: 'إثبات الدفع', data: inv.payment_proof_data })
    if (hasFile(inv.check_image_data)) docs.push({ label: 'صورة الشيك', data: inv.check_image_data })
    return docs
  }

  const filtered = useMemo(() => invoices.filter(inv => {
    const q = search.toLowerCase()
    return !q ||
      (inv.supplier_name || '').toLowerCase().includes(q) ||
      (inv.vendor_invoice_number || '').toLowerCase().includes(q) ||
      (inv.project_name || '').toLowerCase().includes(q)
  }), [invoices, search])

  // ── الإجماليات ──
  const today = todayStr()
  const totalAmount = invoices.reduce((s, inv) => s + num(inv.amount), 0)
  const pendingCheques = invoices.filter(inv => inv.payment_method === 'deferred_cheque' && inv.check_due_date && inv.check_due_date > today)
  const pendingChequesTotal = pendingCheques.reduce((s, inv) => s + num(inv.amount), 0)
  const soonCheques = pendingCheques.filter(inv => daysUntil(inv.check_due_date!) <= 7)
  const soonChequesTotal = soonCheques.reduce((s, inv) => s + num(inv.amount), 0)
  const recoverableVAT = totalAmount * (10 / 110)

  // ── التجميع حسب المشروع ──
  const groups = useMemo(() => {
    const map = new Map<string, { name: string; invoices: InvoiceRow[]; total: number }>()
    for (const inv of filtered) {
      const key = inv.project_name?.trim() || '__none__'
      const name = inv.project_name?.trim() || 'بدون مشروع'
      if (!map.has(key)) map.set(key, { name, invoices: [], total: 0 })
      const g = map.get(key)!
      g.invoices.push(inv)
      g.total += num(inv.amount)
    }
    // المشاريع المسماة أولاً، "بدون مشروع" أخيراً
    return Array.from(map.entries())
      .sort(([ka], [kb]) => (ka === '__none__' ? 1 : kb === '__none__' ? -1 : 0))
      .map(([key, g]) => ({ key, ...g }))
  }, [filtered])

  const toggleGroup = (key: string) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }))

  // صف فاتورة (يُستخدم في وضع التجميع والوضع المسطّح)
  const InvoiceRowEl = ({ inv }: { inv: InvoiceRow }) => {
    const docs = getDocs(inv)
    const isSoonCheque = inv.payment_method === 'deferred_cheque' && inv.check_due_date && inv.check_due_date > today && daysUntil(inv.check_due_date) <= 7
    const isOverdueCheque = inv.payment_method === 'deferred_cheque' && inv.check_due_date && inv.check_due_date <= today
    return (
      <tr className={`transition-colors cursor-pointer ${isSoonCheque ? 'bg-red-50/40 hover:bg-red-50' : 'hover:bg-amber-50/40'}`}
        onClick={() => openView(inv)}>
        <td className="px-4 py-3">
          <div className="font-medium text-slate-800">{inv.supplier_name || '—'}</div>
          {inv.lpo_number && <div className="text-xs text-slate-400">LPO: {inv.lpo_number}</div>}
        </td>
        <td className="px-4 py-3 font-mono text-slate-600 text-xs">{inv.vendor_invoice_number || '—'}</td>
        <td className="px-4 py-3 font-bold whitespace-nowrap" style={{ color: '#7b4a2d' }}>
          {formatCurrency(num(inv.amount))}
        </td>
        <td className="px-4 py-3">
          <Badge color={PAYMENT_COLOR(inv.payment_method)}>{PAYMENT_LABELS[inv.payment_method] ?? inv.payment_method}</Badge>
          {inv.payment_method === 'deferred_cheque' && inv.check_due_date && (
            <div className={`text-xs mt-0.5 ${isOverdueCheque ? 'text-slate-500' : isSoonCheque ? 'text-red-600 font-bold' : 'text-orange-600'}`}>
              استحقاق: {formatDate(inv.check_due_date)}
              {isSoonCheque && ` (${daysUntil(inv.check_due_date)} يوم)`}
            </div>
          )}
        </td>
        <td className="px-4 py-3">
          {docs.length > 0 ? (
            <button onClick={e => { e.stopPropagation(); docs.length === 1 ? openDoc(docs[0].data) : openView(inv) }}
              className="flex items-center gap-1 text-xs bg-slate-100 hover:bg-amber-100 text-slate-600 hover:text-amber-700 px-2.5 py-1 rounded-lg transition-colors" title="عرض المستندات">
              <Paperclip size={13} /> {docs.length}
            </button>
          ) : <span className="text-slate-300 text-xs">—</span>}
        </td>
        <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">{formatDate(invoiceDate(inv))}</td>
        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
          <div className="flex gap-1">
            <button onClick={() => openView(inv)} className="p-1.5 text-slate-400 hover:text-amber-600 rounded-lg hover:bg-amber-50" title="استعراض"><Eye size={15} /></button>
            <Link to={`/purchases/${inv.id}/edit`}>
              <button className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-blue-50" title="تعديل"><Edit size={15} /></button>
            </Link>
            <button onClick={() => setDeleteId(inv.id)} className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50" title="حذف"><Trash2 size={15} /></button>
          </div>
        </td>
      </tr>
    )
  }

  const TableHead = () => (
    <thead className="bg-slate-50 border-b border-slate-100">
      <tr>
        <th className="px-4 py-2.5 text-right font-semibold text-slate-600 text-xs">المورد</th>
        <th className="px-4 py-2.5 text-right font-semibold text-slate-600 text-xs">رقم الفاتورة</th>
        <th className="px-4 py-2.5 text-right font-semibold text-slate-600 text-xs">المبلغ</th>
        <th className="px-4 py-2.5 text-right font-semibold text-slate-600 text-xs">طريقة الدفع</th>
        <th className="px-4 py-2.5 text-right font-semibold text-slate-600 text-xs">مستندات</th>
        <th className="px-4 py-2.5 text-right font-semibold text-slate-600 text-xs">تاريخ الفاتورة</th>
        <th className="px-4 py-2.5"></th>
      </tr>
    </thead>
  )

  return (
    <div className="p-6" dir="rtl">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">الفواتير والمدفوعات</h1>
          <p className="text-slate-500 text-sm mt-0.5">مشتريات الموردين مجمّعة حسب المشروع ومتابعة الشيكات الآجلة</p>
        </div>
        <Button onClick={() => navigate('/purchases/new')} icon={<Plus size={16} />}>تسجيل فاتورة شراء</Button>
      </div>

      {/* تنبيه الشيكات القريبة */}
      {soonCheques.length > 0 && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm mb-4">
          <AlertTriangle size={18} className="text-red-600 shrink-0" />
          <span className="text-red-700">
            <strong>{soonCheques.length}</strong> شيك آجل يستحق خلال 7 أيام (إجمالي {formatCurrency(soonChequesTotal)}) — جهّز رصيدها في البنك.
          </span>
        </div>
      )}

      {/* بطاقات ملخّص */}
      {!loading && invoices.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-xs text-slate-400 flex items-center gap-1 mb-1"><Receipt size={13} /> إجمالي المشتريات</div>
            <div className="text-lg font-bold text-slate-800">{formatCurrency(totalAmount)}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">{invoices.length} فاتورة</div>
          </div>
          <div className={`rounded-xl border p-4 ${pendingChequesTotal > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
            <div className="text-xs flex items-center gap-1 mb-1" style={{ color: pendingChequesTotal > 0 ? '#b91c1c' : '#94a3b8' }}><CreditCard size={13} /> شيكات آجلة معلّقة</div>
            <div className="text-lg font-bold" style={{ color: pendingChequesTotal > 0 ? '#dc2626' : '#334155' }}>{formatCurrency(pendingChequesTotal)}</div>
            <div className="text-[11px] mt-0.5" style={{ color: pendingChequesTotal > 0 ? '#b91c1c' : '#94a3b8' }}>{pendingCheques.length} شيك لم ينصرف</div>
          </div>
          <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4">
            <div className="text-xs text-emerald-700 flex items-center gap-1 mb-1"><Receipt size={13} /> ضريبة قابلة للاسترداد</div>
            <div className="text-lg font-bold text-emerald-700">{formatCurrency(recoverableVAT)}</div>
            <div className="text-[11px] text-emerald-600 mt-0.5">تقديري (10% من المشتريات)</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-xs text-slate-400 flex items-center gap-1 mb-1"><Wallet size={13} /> مدفوع فعلياً</div>
            <div className="text-lg font-bold text-slate-800">{formatCurrency(totalAmount - pendingChequesTotal)}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">باستثناء الشيكات المعلّقة</div>
          </div>
        </div>
      )}

      {/* شريط أدوات: بحث + تبديل العرض */}
      <div className="bg-white rounded-xl border border-slate-200 mb-4 p-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="بحث بالمورد أو المشروع أو رقم الفاتورة..."
            className="w-full pr-9 pl-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
          />
        </div>
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
          <button onClick={() => setGroupBy('project')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${groupBy === 'project' ? 'bg-white shadow-sm text-amber-700' : 'text-slate-500'}`}>
            <LayoutGrid size={14} /> حسب المشروع
          </button>
          <button onClick={() => setGroupBy('flat')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${groupBy === 'flat' ? 'bg-white shadow-sm text-amber-700' : 'text-slate-500'}`}>
            <ListIcon size={14} /> قائمة موحّدة
          </button>
        </div>
      </div>

      {/* المحتوى */}
      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">جاري التحميل...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
          <FileText size={40} className="mx-auto mb-3 text-slate-300" />
          <p>{search ? 'لا نتائج للبحث' : 'لا توجد فواتير مسجلة'}</p>
        </div>
      ) : groupBy === 'flat' ? (
        /* ═══ وضع القائمة الموحّدة ═══ */
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <TableHead />
              <tbody className="divide-y divide-slate-50">
                {filtered.map(inv => <InvoiceRowEl key={inv.id} inv={inv} />)}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ═══ وضع التجميع حسب المشروع ═══ */
        <div className="space-y-4">
          {groups.map(g => {
            const isCollapsed = collapsed[g.key]
            const isNone = g.key === '__none__'
            return (
              <div key={g.key} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                {/* رأس المشروع */}
                <button onClick={() => toggleGroup(g.key)}
                  className="w-full flex items-center justify-between px-4 py-3 transition-colors hover:bg-slate-50"
                  style={{ background: isNone ? '#f8fafc' : 'linear-gradient(90deg, #faf6f1 0%, #fdfbf8 100%)' }}>
                  <div className="flex items-center gap-2.5">
                    {isCollapsed ? <ChevronLeft size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: isNone ? '#e2e8f0' : 'linear-gradient(135deg, #c4925a 0%, #7b4a2d 100%)' }}>
                      <Building2 size={16} className={isNone ? 'text-slate-500' : 'text-white'} />
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-slate-800 text-sm">{g.name}</div>
                      <div className="text-xs text-slate-400">{g.invoices.length} فاتورة</div>
                    </div>
                  </div>
                  <div className="text-left">
                    <div className="font-bold text-base" style={{ color: '#7b4a2d' }}>{formatCurrency(g.total)}</div>
                    <div className="text-[11px] text-slate-400">إجمالي المشروع</div>
                  </div>
                </button>
                {/* جدول فواتير المشروع */}
                {!isCollapsed && (
                  <div className="overflow-x-auto border-t border-slate-100">
                    <table className="w-full text-sm">
                      <TableHead />
                      <tbody className="divide-y divide-slate-50">
                        {g.invoices.map(inv => <InvoiceRowEl key={inv.id} inv={inv} />)}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <ConfirmDialog open={!!deleteId} title="حذف الفاتورة" message="هل أنت متأكد من حذف هذه الفاتورة؟ لا يمكن التراجع." confirmLabel="حذف" onConfirm={handleDelete} onCancel={() => setDeleteId(null)} danger />

      {/* ═══ نافذة استعراض الفاتورة الكاملة ═══ */}
      {viewInv && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4" onClick={() => setViewInv(null)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* رأس النافذة */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100 sticky top-0 bg-white z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #c4925a 0%, #7b4a2d 100%)' }}>
                  <Receipt size={20} className="text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">{viewInv.supplier_name || 'فاتورة شراء'}</h3>
                  <p className="text-xs text-slate-400">{viewInv.vendor_invoice_number ? `فاتورة رقم: ${viewInv.vendor_invoice_number}` : 'بدون رقم فاتورة'}</p>
                </div>
              </div>
              <button onClick={() => setViewInv(null)} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"><X size={18} /></button>
            </div>

            <div className="p-5 space-y-5">
              {/* المبلغ الكبير */}
              <div className="rounded-xl p-4 flex items-center justify-between" style={{ background: 'linear-gradient(135deg, #7b4a2d 0%, #9a6440 100%)' }}>
                <span className="text-white/90 text-sm font-medium">المبلغ الإجمالي</span>
                <span className="text-white font-black text-2xl" dir="ltr">{formatCurrency(num(viewInv.amount))}</span>
              </div>

              {/* تفاصيل */}
              <div className="grid grid-cols-2 gap-3">
                <DetailItem icon={<Building2 size={14} />} label="المشروع" value={viewInv.project_name || 'بدون مشروع'} />
                <DetailItem icon={<Calendar size={14} />} label="تاريخ الفاتورة" value={formatDate(invoiceDate(viewInv))} />
                <DetailItem icon={<Wallet size={14} />} label="طريقة الدفع" value={PAYMENT_LABELS[viewInv.payment_method] ?? viewInv.payment_method} />
                {viewInv.lpo_number && <DetailItem icon={<FileText size={14} />} label="LPO المرتبط" value={viewInv.lpo_number} />}
                {viewInv.payment_method === 'deferred_cheque' && viewInv.check_due_date && (
                  <DetailItem icon={<CreditCard size={14} />} label="استحقاق الشيك" value={formatDate(viewInv.check_due_date)}
                    highlight={viewInv.check_due_date > today && daysUntil(viewInv.check_due_date) <= 7} />
                )}
              </div>

              {viewInv.notes && (
                <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
                  <div className="text-xs font-semibold text-slate-500 mb-1">ملاحظات</div>
                  <div className="text-sm text-slate-700 whitespace-pre-wrap">{viewInv.notes}</div>
                </div>
              )}

              {/* المرفقات */}
              <div>
                <div className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-1.5"><Paperclip size={15} /> المرفقات</div>
                {getDocs(viewInv).length === 0 ? (
                  <p className="text-xs text-slate-400 bg-slate-50 rounded-lg p-3 text-center">لا توجد مرفقات لهذه الفاتورة</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {getDocs(viewInv).map((doc, i) => {
                      const isImg = isImageData(doc.data)
                      return (
                        <button key={i} onClick={() => openDoc(doc.data)}
                          className="rounded-xl border border-slate-200 overflow-hidden group hover:border-amber-300 transition-colors">
                          <div className="aspect-[4/3] bg-slate-50 relative flex items-center justify-center">
                            {isImg ? (
                              <img src={doc.data} alt={doc.label} className="w-full h-full object-cover" />
                            ) : (
                              <FileText size={32} className="text-red-500" />
                            )}
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 flex items-center justify-center transition-colors">
                              <Eye size={20} className="text-white opacity-0 group-hover:opacity-100" />
                            </div>
                          </div>
                          <div className="px-2 py-1.5 text-[11px] text-slate-600 flex items-center gap-1 justify-center">
                            {isImg ? <ImageIcon size={11} className="text-blue-500" /> : <FileText size={11} className="text-red-500" />}
                            {doc.label}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* الديلفري نوت */}
              <div>
                <div className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-1.5"><Truck size={15} /> بيانات التوصيل</div>
                {loadingView ? (
                  <p className="text-xs text-slate-400 text-center py-3">جاري التحميل...</p>
                ) : viewDeliveries.length === 0 ? (
                  <p className="text-xs text-slate-400 bg-slate-50 rounded-lg p-3 text-center">لا توجد بيانات توصيل</p>
                ) : (
                  <div className="space-y-2">
                    {viewDeliveries.map((d, i) => (
                      <div key={i} className="flex items-center gap-3 rounded-lg border border-slate-100 p-2.5">
                        {hasFile(d.delivery_image_data) ? (
                          <button onClick={() => openDoc(d.delivery_image_data)} className="w-12 h-12 rounded-lg overflow-hidden border border-slate-200 shrink-0">
                            {isImageData(d.delivery_image_data)
                              ? <img src={d.delivery_image_data} alt="DN" className="w-full h-full object-cover" />
                              : <div className="w-full h-full flex items-center justify-center bg-slate-50"><FileText size={18} className="text-red-500" /></div>}
                          </button>
                        ) : <div className="w-12 h-12 rounded-lg bg-slate-50 flex items-center justify-center shrink-0"><Truck size={16} className="text-slate-300" /></div>}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-700">{d.delivery_note_number || 'بدون رقم'}</div>
                          {d.notes && <div className="text-xs text-slate-400 truncate">{d.notes}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* أزرار */}
              <div className="flex gap-2 pt-2 border-t border-slate-100">
                <Button onClick={() => navigate(`/purchases/${viewInv.id}/edit`)} icon={<Edit size={15} />}>تعديل الفاتورة</Button>
                <Button variant="secondary" onClick={() => { setDeleteId(viewInv.id) }} icon={<Trash2 size={15} />}>حذف</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* معاينة الصورة بملء الشاشة */}
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

// عنصر تفصيل في نافذة الاستعراض
function DetailItem({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-2.5 ${highlight ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-100'}`}>
      <div className={`text-[11px] flex items-center gap-1 mb-0.5 ${highlight ? 'text-red-600' : 'text-slate-400'}`}>{icon} {label}</div>
      <div className={`text-sm font-medium ${highlight ? 'text-red-700' : 'text-slate-700'}`}>{value}</div>
    </div>
  )
}
