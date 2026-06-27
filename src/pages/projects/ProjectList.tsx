import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Eye, Edit, Trash2, Search } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Project } from '../../types'
import { formatCurrency, formatDate } from '../../lib/utils'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import toast from 'react-hot-toast'

const STATUS_LABELS: Record<string, string> = {
  active: 'نشط', completed: 'منتهي', on_hold: 'متوقف', cancelled: 'ملغى'
}
const STATUS_COLORS: Record<string, 'green' | 'blue' | 'yellow' | 'red'> = {
  active: 'green', completed: 'blue', on_hold: 'yellow', cancelled: 'red'
}

export default function ProjectList() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('projects').select('*').order('created_at', { ascending: false })
    setProjects((data ?? []) as Project[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleDelete = async () => {
    if (!deleteId) return
    const { error } = await supabase.from('projects').delete().eq('id', deleteId)
    if (error) { toast.error('حدث خطأ أثناء الحذف'); return }
    toast.success('تم حذف المشروع')
    setDeleteId(null)
    load()
  }

  const filtered = projects.filter(p =>
    p.project_name.toLowerCase().includes(search.toLowerCase()) ||
    p.client_name.toLowerCase().includes(search.toLowerCase()) ||
    (p.project_number ?? '').includes(search)
  )

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">إدارة المشاريع</h1>
          <p className="text-slate-500 text-sm mt-0.5">جميع مشاريع الشركة ومتابعة المراحل</p>
        </div>
        <Button onClick={() => navigate('/projects/new')} icon={<Plus size={16} />}>مشروع جديد</Button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <div className="relative max-w-xs">
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="بحث..."
              className="w-full pr-9 pl-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400">جاري التحميل...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-400">لا توجد مشاريع</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">رقم المشروع</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">اسم المشروع</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">العميل</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">الموقع</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">قيمة العقد</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">الحالة</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 font-mono text-slate-600">{p.project_number || '-'}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{p.project_name}</td>
                    <td className="px-4 py-3 text-slate-600">{p.client_name}</td>
                    <td className="px-4 py-3 text-slate-500">{p.location || '-'}</td>
                    <td className="px-4 py-3 font-medium" style={{ color: '#7b4a2d' }}>
                      {formatCurrency(Number(p.contract_value))}
                    </td>
                    <td className="px-4 py-3">
                      <Badge color={STATUS_COLORS[p.status] ?? 'blue'}>{STATUS_LABELS[p.status] ?? p.status}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link to={`/projects/${p.id}`}>
                          <button className="p-1.5 text-slate-400 hover:text-amber-600 rounded-lg hover:bg-amber-50 transition-colors">
                            <Eye size={16} />
                          </button>
                        </Link>
                        <Link to={`/projects/${p.id}/edit`}>
                          <button className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors">
                            <Edit size={16} />
                          </button>
                        </Link>
                        <button
                          onClick={() => setDeleteId(p.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                        >
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

      <ConfirmDialog
        open={!!deleteId}
        title="حذف المشروع"
        message="هل أنت متأكد من حذف هذا المشروع؟ سيتم حذف جميع المراحل والبيانات المرتبطة به."
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  )
}
