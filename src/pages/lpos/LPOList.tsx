import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, Eye, Pencil, Trash2, ShoppingCart } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatCurrency, formatDate, lpoStatusLabel, lpoStatusColor } from '../../lib/utils'
import type { LPO, LPOStatus } from '../../types'
import Button from '../../components/ui/Button'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import toast from 'react-hot-toast'

const STATUS_FILTERS = [
  { value: 'all', label: 'الكل' },
  { value: 'draft', label: 'مسودة' },
  { value: 'sent', label: 'مرسل' },
  { value: 'approved', label: 'موافق' },
  { value: 'received', label: 'مستلم' },
  { value: 'cancelled', label: 'ملغى' },
]

export default function LPOList() {
  const [lpos, setLpos] = useState<LPO[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('lpos').select('*').order('created_at', { ascending: false })
    setLpos((data ?? []) as LPO[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = lpos.filter(l => {
    const matchSearch = l.lpo_number.includes(search) || l.supplier_name.includes(search)
    const matchStatus = statusFilter === 'all' || l.status === statusFilter
    return matchSearch && matchStatus
  })

  const handleDelete = async () => {
    if (!deleteId) return
    await supabase.from('lpo_items').delete().eq('lpo_id', deleteId)
    const { error } = await supabase.from('lpos').delete().eq('id', deleteId)
    if (error) { toast.error('حدث خطأ أثناء الحذف'); return }
    toast.success('تم حذف أمر الشراء')
    setDeleteId(null)
    load()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="بحث برقم أمر الشراء أو اسم المورد..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-9 pr-9 pl-3 rounded-lg border border-slate-300 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none"
          />
        </div>
        <Link to="/lpos/new">
          <Button icon={<Plus size={16} />}>أمر شراء جديد</Button>
        </Link>
      </div>

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

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin w-7 h-7 border-2 border-primary-600 border-t-transparent rounded-full" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 py-16 text-center">
          <ShoppingCart size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500 text-sm">لا توجد أوامر شراء</p>
          <Link to="/lpos/new" className="mt-3 inline-block text-sm text-primary-600 hover:underline">
            إنشاء أمر شراء جديد
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-3 text-right font-medium text-slate-500">رقم أمر الشراء</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-500">المورد</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-500">تاريخ الإصدار</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-500">تاريخ التسليم</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-500">الحالة</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">المبلغ</th>
                  <th className="px-4 py-3 text-center font-medium text-slate-500">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(lpo => (
                  <tr key={lpo.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-primary-700">{lpo.lpo_number}</td>
                    <td className="px-4 py-3 text-slate-700">{lpo.supplier_name}</td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(lpo.issue_date)}</td>
                    <td className="px-4 py-3 text-slate-500">{lpo.delivery_date ? formatDate(lpo.delivery_date) : '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${lpoStatusColor[lpo.status as LPOStatus]}`}>
                        {lpoStatusLabel[lpo.status as LPOStatus]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-left font-semibold text-slate-800">{formatCurrency(Number(lpo.total))}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <Link to={`/lpos/${lpo.id}/view`} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-primary-600">
                          <Eye size={15} />
                        </Link>
                        <Link to={`/lpos/${lpo.id}/edit`} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-primary-600">
                          <Pencil size={15} />
                        </Link>
                        <button onClick={() => setDeleteId(lpo.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-600">
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
      )}

      <ConfirmDialog
        open={!!deleteId}
        title="حذف أمر الشراء"
        message="هل أنت متأكد من حذف أمر الشراء هذا؟"
        confirmLabel="حذف"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
        danger
      />
    </div>
  )
}
