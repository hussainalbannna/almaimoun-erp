import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Eye, Trash2, Search } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Receipt } from '../../types'
import { formatCurrency, formatDate } from '../../lib/utils'
import Button from '../../components/ui/Button'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import toast from 'react-hot-toast'

// جلب الإيصالات (مصدر React Query)
async function fetchReceipts(): Promise<Receipt[]> {
  const { data } = await supabase.from('receipts').select('*').order('created_at', { ascending: false })
  return (data ?? []) as Receipt[]
}

export default function ReceiptList() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data: receipts = [], isLoading } = useQuery({ queryKey: ['receipts-list'], queryFn: fetchReceipts })

  const handleDelete = async () => {
    if (!deleteId) return
    await supabase.from('receipts').delete().eq('id', deleteId)
    toast.success('تم حذف الإيصال')
    setDeleteId(null)
    // حذف الإيصال يغيّر متبقّي الفاتورة → تحديث القائمتين
    queryClient.invalidateQueries({ queryKey: ['receipts-list'] })
    queryClient.invalidateQueries({ queryKey: ['invoices-list'] })
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return receipts.filter(r =>
      r.receipt_number.includes(search) ||
      (r.customer_name || '').toLowerCase().includes(q) ||
      r.invoice_number?.includes(search)
    )
  }, [receipts, search])

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">إيصالات الاستلام</h1>
          <p className="text-slate-500 text-sm mt-0.5">سجل المدفوعات الواردة من العملاء</p>
        </div>
        <Button onClick={() => navigate('/receipts/new')} icon={<Plus size={16} />}>إيصال جديد</Button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <div className="relative max-w-xs">
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="بحث باسم العميل أو رقم الإيصال..."
              className="w-full pr-9 pl-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
            />
          </div>
        </div>
        {isLoading ? (
          <div className="p-12 text-center text-slate-400">جاري التحميل...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-400">لا توجد إيصالات</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">رقم الإيصال</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">العميل</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">الفاتورة</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">التاريخ</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">المبلغ</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">طريقة الدفع</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 font-mono font-semibold" style={{ color: '#7b4a2d' }}>{r.receipt_number}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{r.customer_name}</td>
                    <td className="px-4 py-3 text-slate-600">{r.invoice_number || '-'}</td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(r.receipt_date)}</td>
                    <td className="px-4 py-3 font-bold text-green-700">{formatCurrency(Number(r.amount))}</td>
                    <td className="px-4 py-3 text-slate-500">{PAYMENT_LABELS[r.payment_method] ?? r.payment_method}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Link to={`/receipts/${r.id}/view`}>
                          <button className="p-1.5 text-slate-400 hover:text-amber-600 rounded-lg hover:bg-amber-50"><Eye size={16} /></button>
                        </Link>
                        <button onClick={() => setDeleteId(r.id)} className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50">
                          <Trash2 size={16} />
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

      <ConfirmDialog open={!!deleteId} title="حذف الإيصال" message="هل أنت متأكد من حذف هذا الإيصال؟" onConfirm={handleDelete} onCancel={() => setDeleteId(null)} />
    </div>
  )
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'نقداً', bank_transfer: 'تحويل بنكي', cheque: 'شيك', card: 'بطاقة'
}
