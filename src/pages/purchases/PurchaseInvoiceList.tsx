import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Edit, Trash2, Search, FileText } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { PurchaseInvoice } from '../../types'
import { formatCurrency, formatDate } from '../../lib/utils'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import toast from 'react-hot-toast'

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'نقداً',
  bank_transfer: 'تحويل بنكي',
  deferred_cheque: 'شيك آجل',
}

export default function PurchaseInvoiceList() {
  const navigate = useNavigate()
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('purchase_invoices')
      .select('*')
      .order('created_at', { ascending: false })
    setInvoices((data ?? []) as PurchaseInvoice[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleDelete = async () => {
    if (!deleteId) return
    await supabase.from('purchase_invoices').delete().eq('id', deleteId)
    toast.success('تم حذف فاتورة الشراء')
    setDeleteId(null)
    load()
  }

  const filtered = invoices.filter(inv =>
    inv.supplier_name.toLowerCase().includes(search.toLowerCase()) ||
    inv.vendor_invoice_number.toLowerCase().includes(search.toLowerCase()) ||
    inv.project_name.toLowerCase().includes(search.toLowerCase())
  )

  const totalAmount = invoices.reduce((s, inv) => s + Number(inv.amount), 0)
  const pdcCount = invoices.filter(inv => inv.payment_method === 'deferred_cheque').length

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">الفواتير والمدفوعات</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            إجمالي: {invoices.length} فاتورة — المبلغ الكلي: {formatCurrency(totalAmount)}
            {pdcCount > 0 && <span className="text-orange-600"> — شيكات آجلة: {pdcCount}</span>}
          </p>
        </div>
        <Button onClick={() => navigate('/purchases/new')} icon={<Plus size={16} />}>تسجيل فاتورة شراء</Button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <div className="relative max-w-xs">
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="بحث بالمورد أو المشروع أو رقم الفاتورة..."
              className="w-full pr-9 pl-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400">جاري التحميل...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <FileText size={40} className="mx-auto mb-3 text-slate-300" />
            <p>لا توجد فواتير مسجلة</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">المورد</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">المشروع</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">رقم فاتورة البائع</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">المبلغ</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">طريقة الدفع</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">التاريخ</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(inv => (
                  <tr key={inv.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{inv.supplier_name || '-'}</div>
                      {inv.lpo_number && <div className="text-xs text-slate-400">LPO: {inv.lpo_number}</div>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{inv.project_name || '-'}</td>
                    <td className="px-4 py-3 font-mono text-slate-600">{inv.vendor_invoice_number || '-'}</td>
                    <td className="px-4 py-3 font-semibold" style={{ color: '#7b4a2d' }}>
                      {formatCurrency(Number(inv.amount))}
                    </td>
                    <td className="px-4 py-3">
                      <Badge color={inv.payment_method === 'deferred_cheque' ? 'amber' : inv.payment_method === 'bank_transfer' ? 'blue' : 'green'}>
                        {PAYMENT_LABELS[inv.payment_method] ?? inv.payment_method}
                      </Badge>
                      {inv.payment_method === 'deferred_cheque' && inv.check_due_date && (
                        <div className="text-xs text-orange-600 mt-0.5">استحقاق: {formatDate(inv.check_due_date)}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(inv.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        <Link to={`/purchases/${inv.id}/edit`}>
                          <button className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-blue-50">
                            <Edit size={15} />
                          </button>
                        </Link>
                        <button onClick={() => setDeleteId(inv.id)} className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog open={!!deleteId} title="حذف الفاتورة" message="هل أنت متأكد من حذف هذه الفاتورة؟" onConfirm={handleDelete} onCancel={() => setDeleteId(null)} />
    </div>
  )
}
