import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ArrowLeft, Plus, FileText, Edit, Trash2, AlertTriangle, CheckCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Project, ProjectMilestone, VariationOrder, DailyLog } from '../../types'
import { formatCurrency, formatDate } from '../../lib/utils'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import toast from 'react-hot-toast'

const MILESTONE_STATUS_LABELS: Record<string, string> = {
  pending: 'معلق', in_progress: 'جارٍ', completed: 'مكتمل', invoiced: 'مفوتر', paid: 'مدفوع'
}
const MILESTONE_STATUS_COLORS: Record<string, 'gray' | 'yellow' | 'blue' | 'amber' | 'green'> = {
  pending: 'gray', in_progress: 'yellow', completed: 'blue', invoiced: 'amber', paid: 'green'
}

export default function ProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [project, setProject] = useState<Project | null>(null)
  const [milestones, setMilestones] = useState<ProjectMilestone[]>([])
  const [vos, setVos] = useState<VariationOrder[]>([])
  const [logs, setLogs] = useState<DailyLog[]>([])
  const [tab, setTab] = useState<'milestones' | 'vos' | 'logs'>('milestones')
  const [deleteVo, setDeleteVo] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const [pRes, mRes, vRes, lRes] = await Promise.all([
      supabase.from('projects').select('*').eq('id', id).single(),
      supabase.from('project_milestones').select('*').eq('project_id', id).order('sort_order'),
      supabase.from('variation_orders').select('*').eq('project_id', id).order('created_at', { ascending: false }),
      supabase.from('daily_logs').select('*').eq('project_id', id).order('log_date', { ascending: false }),
    ])
    setProject(pRes.data as Project)
    setMilestones((mRes.data ?? []) as ProjectMilestone[])
    setVos((vRes.data ?? []) as VariationOrder[])
    setLogs((lRes.data ?? []) as DailyLog[])
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  const generateInvoice = async (milestone: ProjectMilestone) => {
    if (!project) return
    const { data: existing } = await supabase.from('invoices').select('invoice_number')
    const nums = (existing ?? []).map((r: { invoice_number: string }) => r.invoice_number)
    const invNum = ((existing ?? []).reduce((max, r) => Math.max(max, parseInt(r.invoice_number) || 0), 183) + 1).toString()

    const { data: inv, error } = await supabase.from('invoices').insert({
      invoice_number: invNum,
      customer_name: project.client_name,
      issue_date: new Date().toISOString().slice(0, 10),
      due_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
      status: 'draft',
      subtotal: Number(milestone.amount),
      tax_rate: 0,
      tax_amount: 0,
      discount: 0,
      total: Number(milestone.amount),
      notes: milestone.name,
      project_id: project.id,
      milestone_id: milestone.id,
      payment_terms: 'صافي 14 يوم',
    }).select().single()
    if (error) { toast.error('حدث خطأ'); return }
    // Add invoice item
    await supabase.from('invoice_items').insert({
      invoice_id: (inv as { id: string }).id,
      description: milestone.name + (milestone.description ? ` - ${milestone.description}` : ''),
      quantity: 1,
      unit_price: Number(milestone.amount),
      total: Number(milestone.amount),
      sort_order: 0,
    })
    // Update milestone status
    await supabase.from('project_milestones').update({ status: 'invoiced', invoice_id: (inv as { id: string }).id }).eq('id', milestone.id)
    toast.success('تم إنشاء الفاتورة')
    navigate(`/invoices/${(inv as { id: string }).id}/view`)
  }

  const updateMilestoneStatus = async (m: ProjectMilestone, status: string) => {
    await supabase.from('project_milestones').update({ status }).eq('id', m.id)
    setMilestones(prev => prev.map(x => x.id === m.id ? { ...x, status: status as MilestoneStatus } : x))
    toast.success('تم تحديث الحالة')
  }

  const deleteVO = async () => {
    if (!deleteVo) return
    await supabase.from('variation_orders').delete().eq('id', deleteVo)
    toast.success('تم الحذف')
    setDeleteVo(null)
    load()
  }

  const paidMilestones = milestones.filter(m => m.status === 'paid').length
  const invoicedAmt = milestones.filter(m => ['invoiced', 'paid'].includes(m.status)).reduce((s, m) => s + Number(m.amount), 0)
  const totalVO = vos.filter(v => v.billable).reduce((s, v) => s + Number(v.amount), 0)
  const manDays = logs.length // simplified: 1 man-day per log entry

  if (loading) return <div className="p-12 text-center text-slate-400">جاري التحميل...</div>
  if (!project) return <div className="p-12 text-center text-slate-400">المشروع غير موجود</div>

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/projects')} className="p-2 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{project.project_name}</h1>
            <p className="text-slate-500 text-sm">{project.client_name} — {project.location}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={<Edit size={16} />} onClick={() => navigate(`/projects/${id}/edit`)}>تعديل</Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">قيمة العقد</div>
          <div className="text-lg font-bold" style={{ color: '#7b4a2d' }}>{formatCurrency(Number(project.contract_value))}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">المفوتر / المدفوع</div>
          <div className="text-lg font-bold text-amber-600">{formatCurrency(invoicedAmt)}</div>
          <div className="text-xs text-slate-400 mt-0.5">{paidMilestones}/{milestones.length} مراحل</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">أوامر التغيير</div>
          <div className="text-lg font-bold text-blue-600">{formatCurrency(totalVO)}</div>
          <div className="text-xs text-slate-400 mt-0.5">{vos.length} أمر</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">يوم عمل (Man-Days)</div>
          <div className="text-lg font-bold text-slate-700">{logs.length}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-slate-100 p-1 rounded-xl w-fit">
        {([['milestones', 'مراحل الدفع'], ['vos', 'أوامر التغيير'], ['logs', 'التقارير اليومية']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${tab === key ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
          >{label}</button>
        ))}
      </div>

      {/* Milestones Tab */}
      {tab === 'milestones' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600 w-8">#</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">المرحلة</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">المبلغ</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">الحالة</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {milestones.map((m, idx) => (
                  <tr key={m.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 text-slate-400">{idx + 1}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{m.name}</td>
                    <td className="px-4 py-3 font-medium" style={{ color: '#7b4a2d' }}>{formatCurrency(Number(m.amount))}</td>
                    <td className="px-4 py-3">
                      <select
                        value={m.status}
                        onChange={e => updateMilestoneStatus(m, e.target.value)}
                        className="text-xs border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                      >
                        <option value="pending">معلق</option>
                        <option value="in_progress">جارٍ</option>
                        <option value="completed">مكتمل</option>
                        <option value="invoiced">مفوتر</option>
                        <option value="paid">مدفوع</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      {m.invoice_id ? (
                        <Link to={`/invoices/${m.invoice_id}/view`}>
                          <button className="flex items-center gap-1.5 text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition-colors">
                            <FileText size={13} /> عرض الفاتورة
                          </button>
                        </Link>
                      ) : m.status === 'completed' ? (
                        <button
                          onClick={() => generateInvoice(m)}
                          className="flex items-center gap-1.5 text-xs bg-amber-50 hover:bg-amber-100 px-2.5 py-1.5 rounded-lg transition-colors"
                          style={{ color: '#7b4a2d' }}
                        >
                          <Plus size={13} /> إنشاء فاتورة
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Variation Orders Tab */}
      {tab === 'vos' && (
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center">
            <span className="font-medium text-slate-700">أوامر التغيير</span>
            <Button size="sm" icon={<Plus size={16} />} onClick={() => navigate(`/projects/${id}/vos/new`)}>إضافة أمر تغيير</Button>
          </div>
          {vos.length === 0 ? (
            <div className="p-8 text-center text-slate-400">لا توجد أوامر تغيير</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">رقم VO</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">الوصف</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">المبلغ</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">قابل للفوترة</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">الحالة</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {vos.map(vo => (
                  <tr key={vo.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-mono text-slate-600">{vo.vo_number || '-'}</td>
                    <td className="px-4 py-3 text-slate-800">{vo.description}</td>
                    <td className="px-4 py-3 font-medium" style={{ color: '#7b4a2d' }}>
                      {vo.billable ? formatCurrency(Number(vo.amount)) : <span className="text-slate-400">غير قابل للفوترة</span>}
                    </td>
                    <td className="px-4 py-3">
                      {vo.billable ? <Badge color="green">نعم</Badge> : <Badge color="gray">لا</Badge>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge color={vo.status === 'approved' ? 'green' : vo.status === 'rejected' ? 'red' : 'yellow'}>
                        {vo.status === 'approved' ? 'معتمد' : vo.status === 'rejected' ? 'مرفوض' : 'معلق'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => setDeleteVo(vo.id)} className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50">
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Daily Logs Tab */}
      {tab === 'logs' && (
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center">
            <span className="font-medium text-slate-700">التقارير اليومية</span>
            <Button size="sm" icon={<Plus size={16} />} onClick={() => navigate(`/daily-logs/new?project=${id}`)}>تسجيل تقرير</Button>
          </div>
          {logs.length === 0 ? (
            <div className="p-8 text-center text-slate-400">لا توجد تقارير</div>
          ) : (
            <div className="divide-y divide-slate-50">
              {logs.map(log => (
                <div key={log.id} className="p-4 hover:bg-slate-50/50">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-medium text-slate-800">{formatDate(log.log_date)}</div>
                      <div className="text-sm text-slate-600 mt-1">{log.description || 'لا يوجد وصف'}</div>
                      {log.material_requests && (
                        <div className="text-xs text-amber-700 mt-1">طلبات المواد: {log.material_requests}</div>
                      )}
                    </div>
                    {log.inspector_meeting && (
                      <Badge color="blue">تنسيق استشاري</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteVo}
        title="حذف أمر التغيير"
        message="هل أنت متأكد من حذف هذا الأمر؟"
        onConfirm={deleteVO}
        onCancel={() => setDeleteVo(null)}
      />
    </div>
  )
}

type MilestoneStatus = 'pending' | 'in_progress' | 'completed' | 'invoiced' | 'paid'
