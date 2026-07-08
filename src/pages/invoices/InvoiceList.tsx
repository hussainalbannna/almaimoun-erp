import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Search, Eye, Pencil, Trash2, FileText, Receipt, Building2, ChevronDown, ChevronLeft, LayoutGrid, List as ListIcon } from 'lucide-react'
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

// مجموعة فواتير عميل واحد
interface CustomerGroup {
  key: string
  name: string
  invoices: InvoiceWithBalance[]
  total: number
  remaining: number
}

// جلب الفواتير مع حساب المتبقي (الإجمالي − مجموع الإيصالات) — مصدر React Query
async function fetchInvoicesWithBalance(): Promise<InvoiceWithBalance[]> {
  const [invRes, recRes] = await Promise.all([
    supabase.from('invoices').select('*').order('created_at', { ascending: false }),
    supabase.from('receipts').select('invoice_id, amount'),
  ])
  const receiptsByInvoice: Record<string, number> = {}
  for (const r of (recRes.data ?? []) as { invoice_id: string | null; amount: number }[]) {
    if (r.invoice_id) receiptsByInvoice[r.invoice_id] = (receiptsByInvoice[r.invoice_id] ?? 0) + Number(r.amount)
  }
  return ((invRes.data ?? []) as Invoice[]).map(inv => ({
    ...inv,
    total_receipts: receiptsByInvoice[inv.id] ?? 0,
    remaining_balance: Number(inv.total) - (receiptsByInvoice[inv.id] ?? 0),
  }))
}

export default function InvoiceList() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [groupBy, setGroupBy] = useState<'customer' | 'flat'>('customer')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const { data: invoices = [], isLoading } = useQuery({ queryKey: ['invoices-list'], queryFn: fetchInvoicesWithBalance })
  const reload = () => queryClient.invalidateQueries({ queryKey: ['invoices-list'] })

  const { filtered, totalAmount, paidAmount } = useMemo(() => {
    const q = search.toLowerCase()
    const filtered = invoices.filter(inv => {
      const matchSearch = !q
        || inv.invoice_number.toLowerCase().includes(q)
        || (inv.customer_name || '').toLowerCase().includes(q)
      const matchStatus = statusFilter === 'all' || inv.status === statusFilter
      return matchSearch && matchStatus
    })
    const totalAmount = filtered.reduce((s, i) => s + Number(i.total), 0)
    const paidAmount = filtered.reduce((s, i) => s + i.total_receipts, 0)
    return { filtered, totalAmount, paidAmount }
  }, [invoices, search, statusFilter])

  // تجميع حسب العميل — العملاء مرتّبون حسب أحدث فاتورة (يبقى ترتيب الفواتير داخل كل عميل حسب created_at)
  const groups = useMemo<CustomerGroup[]>(() => {
    const map = new Map<string, CustomerGroup>()
    for (const inv of filtered) {
      const key = inv.customer_name?.trim() || '__none__'
      const name = inv.customer_name?.trim() || 'بدون عميل'
      if (!map.has(key)) map.set(key, { key, name, invoices: [], total: 0, remaining: 0 })
      const g = map.get(key)!
      g.invoices.push(inv)
      g.total += Number(inv.total)
      g.remaining += inv.remaining_balance
    }
    // "بدون عميل" أخيراً، والباقي بترتيب ظهورهم (أحدث فاتورة أولاً)
    return Array.from(map.values())
      .sort((a, b) => (a.key === '__none__' ? 1 : b.key === '__none__' ? -1 : 0))
  }, [filtered])

  const toggleGroup = (key: string) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }))

  const handleDelete = async () => {
    if (!deleteId) return
    await supabase.from('invoice_items').delete().eq('invoice_id', deleteId)
    const { error } = await supabase.from('invoices').delete().eq('id', deleteId)
    if (error) { toast.error('حدث خطأ أثناء الحذف'); return }
    toast.success('تم حذف الفاتورة')
    setDeleteId(null)
    reload()
  }

  // رأس الجدول (يُستخدم في الوضعين)
  const TableHead = () => (
    <thead>
      <tr className="border-b border-slate-100 bg-slate-50">
        <th className="px-4 py-3 text-right font-medium text-slate-500">رقم الفاتورة</th>
        {groupBy === 'flat' && <th className="px-4 py-3 text-right font-medium text-slate-500">العميل</th>}
        <th className="px-4 py-3 text-right font-medium text-slate-500">التاريخ</th>
        <th className="px-4 py-3 text-right font-medium text-slate-500">الحالة</th>
        <th className="px-4 py-3 text-left font-medium text-slate-500">المبلغ</th>
        <th className="px-4 py-3 text-left font-medium text-slate-500">المتبقي</th>
        <th className="px-4 py-3 text-center font-medium text-slate-500">إجراءات</th>
      </tr>
    </thead>
  )

  // صف فاتورة واحدة (يُستخدم في الوضعين)
  const InvoiceRow = ({ inv }: { inv: InvoiceWithBalance }) => (
    <tr className="hover:bg-slate-50 transition-colors">
      <td className="px-4 py-3 font-medium text-primary-700">{inv.invoice_number}</td>
      {groupBy === 'flat' && <td className="px-4 py-3 text-slate-700">{inv.customer_name}</td>}
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
  )

  return (
    <div className="space-y-4">
      {/* Header */}
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
        <div className="flex items-center gap-2">
          {/* تبديل العرض: حسب العميل / قائمة موحّدة */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            <button onClick={() => setGroupBy('customer')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${groupBy === 'customer' ? 'bg-white shadow-sm text-primary-700' : 'text-slate-500'}`}>
              <LayoutGrid size={14} /> حسب العميل
            </button>
            <button onClick={() => setGroupBy('flat')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${groupBy === 'flat' ? 'bg-white shadow-sm text-primary-700' : 'text-slate-500'}`}>
              <ListIcon size={14} /> قائمة موحّدة
            </button>
          </div>
          <Link to="/invoices/new">
            <Button icon={<Plus size={16} />}>فاتورة جديدة</Button>
          </Link>
        </div>
      </div>

      {/* Status tabs */}
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

      {/* Summary bar */}
      {filtered.length > 0 && (
        <div className="flex gap-4 bg-white rounded-xl border border-slate-200 px-5 py-3 text-sm flex-wrap">
          <div><span className="text-slate-500">الإجمالي: </span><span className="font-semibold">{formatCurrency(totalAmount)}</span></div>
          <div><span className="text-slate-500">المحصَّل: </span><span className="font-semibold text-green-600">{formatCurrency(paidAmount)}</span></div>
          <div><span className="text-slate-500">المتبقي: </span><span className="font-semibold text-red-600">{formatCurrency(totalAmount - paidAmount)}</span></div>
          <div><span className="text-slate-500">الفواتير: </span><span className="font-semibold">{filtered.length}</span></div>
          {groupBy === 'customer' && <div><span className="text-slate-500">العملاء: </span><span className="font-semibold">{groups.length}</span></div>}
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin w-7 h-7 border-2 border-primary-600 border-t-transparent rounded-full" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 py-16 text-center">
          <FileText size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500 text-sm">لا توجد فواتير</p>
          <Link to="/invoices/new" className="mt-3 inline-block text-sm text-primary-600 hover:underline">
            إنشاء فاتورة جديدة
          </Link>
        </div>
      ) : groupBy === 'flat' ? (
        /* ═══ وضع القائمة الموحّدة ═══ */
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <TableHead />
              <tbody className="divide-y divide-slate-100">
                {filtered.map(inv => <InvoiceRow key={inv.id} inv={inv} />)}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ═══ وضع التجميع حسب العميل ═══ */
        <div className="space-y-4">
          {groups.map(g => {
            const isExpanded = !!expanded[g.key]
            const isNone = g.key === '__none__'
            return (
              <div key={g.key} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                {/* رأس العميل */}
                <button onClick={() => toggleGroup(g.key)}
                  className="w-full flex items-center gap-2 px-4 py-3 transition-colors hover:bg-slate-50"
                  style={{ background: isNone ? '#f8fafc' : 'linear-gradient(90deg, #faf6f1 0%, #fdfbf8 100%)' }}>
                  <div className="flex-1 flex items-center justify-between min-w-0">
                    <div className="flex items-center gap-2.5">
                      {isExpanded ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronLeft size={18} className="text-slate-400" />}
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
                      {g.remaining > 0
                        ? <div className="text-[11px] font-medium text-red-600">متبقٍّ {formatCurrency(g.remaining)}</div>
                        : <div className="text-[11px] text-green-600">مسدَّد بالكامل</div>}
                    </div>
                  </div>
                </button>
                {/* جدول فواتير العميل */}
                {isExpanded && (
                  <div className="overflow-x-auto border-t border-slate-100">
                    <table className="w-full text-sm">
                      <TableHead />
                      <tbody className="divide-y divide-slate-100">
                        {g.invoices.map(inv => <InvoiceRow key={inv.id} inv={inv} />)}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
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
