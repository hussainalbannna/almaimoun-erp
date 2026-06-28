import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import {
  ArrowLeft, Plus, FileText, Edit, Trash2, TrendingUp, TrendingDown,
  BarChart2, DollarSign, Users, AlertTriangle
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Project, ProjectMilestone, VariationOrder, DailyLog } from '../../types'
import { formatCurrency, formatDate } from '../../lib/utils'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import toast from 'react-hot-toast'

type MilestoneStatus = 'pending' | 'in_progress' | 'completed' | 'invoiced' | 'paid'

interface ProjectCosts {
  directExpenses: number   // مصاريف الصندوق المباشرة
  purchaseInvoices: number // فواتير الموردين (شيكات/تحويلات)
  subcontractors: number   // مدفوعات مقاولي الباطن
  lpoApproved: number      // أوامر شراء معتمدة (التزامات)
}

export default function ProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [project, setProject] = useState<Project | null>(null)
  const [milestones, setMilestones] = useState<ProjectMilestone[]>([])
  const [vos, setVos] = useState<VariationOrder[]>([])
  const [logs, setLogs] = useState<DailyLog[]>([])
  const [costs, setCosts] = useState<ProjectCosts>({ directExpenses: 0, purchaseInvoices: 0, subcontractors: 0, lpoApproved: 0 })
  const [tab, setTab] = useState<'overview' | 'milestones' | 'costs' | 'vos' | 'logs'>('overview')
  const [deleteVo, setDeleteVo] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const [pRes, mRes, vRes, lRes, expRes, piRes, subRes, lpoRes] = await Promise.all([
      supabase.from('projects').select('*').eq('id', id).single(),
      supabase.from('project_milestones').select('*').eq('project_id', id).order('sort_order'),
      supabase.from('variation_orders').select('*').eq('project_id', id).order('created_at', { ascending: false }),
      supabase.from('daily_logs').select('*').eq('project_id', id).order('log_date', { ascending: false }),
      supabase.from('accounts_payable').select('amount').eq('project_id', id),
      supabase.from('purchase_invoices').select('amount').eq('project_id', id),
      supabase.from('subcontractor_payments').select('amount').eq('project_id', id),
      supabase.from('lpos').select('total').eq('project_id', id).eq('status', 'approved'),
    ])
    setProject(pRes.data as Project)
    setMilestones((mRes.data ?? []) as ProjectMilestone[])
    setVos((vRes.data ?? []) as VariationOrder[])
    setLogs((lRes.data ?? []) as DailyLog[])
    setCosts({
      directExpenses: (expRes.data ?? []).reduce((s, e) => s + Number(e.amount), 0),
      purchaseInvoices: (piRes.data ?? []).reduce((s, p) => s + Number(p.amount), 0),
      subcontractors: (subRes.data ?? []).reduce((s, p) => s + Number(p.amount), 0),
      lpoApproved: (lpoRes.data ?? []).reduce((s, l) => s + Number(l.total), 0),
    })
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  const generateInvoice = async (milestone: ProjectMilestone) => {
    if (!project) return
    const { data: existing } = await supabase.from('invoices').select('invoice_number')
    const invNum = ((existing ?? []).reduce((max, r) => Math.max(max, parseInt(r.invoice_number) || 0), 183) + 1).toString()
    const { data: inv, error } = await supabase.from('invoices').insert({
      invoice_number: invNum,
      customer_id: project.client_id,
      customer_name: project.client_name,
      issue_date: new Date().toISOString().slice(0, 10),
      due_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
      status: 'draft',
      subtotal: Number(milestone.amount),
      tax_rate: 0, tax_amount: 0, discount: 0,
      total: Number(milestone.amount),
      notes: milestone.name,
      project_id: project.id,
      milestone_id: milestone.id,
      payment_terms: 'صافي 14 يوم',
    }).select().single()
    if (error) { toast.error('حدث خطأ'); return }
    await supabase.from('invoice_items').insert({
      invoice_id: (inv as { id: string }).id,
      description: milestone.name + (milestone.description ? ` - ${milestone.description}` : ''),
      quantity: 1, unit_price: Number(milestone.amount), total: Number(milestone.amount), sort_order: 0,
    })
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

  // ───── الحسابات المالية ─────
  const contractValue = Number(project?.contract_value ?? 0)
  const approvedVOs = vos.filter(v => v.billable && v.status === 'approved').reduce((s, v) => s + Number(v.amount), 0)
  const totalRevenue = contractValue + approvedVOs

  const invoicedAmt = milestones.filter(m => ['invoiced', 'paid'].includes(m.status)).reduce((s, m) => s + Number(m.amount), 0)
  const receivedAmt = milestones.filter(m => m.status === 'paid').reduce((s, m) => s + Number(m.amount), 0)

  const totalCosts = costs.directExpenses + costs.purchaseInvoices + costs.subcontractors
  const netProfit = totalRevenue - totalCosts
  const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0

  const completionPct = milestones.length > 0
    ? Math.round((milestones.filter(m => ['completed', 'invoiced', 'paid'].includes(m.status)).length / milestones.length) * 100)
    : 0
  const paidMilestones = milestones.filter(m => m.status === 'paid').length

  if (loading) return <div className="p-12 text-center text-slate-400">جاري التحميل...</div>
  if (!project) return <div className="p-12 text-center text-slate-400">المشروع غير موجود</div>

  return (
    <div className="p-6" dir="rtl">
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
        <Button variant="secondary" icon={<Edit size={16} />} onClick={() => navigate(`/projects/${id}/edit`)}>تعديل</Button>
      </div>

      {/* Progress */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
        <div className="flex justify-between text-sm mb-2">
          <span className="font-medium text-slate-700">نسبة الإنجاز</span>
          <span className="font-bold" style={{ color: '#c4925a' }}>{completionPct}%</span>
        </div>
        <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${completionPct}%`, background: 'linear-gradient(90deg, #c4925a 0%, #7b4a2d 100%)' }} />
        </div>
        <div className="flex justify-between text-xs text-slate-400 mt-1.5">
          <span>{paidMilestones}/{milestones.length} مراحل مدفوعة</span>
          <span>{project.location}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-slate-100 p-1 rounded-xl w-fit overflow-x-auto">
        {([
          ['overview', 'نظرة مالية'],
          ['milestones', 'مراحل الدفع'],
          ['costs', 'المصاريف والتكاليف'],
          ['vos', 'أوامر التغيير'],
          ['logs', 'التقارير اليومية'],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${tab === key ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ===== نظرة مالية ===== */}
      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100">
              <h3 className="font-semibold text-slate-700 flex items-center gap-2">
                <BarChart2 size={16} /> الملخص المالي للمشروع
              </h3>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-slate-50">
                <span className="text-slate-600">قيمة العقد الأصلية</span>
                <span className="font-bold text-slate-800">{formatCurrency(contractValue)}</span>
              </div>
              {approvedVOs > 0 && (
                <div className="flex justify-between items-center py-2 border-b border-slate-50">
                  <span className="text-slate-600">أوامر التغيير المعتمدة</span>
                  <span className="font-medium text-blue-700">+ {formatCurrency(approvedVOs)}</span>
                </div>
              )}
              <div className="flex justify-between items-center py-2 bg-green-50 px-3 rounded-lg">
                <span className="font-semibold text-green-900">إجمالي الإيرادات</span>
                <span className="font-bold text-green-700 text-lg">{formatCurrency(totalRevenue)}</span>
              </div>

              <div className="mt-2 space-y-2">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">التكاليف الفعلية</div>
                <div className="flex justify-between items-center py-1.5">
                  <span className="text-slate-600 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-orange-400" /> مصاريف الصندوق المباشرة</span>
                  <span className="font-medium text-red-600">− {formatCurrency(costs.directExpenses)}</span>
                </div>
                <div className="flex justify-between items-center py-1.5">
                  <span className="text-slate-600 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-red-400" /> فواتير الموردين</span>
                  <span className="font-medium text-red-600">− {formatCurrency(costs.purchaseInvoices)}</span>
                </div>
                <div className="flex justify-between items-center py-1.5">
                  <span className="text-slate-600 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-purple-400" /> مقاولو الباطن</span>
                  <span className="font-medium text-red-600">− {formatCurrency(costs.subcontractors)}</span>
                </div>
                <div className="flex justify-between items-center py-2 bg-red-50 px-3 rounded-lg">
                  <span className="font-semibold text-red-900">إجمالي التكاليف</span>
                  <span className="font-bold text-red-700 text-lg">− {formatCurrency(totalCosts)}</span>
                </div>
              </div>

              <div className={`flex justify-between items-center py-3 px-4 rounded-xl mt-2 ${netProfit >= 0 ? 'bg-green-100 border border-green-200' : 'bg-red-100 border border-red-200'}`}>
                <div className="flex items-center gap-2">
                  {netProfit >= 0 ? <TrendingUp size={20} className="text-green-700" /> : <TrendingDown size={20} className="text-red-700" />}
                  <span className={`font-bold text-lg ${netProfit >= 0 ? 'text-green-900' : 'text-red-900'}`}>
                    {netProfit >= 0 ? 'الربح الصافي' : 'الخسارة الصافية'}
                  </span>
                </div>
                <div className="text-left">
                  <div className={`font-bold text-2xl ${netProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatCurrency(Math.abs(netProfit))}</div>
                  <div className={`text-sm ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>هامش {Math.abs(profitMargin).toFixed(1)}%</div>
                </div>
              </div>

              {costs.lpoApproved > 0 && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 mt-2">
                  ⚠️ يوجد أوامر شراء معتمدة بقيمة {formatCurrency(costs.lpoApproved)} لم تُحوَّل بعد لفواتير
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="text-xs text-slate-500 mb-1">المفوتر للعميل</div>
              <div className="text-lg font-bold text-amber-600">{formatCurrency(invoicedAmt)}</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="text-xs text-slate-500 mb-1">المقبوض فعلاً</div>
              <div className="text-lg font-bold text-green-600">{formatCurrency(receivedAmt)}</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="text-xs text-slate-500 mb-1">المتبقي على العميل</div>
              <div className="text-lg font-bold text-red-600">{formatCurrency(invoicedAmt - receivedAmt)}</div>
            </div>
          </div>
        </div>
      )}

      {/* ===== مراحل الدفع ===== */}
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
                      <select value={m.status} onChange={e => updateMilestoneStatus(m, e.target.value)}
                        className="text-xs border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-amber-500/30">
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
                        <button onClick={() => generateInvoice(m)}
                          className="flex items-center gap-1.5 text-xs bg-amber-50 hover:bg-amber-100 px-2.5 py-1.5 rounded-lg transition-colors"
                          style={{ color: '#7b4a2d' }}>
                          <Plus size={13} /> إنشاء فاتورة
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 border-t border-slate-200">
                <tr>
                  <td colSpan={2} className="px-4 py-2.5 font-semibold text-slate-700">الإجمالي</td>
                  <td className="px-4 py-2.5 font-bold" style={{ color: '#7b4a2d' }}>
                    {formatCurrency(milestones.reduce((s, m) => s + Number(m.amount), 0))}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ===== المصاريف والتكاليف ===== */}
      {tab === 'costs' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <button onClick={() => navigate('/cashbook')} className="bg-white rounded-xl border border-slate-200 p-4 text-right hover:shadow-sm transition-shadow">
              <div className="text-sm font-semibold text-slate-600 mb-3 flex items-center gap-2"><DollarSign size={16} className="text-orange-500" /> مصاريف الصندوق</div>
              <div className="text-2xl font-bold text-orange-600">{formatCurrency(costs.directExpenses)}</div>
            </button>
            <button onClick={() => navigate('/purchases')} className="bg-white rounded-xl border border-slate-200 p-4 text-right hover:shadow-sm transition-shadow">
              <div className="text-sm font-semibold text-slate-600 mb-3 flex items-center gap-2"><FileText size={16} className="text-red-500" /> فواتير الموردين</div>
              <div className="text-2xl font-bold text-red-600">{formatCurrency(costs.purchaseInvoices)}</div>
            </button>
            <button onClick={() => navigate('/subcontractors')} className="bg-white rounded-xl border border-slate-200 p-4 text-right hover:shadow-sm transition-shadow">
              <div className="text-sm font-semibold text-slate-600 mb-3 flex items-center gap-2"><Users size={16} className="text-purple-500" /> مقاولو الباطن</div>
              <div className="text-2xl font-bold text-purple-600">{formatCurrency(costs.subcontractors)}</div>
            </button>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="text-sm font-semibold text-slate-600 mb-3 flex items-center gap-2"><AlertTriangle size={16} className="text-amber-500" /> LPOs معتمدة (لم تُدفع)</div>
              <div className="text-2xl font-bold text-amber-600">{formatCurrency(costs.lpoApproved)}</div>
              <div className="text-xs text-slate-400 mt-2">التزامات مستقبلية</div>
            </div>
          </div>

          <div className="bg-slate-800 rounded-xl p-4 text-white">
            <div className="flex justify-between items-center">
              <span className="text-slate-300">إجمالي التكاليف الفعلية</span>
              <span className="text-2xl font-bold">{formatCurrency(totalCosts)}</span>
            </div>
            <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-600">
              <span className="text-slate-300">من إجمالي العقد</span>
              <span className="text-lg font-medium text-amber-400">{contractValue > 0 ? ((totalCosts / contractValue) * 100).toFixed(1) : 0}%</span>
            </div>
          </div>
        </div>
      )}

      {/* ===== أوامر التغيير ===== */}
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
                    <td className="px-4 py-3">{vo.billable ? <Badge color="green">نعم</Badge> : <Badge color="gray">لا</Badge>}</td>
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

      {/* ===== التقارير اليومية ===== */}
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
                      {log.material_requests && <div className="text-xs text-amber-700 mt-1">طلبات المواد: {log.material_requests}</div>}
                    </div>
                    {log.inspector_meeting && <Badge color="blue">تنسيق استشاري</Badge>}
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