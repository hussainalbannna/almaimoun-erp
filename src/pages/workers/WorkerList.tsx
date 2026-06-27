import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Edit, Trash2, Search, User, FolderOpen } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Worker } from '../../types'
import { formatCurrency } from '../../lib/utils'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import toast from 'react-hot-toast'

const BRANCH_LABELS: Record<string, string> = { '2': 'الفرع 2', '3': 'الفرع 3', '5': 'الفرع 5' }

export default function WorkerList() {
  const navigate = useNavigate()
  const [workers, setWorkers] = useState<Worker[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'company' | 'lmra'>('all')
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('workers').select('*').order('name')
    setWorkers((data ?? []) as Worker[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleDelete = async () => {
    if (!deleteId) return
    await supabase.from('workers').delete().eq('id', deleteId)
    toast.success('تم حذف العامل')
    setDeleteId(null)
    load()
  }

  const filtered = workers.filter(w =>
    (filter === 'all' || w.worker_type === filter) &&
    (w.name.toLowerCase().includes(search.toLowerCase()) || w.cpr.includes(search))
  )

  const companyCount = workers.filter(w => w.worker_type === 'company').length
  const lmraCount = workers.filter(w => w.worker_type === 'lmra').length

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">سجل العمالة</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            إجمالي: {workers.length} عامل —
            <span className="text-amber-700"> عمالة الشركة: {companyCount}</span> —
            <span className="text-blue-600"> عمالة هيئة LMRA: {lmraCount}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => navigate('/payroll')}>كشف الرواتب</Button>
          <Button onClick={() => navigate('/workers/new')} icon={<Plus size={16} />}>إضافة عامل</Button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 mb-4 bg-slate-100 p-1 rounded-xl w-fit">
        {([['all', 'الكل'], ['company', 'عمالة الشركة'], ['lmra', 'عمالة LMRA']] as const).map(([val, label]) => (
          <button key={val} onClick={() => setFilter(val)}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${filter === val ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
          >{label}</button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <div className="relative max-w-xs">
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث بالاسم أو رقم CPR..."
              className="w-full pr-9 pl-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30" />
          </div>
        </div>
        {loading ? (
          <div className="p-12 text-center text-slate-400">جاري التحميل...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-400">لا يوجد عمال</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">الاسم</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">رقم CPR</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">النوع</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">الفرع</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">الراتب الأساسي</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">طريقة الدفع</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">الحالة</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(w => (
                  <tr key={w.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                          <User size={14} className="text-amber-700" />
                        </div>
                        <div>
                          <div className="font-medium text-slate-800">{w.name}</div>
                          {w.name_en && <div className="text-xs text-slate-400">{w.name_en}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-600">{w.cpr || '-'}</td>
                    <td className="px-4 py-3">
                      <Badge color={w.worker_type === 'company' ? 'amber' : 'blue'}>
                        {w.worker_type === 'company' ? 'شركة' : 'LMRA'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{w.branch ? (BRANCH_LABELS[w.branch] ?? `فرع ${w.branch}`) : '-'}</td>
                    <td className="px-4 py-3 font-medium" style={{ color: '#7b4a2d' }}>
                      {w.pay_type === 'daily'
                        ? `${Number(w.daily_rate).toFixed(3)} د.ب/يوم`
                        : formatCurrency(Number(w.basic_salary))
                      }
                    </td>
                    <td className="px-4 py-3 text-slate-500">{w.pay_type === 'monthly' ? 'شهري' : 'يومي'}</td>
                    <td className="px-4 py-3">
                      <Badge color={w.status === 'active' ? 'green' : 'gray'}>{w.status === 'active' ? 'نشط' : 'غير نشط'}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Link to={`/workers/${w.id}/profile`}>
                          <button className="p-1.5 text-slate-400 hover:text-amber-600 rounded-lg hover:bg-amber-50" title="الملف الكامل"><FolderOpen size={16} /></button>
                        </Link>
                        <Link to={`/workers/${w.id}/edit`}>
                          <button className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-blue-50"><Edit size={16} /></button>
                        </Link>
                        <button onClick={() => setDeleteId(w.id)} className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50">
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

      <ConfirmDialog open={!!deleteId} title="حذف العامل" message="هل أنت متأكد من حذف هذا العامل؟" onConfirm={handleDelete} onCancel={() => setDeleteId(null)} />
    </div>
  )
}
