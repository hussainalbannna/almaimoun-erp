import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  ArrowRight, FileText,
  TrendingUp, TrendingDown,
  DollarSign, Briefcase, Users, ShoppingCart, KeyRound
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

const today = () => new Date().toISOString().slice(0, 10);

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [milestones, setMilestones] = useState<ProjectMilestone[]>([]);
  const [vos, setVos] = useState<VariationOrder[]>([]);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [tab, setTab] = useState<'milestones' | 'vos' | 'logs'>('milestones');
  const [loading, setLoading] = useState(true);

  // المصاريف الفعلية المدفوعة فقط (التدفق النقدي الحقيقي)
  const [boxExpenses, setBoxExpenses] = useState<number>(0);
  const [purchasePaid, setPurchasePaid] = useState<number>(0);       // مشتريات مدفوعة فعلاً
  const [purchaseDeferred, setPurchaseDeferred] = useState<number>(0); // شيكات آجلة لم تُصرف بعد (للعرض فقط)
  const [subcontractorPaidSum, setSubcontractorPaidSum] = useState<number>(0);
  const [rentalsPaidSum, setRentalsPaidSum] = useState<number>(0); // دفعات الإيجارات المرتبطة بالمشروع
  const [workersLaborCost, setWorkersLaborCost] = useState<number>(0); // تكلفة العمالة للمعرفة فقط (لا تُخصم)

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

      // 1. نثريات الصندوق (كلها مدفوعة فعلاً)
      const { data: expensesData } = await supabase
        .from('accounts_payable')
        .select('amount')
        .eq('project_id', id);
      const totalBox = (expensesData || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
      setBoxExpenses(totalBox);

      // 2. فواتير الموردين — نفصل المدفوع فعلاً عن الشيكات الآجلة
      const { data: piData } = await supabase
        .from('purchase_invoices')
        .select('amount, payment_method, check_due_date')
        .eq('project_id', id);
      let paid = 0, deferred = 0;
      const t = today();
      for (const pi of (piData || []) as Array<{ amount: number; payment_method: string; check_due_date: string | null }>) {
        const amt = Number(pi.amount || 0);
        // شيك آجل لم يحل موعده بعد = لم يُصرف فعلياً → لا يُحسب مصروفاً
        if (pi.payment_method === 'deferred_cheque' && pi.check_due_date && pi.check_due_date > t) {
          deferred += amt;
        } else {
          paid += amt;
        }
      }
      setPurchasePaid(paid);
      setPurchaseDeferred(deferred);

      // 3. مقاولو الباطن — المدفوع فعلاً فقط (من جدول المدفوعات، باستثناء الشيكات الآجلة)
      const { data: subPayData } = await supabase
        .from('subcontractor_payments')
        .select('amount, payment_method, check_due_date')
        .eq('project_id', id);
      let subPaid = 0;
      for (const sp of (subPayData || []) as Array<{ amount: number; payment_method: string; check_due_date: string | null }>) {
        const amt = Number(sp.amount || 0);
        if (sp.payment_method === 'cheque' && sp.check_due_date && sp.check_due_date > t) {
          // شيك مقاول باطن آجل لم يُصرف → لا يُحسب
          continue;
        }
        subPaid += amt;
      }
      setSubcontractorPaidSum(subPaid);

      // 4. الإيجارات والمصاريف الثابتة المرتبطة بهذا المشروع — الدفعات الفعلية المدفوعة
      // نجلب إيجارات المشروع ثم دفعاتها (المدفوع فعلاً يُحسب مصروفاً، حسب رؤية السيولة)
      const { data: projectRentals } = await supabase
        .from('rentals')
        .select('id')
        .eq('project_id', id);
      let rentalsPaid = 0;
      const rentalIds = (projectRentals || []).map(r => (r as { id: string }).id);
      if (rentalIds.length > 0) {
        const { data: rentalPayData } = await supabase
          .from('rental_payments')
          .select('amount')
          .in('rental_id', rentalIds);
        rentalsPaid = (rentalPayData || []).reduce((sum, p) => sum + Number((p as { amount: number }).amount || 0), 0);
      }
      setRentalsPaidSum(rentalsPaid);

      // 5. تكلفة العمالة على هذا الموقع — للمعرفة فقط (لا تُخصم من الربح)
      // (أيام الحضور الفعلي × متوسط الأجر اليومي المقدّر)
      const { data: attendanceData } = await supabase
        .from('worker_attendance')
        .select('worker_id, status')
        .eq('project_id', id);
      const presentDays = (attendanceData || []).filter(a =>
        (a as { status?: string }).status === 'present' || !(a as { status?: string }).status
      ).length;
      // تقدير تكلفة العمالة بمتوسط أجر يومي (يُعرض فقط، لا يدخل حساب الربح)
      setWorkersLaborCost(presentDays * 20);

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

      const nextNum = 'INV-' + String((existing?.length || 0) + 1).padStart(4, '0');

      const amount = Number(milestone.amount);

      const { data: inv, error } = await supabase
        .from('invoices')
        .insert({
          invoice_number: nextNum,
          customer_id: project.client_id,
          customer_name: project.client_name,
          project_id: project.id,
          milestone_id: milestone.id,
          issue_date: today(),
          status: 'draft',
          subtotal: amount,
          tax_rate: 0,        // البناء الجديد معفى من الضريبة (صفر)
          tax_amount: 0,      // لا ضريبة
          discount: 0,
          total: amount,      // الإجمالي = المبلغ بدون ضريبة
          notes: `فاتورة مرحلة: ${milestone.name}`
        })
        .select()
        .single();

      if (error) throw error;

      await supabase.from('invoice_items').insert({
        invoice_id: inv.id,
        description: milestone.name,
        quantity: 1,
        unit_price: amount,
        total: amount
      });

      await supabase
        .from('project_milestones')
        .update({ status: 'invoiced', invoice_id: inv.id })
        .eq('id', milestone.id);

      toast.success('تم إنشاء الفاتورة بنجاح كمسودة (معفاة من الضريبة)');
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

  // المصاريف الفعلية المدفوعة فقط — تكلفة العمالة والشيكات الآجلة لا تدخل (حسب رؤية السيولة)
  const totalExpenses = boxExpenses + purchasePaid + subcontractorPaidSum + rentalsPaidSum;
  const netProfit = totalRevenue - totalExpenses;
  const isProfitable = netProfit >= 0;

  return (
    <div className="p-4 max-w-7xl mx-auto space-y-6 select-text" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/projects')} className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg">
            <ArrowRight size={20} />
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
          <p className="text-xs text-white/70">يُحسب بطرح المصاريف المدفوعة فعلاً (نثريات + مشتريات مصروفة + مقاولو باطن + إيجارات) من إجمالي الدخل. الشيكات الآجلة وتكلفة العمالة لا تُخصم.</p>
        </div>
        <div className="grid grid-cols-2 gap-4 w-full md:w-auto text-slate-900">
          <div className="bg-white/90 p-3 rounded-xl min-w-[140px]">
            <div className="text-[10px] text-slate-500">إجمالي الدخل (العقد + التغييرات)</div>
            <div className="text-base font-bold text-slate-800">{formatCurrency(totalRevenue)}</div>
          </div>
          <div className="bg-white/90 p-3 rounded-xl min-w-[140px]">
            <div className="text-[10px] text-slate-500">المصاريف المدفوعة فعلاً</div>
            <div className="text-base font-bold text-rose-600">{formatCurrency(totalExpenses)}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm space-y-1">
          <div className="text-xs text-slate-400 flex items-center gap-1"><DollarSign size={14} /> قيمة العقد الأصلي</div>
          <div className="text-lg font-bold text-slate-800">{formatCurrency(contractValue)}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm space-y-1">
          <div className="text-xs text-slate-400 flex items-center gap-1"><ShoppingCart size={14} /> مشتريات مدفوعة فعلاً</div>
          <div className="text-lg font-bold text-amber-600">{formatCurrency(purchasePaid)}</div>
          {purchaseDeferred > 0 && (
            <div className="text-[10px] text-orange-500">+ {formatCurrency(purchaseDeferred)} شيكات آجلة (لم تُصرف)</div>
          )}
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm space-y-1">
          <div className="text-xs text-slate-400 flex items-center gap-1"><Users size={14} /> مقاولو الباطن (مدفوع)</div>
          <div className="text-lg font-bold text-blue-600">{formatCurrency(subcontractorPaidSum)}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm space-y-1">
          <div className="text-xs text-slate-400 flex items-center gap-1"><KeyRound size={14} /> الإيجارات (مدفوع)</div>
          <div className="text-lg font-bold text-cyan-600">{formatCurrency(rentalsPaidSum)}</div>
          <div className="text-[10px] text-slate-400">الإيجارات المرتبطة بالمشروع</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm space-y-1">
          <div className="text-xs text-slate-400 flex items-center gap-1"><Briefcase size={14} /> تكلفة العمالة (للمعرفة فقط)</div>
          <div className="text-lg font-bold text-purple-600">{formatCurrency(workersLaborCost)}</div>
          <div className="text-[10px] text-slate-400">لا تُخصم من ربح المشروع</div>
        </div>
      </div>

      <div className="flex gap-2 p-1 bg-slate-100 rounded-xl w-fit">
        {(['milestones', 'vos', 'logs'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors ${tab === t ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>
            {t === 'milestones' ? 'مراحل الدفع وفواتير الزبون' : t === 'vos' ? 'أوامر التغيير (VO)' : 'التقارير اليومية للموقع'}
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
                      <Badge color={(MILESTONE_STATUS_COLORS[m.status] || 'gray') as 'gray' | 'yellow' | 'blue' | 'amber' | 'green'}>{MILESTONE_STATUS_LABELS[m.status] || m.status}</Badge>
                    </td>
                    <td className="p-3 flex gap-2 flex-wrap">
                      {m.status === 'pending' && <Button onClick={() => updateMilestoneStatus(m.id, 'in_progress')}>تفعيل جاري</Button>}
                      {m.status === 'in_progress' && <Button onClick={() => updateMilestoneStatus(m.id, 'completed')}>اكتمال المرحلة</Button>}
                      {m.status === 'completed' && <Button onClick={() => generateInvoice(m)}>إصدار الفاتورة</Button>}
                      {/* إرجاع المرحلة من مفوتر إلى جاري (لتعديل الفاتورة عند الحاجة) */}
                      {m.status === 'invoiced' && <Button variant="outline" onClick={() => updateMilestoneStatus(m.id, 'in_progress')}>إرجاع إلى جاري</Button>}
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
