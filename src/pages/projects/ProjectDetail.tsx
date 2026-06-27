import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { 
  ArrowLeft, Plus, FileText, Edit, 
  TrendingUp, TrendingDown, 
  DollarSign, Briefcase, Users, ShoppingCart
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { 
  Project, ProjectMilestone, VariationOrder, DailyLog 
} from '../../types';
import { formatCurrency, formatDate } from '../../lib/utils';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { toast } from 'react-hot-toast';

const MILESTONE_STATUS_LABELS: Record<string, string> = {
  pending: 'معلق',
  in_progress: 'جاري',
  completed: 'مكتمل',
  invoiced: 'مفوتر',
  paid: 'مدفوع'
};

const MILESTONE_STATUS_COLORS: Record<string, string> = {
  pending: 'gray',
  in_progress: 'yellow',
  completed: 'blue',
  invoiced: 'amber',
  paid: 'green'
};

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [milestones, setMilestones] = useState<ProjectMilestone[]>([]);
  const [vos, setVos] = useState<VariationOrder[]>([]);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [tab, setTab] = useState<'milestones' | 'vos' | 'logs'>('milestones');
  const [loading, setLoading] = useState(true);

  const [boxExpenses, setBoxExpenses] = useState<number>(0);
  const [purchaseInvoicesSum, setPurchaseInvoicesSum] = useState<number>(0);
  const [subcontractorAgreedSum, setSubcontractorAgreedSum] = useState<number>(0);
  const [workersSalaryShare, setWorkersSalaryShare] = useState<number>(0);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [pRes, mRes, vRes, lRes] = await Promise.all([
        supabase.from('projects').select('*').eq('id', id).single(),
        supabase.from('project_milestones').select('*').eq('project_id', id).order('sort_order', { ascending: true }),
        supabase.from('variation_orders').select('*').eq('project_id', id).order('created_at', { ascending: false }),
        supabase.from('daily_logs').select('*').eq('project_id', id).order('log_date', { ascending: false })
      ]);

      if (pRes.data) setProject(pRes.data as Project);
      if (mRes.data) setMilestones(mRes.data as ProjectMilestone[]);
      if (vRes.data) setVos(vRes.data as VariationOrder[]);
      if (lRes.data) setLogs(lRes.data as DailyLog[]);

      const { data: expensesData } = await supabase
        .from('accounts_payable')
        .select('amount')
        .eq('project_id', id);
      const totalBox = (expensesData || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
      setBoxExpenses(totalBox);

      const { data: piData } = await supabase
        .from('purchase_invoices')
        .select('amount')
        .eq('project_id', id);
      const totalPI = (piData || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
      setPurchaseInvoicesSum(totalPI);

      const { data: subAssignData } = await supabase
        .from('subcontractor_assignments')
        .select('agreed_amount')
        .eq('project_id', id);
      
      const totalSubAgreed = (subAssignData || []).reduce((sum, item) => sum + Number(item.agreed_amount || 0), 0);
      setSubcontractorAgreedSum(totalSubAgreed);

      const { data: attendanceData } = await supabase
        .from('worker_attendance')
        .select('worker_id')
        .eq('project_id', id);
      
      const totalWorkersCost = (attendanceData || []).length * 15; 
      setWorkersSalaryShare(totalWorkersCost);

    } catch (error) {
      toast.error('حدث خطأ أثناء تحميل البيانات المالية للمشروع');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const generateInvoice = async (milestone: ProjectMilestone) => {
    if (!project) return;
    try {
      const { data: existing } = await supabase
        .from('invoices')
        .select('invoice_number');
      
      const nums = (existing || []).map(r => r.invoice_number);
      const nextNum = 'INV-' + (nums.length + 184);

      const { data: inv, error } = await supabase
        .from('invoices')
        .insert({
          invoice_number: nextNum,
          customer_id: project.client_id,
          customer_name: project.client_name,
          project_id: project.id,
          milestone_id: milestone.id,
          issue_date: new Date().toISOString().slice(0, 10),
          status: 'draft',
          subtotal: Number(milestone.amount),
          total: Number(milestone.amount),
          notes: `فاتورة مرحلة: ${milestone.name}`
        })
        .select()
        .single();

      if (error) throw error;

      await supabase.from('invoice_items').insert({
        invoice_id: inv.id,
        description: milestone.name,
        quantity: 1,
        unit_price: Number(milestone.amount),
        total: Number(milestone.amount)
      });

      await supabase
        .from('project_milestones')
        .update({ status: 'invoiced', invoice_id: inv.id })
        .eq('id', milestone.id);

      toast.success('تم إنشاء الفاتورة بنجاح كمسودة');
      load();
    } catch (e) {
      toast.error('حدث خطأ أثناء إصدار الفاتورة');
    }
  };

  const updateMilestoneStatus = async (mId: string, status: string) => {
    try {
      await supabase.from('project_milestones').update({ status }).eq('id', mId);
      toast.success('تم تحديث حالة المرحلة بنجاح');
      load();
    } catch {
      toast.error('خطأ في التحديث');
    }
  };

  if (loading) return <div className="p-12 text-center text-slate-400">جاري تحميل الحسابات المالية...</div>;
  if (!project) return <div className="p-12 text-center text-slate-400">المشروع غير موجود</div>;

  const contractValue = Number(project.contract_value || 0);
  const approvedVOs = vos.filter(v => v.status === 'approved' && v.billable).reduce((sum, v) => sum + Number(v.amount || 0), 0);
  const totalRevenue = contractValue + approvedVOs;

  const totalExpenses = boxExpenses + purchaseInvoicesSum + subcontractorAgreedSum + workersSalaryShare;
  const netProfit = totalRevenue - totalExpenses;
  const isProfitable = netProfit >= 0;

  return (
    <div className="p-4 max-w-7xl mx-auto space-y-6 select-text">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/projects')} className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-800">{project.project_name}</h1>
            <p className="text-sm text-slate-500">{project.client_name} - {project.location}</p>
          </div>
        </div>
        <Button variant="secondary" onClick={() => navigate(`/projects/${id}/edit`)}>تعديل المشروع</Button>
      </div>

      <div className={`p-5 rounded-2xl border text-white flex flex-col md:flex-row justify-between items-start md:items-center gap-4 ${isProfitable ? 'bg-gradient-to-r from-emerald-600 to-teal-600 border-emerald-500' : 'bg-gradient-to-r from-rose-600 to-red-600 border-rose-500'}`}>
        <div className="space-y-1">
          <div className="text-xs text-white/80 font-medium">صافي ربح / خسارة المشروع الفعلي</div>
          <div className="text-3xl font-black flex items-center gap-2">
            {isProfitable ? <TrendingUp size={28} /> : <TrendingDown size={28} />}
            {formatCurrency(netProfit)}
          </div>
          <p className="text-xs text-white/70">تُحسب تلقائياً بطرح كافّة المصاريف والمشتريات ومقاولي الباطن من عقد المالك</p>
        </div>
        <div className="grid grid-cols-2 gap-4 w-full md:w-auto text-slate-900">
          <div className="bg-white/90 p-3 rounded-xl min-w-[140px]">
            <div className="text-[10px] text-slate-500">إجمالي الدخل (العقد + التغييرات)</div>
            <div className="text-base font-bold text-slate-800">{formatCurrency(totalRevenue)}</div>
          </div>
          <div className="bg-white/90 p-3 rounded-xl min-w-[140px]">
            <div className="text-[10px] text-slate-500">إجمالي المصاريف الكلية</div>
            <div className="text-base font-bold text-rose-600">{formatCurrency(totalExpenses)}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm space-y-1">
          <div className="text-xs text-slate-400 flex items-center gap-1"><DollarSign size={14} /> قيمة العقد الأصلي</div>
          <div className="text-lg font-bold text-slate-800">{formatCurrency(contractValue)}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm space-y-1">
          <div className="text-xs text-slate-400 flex items-center gap-1"><ShoppingCart size={14} /> فواتير وشيكات الموردين</div>
          <div className="text-lg font-bold text-amber-600">{formatCurrency(purchaseInvoicesSum)}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm space-y-1">
          <div className="text-xs text-slate-400 flex items-center gap-1"><Users size={14} /> عقود مقاولي الباطن</div>
          <div className="text-lg font-bold text-blue-600">{formatCurrency(subcontractorAgreedSum)}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm space-y-1">
          <div className="text-xs text-slate-400 flex items-center gap-1"><Briefcase size={14} /> نثريات الصندوق وأجور العمال</div>
          <div className="text-lg font-bold text-purple-600">{formatCurrency(boxExpenses + workersSalaryShare)}</div>
        </div>
      </div>

      <div className="flex gap-2 p-1 bg-slate-100 rounded-xl w-fit">
        {(['milestones', 'vos', 'logs'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors ${tab === t ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>
            {t === 'milestones' ? 'مراحل الدفع فواتير الزبون' : t === 'vos' ? 'أوامر التغيير (VO)' : 'التقارير اليومية للموقع'}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
        {tab === 'milestones' && (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-500">
                  <th className="p-3">المرحلة</th>
                  <th className="p-3">المبلغ</th>
                  <th className="p-3">الحالة</th>
                  <th className="p-3">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {milestones.map(m => (
                  <tr key={m.id} className="hover:bg-slate-50/50">
                    <td className="p-3 font-medium text-slate-800">{m.name}</td>
                    <td className="p-3 font-bold text-slate-700">{formatCurrency(Number(m.amount))}</td>
                    <td className="p-3">
                      <Badge color={MILESTONE_STATUS_COLORS[m.status] || 'gray'}>{MILESTONE_STATUS_LABELS[m.status] || m.status}</Badge>
                    </td>
                    <td className="p-3 flex gap-2">
                      {m.status === 'pending' && <Button onClick={() => updateMilestoneStatus(m.id, 'in_progress')}>تفعيل جاري</Button>}
                      {m.status === 'in_progress' && <Button onClick={() => updateMilestoneStatus(m.id, 'completed')}>اكتمال المرحلة</Button>}
                      {m.status === 'completed' && <Button onClick={() => generateInvoice(m)}>إصدار الفاتورة</Button>}
                      {m.invoice_id && <Link to={`/invoices/${m.invoice_id}/view`} className="p-1.5 text-xs bg-blue-50 text-blue-600 rounded-lg flex items-center gap-1"><FileText size={14} /> عرض الفاتورة</Link>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'vos' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-slate-700">أوامر التغيير الإضافية</h3>
              <Button onClick={() => navigate(`/projects/${id}/vos/new`)}>إضافة أمر تغيير جديد</Button>
            </div>
            {vos.length === 0 ? (
              <p className="text-center text-slate-400 p-6 text-xs">لا توجد أوامر تغيير مسجلة لهذا المشروع</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-slate-500">
                      <th className="p-3">الوصف</th>
                      <th className="p-3">المبلغ</th>
                      <th className="p-3">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {vos.map(v => (
                      <tr key={v.id}>
                        <td className="p-3 text-slate-700">{v.description}</td>
                        <td className="p-3 font-bold text-slate-800">{formatCurrency(Number(v.amount))}</td>
                        <td className="p-3">
                          <Badge color={v.status === 'approved' ? 'green' : v.status === 'rejected' ? 'red' : 'yellow'}>{v.status === 'approved' ? 'معتمد ومضاف للأرباح' : v.status === 'rejected' ? 'مرفوض' : 'معلق قيد الانتظار'}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === 'logs' && (
          <div className="space-y-4">
            <h3 className="font-bold text-slate-700">تقارير العمل اليومية للموقع</h3>
            {logs.length === 0 ? (
              <p className="text-center text-slate-400 p-6 text-xs">لا توجد تقارير يومية مرفوعة بعد</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {logs.map(log => (
                  <div key={log.id} className="p-3 space-y-2 hover:bg-slate-50/50 rounded-xl transition-colors">
                    <div className="flex justify-between text-xs font-bold text-slate-500">
                      <div>التاريخ: {formatDate(log.log_date)}</div>
                      {log.inspector_meeting && <Badge color="blue">تنسيق استشاري</Badge>}
                    </div>
                    <p className="text-xs text-slate-600">{log.description || 'لا يوجد وصف للعمل المنجز'}</p>
                    {log.material_requests && <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded-lg">⚙️ طلبات المواد للموقع: {log.material_requests}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
