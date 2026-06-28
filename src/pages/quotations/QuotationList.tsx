import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, FileText, Eye, Pencil, Trash2, Calculator } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatCurrency, formatDate } from '../../lib/utils'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Badge from '../../components/ui/Badge'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import toast from 'react-hot-toast'

interface Quotation {
  id: string
  quote_number: string
  customer_name: string
  project_name: string
  location: string
  issue_date: string
  valid_until: string | null
  status: string
  total: number
  converted_project_id: string | null
  created_at: string
}

const STATUS: Record<string, { label: string; color: 'gray' | 'blue' | 'green' | 'red' | 'amber' }> = {
  draft: { label: 'مسودة', color: 'gray' },
  sent: { label: 'مُرسل', color: 'blue' },
  accepted: { label: 'مقبول', color: 'green' },
  rejected: { label: 'مرفوض', color: 'red' },
  expired: { label: 'منتهي', color: 'amber' },
}

export default function QuotationList() {
  const navigate = useNavigate()
  const [items, setItems] = useState<Quotation[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('quotations').select('*').order('created_at', { ascending: false })
    setItems((data ?? []) as Quotation[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleDelete = async () => {
    if (!deleteId) return
    const { error } = await supabase.from('quotations').delete().eq('id', deleteId)
    if (error) { toast.error('تعذّر الحذف'); return }
    toast.success('تم حذف العرض')
    setDeleteId(null)
    load()
  }

  const filtered = items.filter(q =>
    !search ||
    q.quote_number?.toLowerCase().includes(search.toLowerCase()) ||
    q.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
    q.project_name?.toLowerCase().includes(search.toLowerCase())
  )

  // إحصائيات سريعة
  const totalValue = items.reduce((s, q) => s + Number(q.total || 0), 0)
  const acceptedValue = items.filter(q => q.status === 'accepted').reduce((s, q) => s + Number(q.total || 0), 0)
  const pendingCount = items.filter(q => q.status === 'sent').length

  return (
    <div className="p-6" dir="rtl">
      {/* الترويسة */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #c4925a 0%, #7b4a2d 100%)' }}>
            <Calculator size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">عروض الأسعار</h1>
            <p className="text-sm text-slate-500">{items.length} عرض</p>
          </div>
        </div>
        <Button icon={<Plus size={16} />} onClick={() => navigate('/quotations/new')}>عرض سعر جديد</Button>
      </div>

      {/* بطاقات إحصائية */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">إجمالي قيمة العروض</div>
          <div className="text-lg font-bold text-slate-800">{formatCurrency(totalValue)}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">قيمة العروض المقبولة</div>
          <div className="text-lg font-bold text-green-700">{formatCurrency(acceptedValue)}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">عروض بانتظار الرد</div>
          <div className="text-lg font-bold text-blue-700">{pendingCount}</div>
        </div>
      </div>

      {/* البحث */}
      <div className="mb-4 relative max-w-md">
        <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input placeholder="بحث برقم العرض أو العميل أو المشروع..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
      </div>

      {/* القائمة */}
      {loading ? (
        <div className="text-center text-slate-400 py-12">جاري التحميل...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <FileText size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500">{search ? 'لا نتائج' : 'لا توجد عروض أسعار بعد'}</p>
          {!search && <Button variant="outline" className="mt-4" icon={<Plus size={16} />} onClick={() => navigate('/quotations/new')}>أنشئ أول عرض</Button>}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs">
                <tr>
                  <th className="text-right font-medium px-4 py-3">رقم العرض</th>
                  <th className="text-right font-medium px-4 py-3">العميل</th>
                  <th className="text-right font-medium px-4 py-3">المشروع</th>
                  <th className="text-right font-medium px-4 py-3">التاريخ</th>
                  <th className="text-right font-medium px-4 py-3">القيمة</th>
                  <th className="text-right font-medium px-4 py-3">الحالة</th>
                  <th className="text-center font-medium px-4 py-3">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(q => (
                  <tr key={q.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">{q.quote_number}</td>
                    <td className="px-4 py-3 text-slate-600">{q.customer_name || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{q.project_name || '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(q.issue_date)}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{formatCurrency(Number(q.total))}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Badge color={STATUS[q.status]?.color ?? 'gray'}>{STATUS[q.status]?.label ?? q.status}</Badge>
                        {q.converted_project_id && <Badge color="purple">حُوّل لمشروع</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => navigate(`/quotations/${q.id}`)} className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-blue-50" title="عرض"><Eye size={16} /></button>
                        <button onClick={() => navigate(`/quotations/${q.id}/edit`)} className="p-1.5 text-slate-400 hover:text-amber-600 rounded-lg hover:bg-amber-50" title="تعديل"><Pencil size={16} /></button>
                        <button onClick={() => setDeleteId(q.id)} className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50" title="حذف"><Trash2 size={16} /></button>
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
        onCancel={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="حذف عرض السعر"
        message="هل أنت متأكد من حذف هذا العرض؟ لا يمكن التراجع."
        confirmLabel="حذف"
        danger
      />
    </div>
  )
}