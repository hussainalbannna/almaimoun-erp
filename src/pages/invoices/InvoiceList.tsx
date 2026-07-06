import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, Eye, Pencil, Trash2, FileText, Receipt, ChevronLeft, ArrowRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatCurrency, formatDate, invoiceStatusLabel, invoiceStatusColor } from '../../lib/utils'
import type { Invoice, InvoiceStatus } from '../../types'
import Button from '../../components/ui/Button'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import toast from 'react-hot-toast'

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'الكل' },
  { value: 'draft', label: 'مسودة' },
  { value: 'sent', label: 'مرسلة' },
  { value: 'paid', label: 'مدفوعة' },
  { value: 'overdue', label: 'متأخرة' },
  { value: 'cancelled', label: 'ملغاة' },
]

interface InvoiceWithBalance extends Invoice {
  remaining_balance: number
  total_receipts: number
}

// تجميعة فواتير عميل واحد مع ملخّصه المالي
interface CustomerGroup {
  key: string
  name: string
  invoices: InvoiceWithBalance[]
  total: number
  paid: number
  remaining: number
  unpaidCount: number
}

export default function InvoiceList() {
  const [invoices, setInvoices] = useState<InvoiceWithBalance[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null) // مفتاح العميل المفتوح (null = عرض قائمة العملاء)

  const load = async () => {
    setLoading(true)
    const [invRes, recRes] = await Promise.all([
      supabase.from('invoices').select('*').order('created_at', { ascending: false }),
      supabase.from('receipts').select('invoice_id, amount'),
    ])
    const receiptsByInvoice: Record<string, number> = {}
    ;(recRes.data ?? []).forEach((r: { invoice_id: string | null; amount: number }) => {
      if (r.invoice_id) receiptsByInvoice[r.invoice_id] = (receiptsByInvoice[r.invoice_id] ?? 0) + Number(r.amount)
    })
    const data = ((invRes.data ?? []) as Invoice[]).map(inv => ({
      ...inv,
      total_receipts: receiptsByInvoice[inv.id] ?? 0,
      remaining_balance: Number(inv.total) - (receiptsByInvoice[inv.id] ?? 0),
    }))
    setInvoices(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // تصفية الفواتير (بحث + حالة) قبل التجميع
  const filteredInvoices = useMemo(() => invoices.filter(inv => {
    const matchSearch = inv.invoice_number.includes(search) || inv.customer_name.includes(search)
    const matchStatus = statusFilter === 'all' || inv.status === statusFilter
    return matchSearch && matchStatus
  }), [invoices, search, statusFilter])

  // تجميع الفواتير حسب العميل (المفتاح: معرّف العميل، أو اسمه إن لم يكن مرتبطاً بسجل)
  const customerGroups = useMemo(() => {
    const map = new Map<string, CustomerGroup>()
    for (const inv of filteredInvoices) {
      const key = inv.customer_id ?? `name:${inv.customer_name}`
      let g = map.get(key)
      if (!g) {
        g = { key, name: inv.customer_name || 'عميل غير محدد', invoices: [], total: 0, paid: 0, remaining: 0, unpaidCount: 0 }
        map.set(key, g)
      }
      g.invoices.push(inv)
      g.total += Number(inv.total)
      g.paid += inv.total_receipts
      g.remaining += Math.max(0, inv.remaining_balance)
      if (inv.remaining_balance > 0 && inv.status !== 'cancelled') g.unpaidCount += 1
    }
    // الأعلى رصيداً مستحقاً أولاً، ثم أبجدياً
    return Array.from(map.values()).sort((a, b) => b.remaining - a.remaining || a.name.localeCompare(b.name, 'ar'))
  }, [filteredInvoices])

  const selectedGroup = useMemo(
    () => (selectedCustomer ? customerGroups.find(g => g.key === selectedCustomer) ?? null : null),
    [selectedCustomer, customerGroups]
  )

  // مصدر الملخّص: فواتير العميل المفتوح، أو كل الفواتير المصفّاة في قائمة العملاء
  const summarySource = selectedGroup ? selectedGroup.invoices : filteredInvoices
  const totalAmount = summarySource.reduce((s, i) => s + Number(i.total), 0)
  const paidAmount = summarySource.reduce((s, i) => s + i.total_receipts, 0)
  const showSummary = !loading && (selectedCustomer === null ? filteredInvoices.length > 0 : !!selectedGroup)

  const handleDelete = async () => {
    if (!deleteId) return
    await supabase.from('invoice_items').delete().eq('invoice_id', deleteId)
    const { error } = await supabase.from('invoices').delete().eq('id', deleteId)
    if (error) { toast.error('حدث خطأ أثناء الحذف'); return }
    toast.success('تم حذف الفاتورة')
    setDeleteId(null)
    load()
  }

  return (
    <div className="space-y-4">
      {/* الرأس: بحث + فاتورة جديدة */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="بحث برقم الفاتورة أو اسم العميل..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-9 pr-9 pl-3 rounded-lg border border-slate-300 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none"
          />
        </div>
        <Link to="/invoices/new">
          <Button icon={<Plus size={16} />}>فاتورة جديدة</Button>
        </Link>
      </div>

      {/* تبويبات الحالة */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {STATUS_FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`h-8 px-3 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              statusFilter === f.value
                ? 'bg-primary-600 text-white'
                : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* شريط الملخّص */}
      {showSummary && (
        <div className="flex flex-wrap gap-4 bg-white rounded-xl border border-slate-200 px-5 py-3 text-sm">
          <div><span className="text-slate-500">الإجمالي: </span><span className="font-semibold">{formatCurrency(totalAmount)}</span></div>
          <div><span className="text-slate-500">المحصَّل: </span><span className="font-semibold text-green-600">{formatCurrency(paidAmount)}</span></div>
          <div><span className="text-slate-500">المتبقي: </span><span className="font-semibold text-red-600">{formatCurrency(totalAmount - paidAmount)}</span></div>
          <div>
            <span className="text-slate-500">{selectedGroup ? 'الفواتير' : 'العملاء'}: </span>
            <span className="font-semibold">{selectedGroup ? selectedGroup.invoices.length : customerGroups.length}</span>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin w-7 h-7 border-2 border-primary-600 border-t-transparent rounded-full" />
        </div>
      ) : customerGroups.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 py-16 text-center">
          <FileText size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500 text-sm">لا توجد فواتير</p>
          <Link to="/invoices/new" className="mt-3 inline-block text-sm text-primary-600 hover:underline">
            إنشاء فاتورة جديدة
          </Link>
        </div>
      ) : selectedCustomer === null ? (
        /* ═══ المستوى الأول: قائمة العملاء ═══ */
        <div className="grid grid-cols-1 gap-2.5">
          {customerGroups.map(g => (
            <button
              key={g.key}
              onClick={() => setSelectedCustomer(g.key)}
              className="w-full text-right bg-white rounded-xl border border-slate-200 px-4 py-3.5 flex items-center gap-3 hover:border-primary-300 hover:shadow-sm transition-all"
            >
              <div className="w-10 h-10 rounded-full bg-primary-50 text-primary-700 flex items-center justify-center shrink-0 font-bold">
                {g.name.trim().charAt(0) || '؟'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-800 truncate">{g.name}</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {g.invoices.length} فاتورة
                  {g.unpaidCount > 0 && <span className="text-red-500"> · {g.unpaidCount} غير مسددة</span>}
                </div>
              </div>
              <div className="text-left shrink-0">
                <div className="text-sm font-bold text-slate-800">{formatCurrency(g.total)}</div>
                {g.remaining > 0
                  ? <div className="text-xs font-medium text-red-600">متبقٍّ {formatCurrency(g.remaining)}</div>
                  : <div className="text-xs font-medium text-green-600">مسدّدة بالكامل</div>}
              </div>
              <ChevronLeft size={18} className="text-slate-300 shrink-0" />
            </button>
          ))}
        </div>
      ) : selectedGroup === null ? (
        /* حالة: العميل المفتوح لا فواتير مطابقة له (بسبب فلتر أو حذف) */
        <div className="bg-white rounded-xl border border-slate-200 py-14 text-center">
          <p className="text-slate-500 text-sm mb-3">لا توجد فواتير مطابقة لهذا العميل</p>
          <button onClick={() => setSelectedCustomer(null)} className="text-sm text-primary-600 hover:underline">
            رجوع لقائمة العملاء
          </button>
        </div>
      ) : (
        /* ═══ المستوى الثاني: فواتير العميل المحدَّد ═══ */
        <div className="space-y-3">
          {/* مسار الرجوع + اسم العميل */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedCustomer(null)}
              className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <ArrowRight size={16} />
              العملاء
            </button>
            <span className="text-slate-300">/</span>
            <h2 className="font-semibold text-slate-800 truncate">{selectedGroup.name}</h2>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="px-4 py-3 text-right font-medium text-slate-500">رقم الفاتورة</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-500">التاريخ</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-500">الحالة</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">المبلغ</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">المتبقي</th>
                    <th className="px-4 py-3 text-center font-medium text-slate-500">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedGroup.invoices.map(inv => (
                    <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-primary-700">{inv.invoice_number}</td>
                      <td className="px-4 py-3 text-slate-500">{formatDate(inv.issue_date)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${invoiceStatusColor[inv.status as InvoiceStatus]}`}>
                          {invoiceStatusLabel[inv.status as InvoiceStatus]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-left font-semibold text-slate-800">{formatCurrency(Number(inv.total))}</td>
                      <td className="px-4 py-3 text-left">
                        {inv.remaining_balance > 0 ? (
                          <span className="font-semibold text-red-600">{formatCurrency(inv.remaining_balance)}</span>
                        ) : (
                          <span className="text-green-600 font-medium text-xs">مسددة</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <Link to={`/invoices/${inv.id}/view`} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-primary-600" title="عرض">
                            <Eye size={15} />
                          </Link>
                          <Link to={`/invoices/${inv.id}/edit`} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-primary-600" title="تعديل">
                            <Pencil size={15} />
                          </Link>
                          {inv.remaining_balance > 0 && inv.status !== 'cancelled' && (
                            <Link to={`/receipts/new?invoice=${inv.id}`} className="p-1.5 rounded-lg hover:bg-green-50 text-slate-500 hover:text-green-600" title="تحصيل إيصال">
                              <Receipt size={15} />
                            </Link>
                          )}
                          <button onClick={() => setDeleteId(inv.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-600" title="حذف">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        title="حذف الفاتورة"
        message="هل أنت متأكد من حذف هذه الفاتورة؟ لا يمكن التراجع عن هذا الإجراء."
        confirmLabel="حذف"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
        danger
      />
    </div>
  )
}
