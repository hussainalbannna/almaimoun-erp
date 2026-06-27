import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Printer, DollarSign, FileText, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Project, ProjectMilestone, VariationOrder } from '../../types';
import { formatCurrency, formatDate } from '../../lib/utils';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { toast } from 'react-hot-toast';

export default function ProjectStatement() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [milestones, setMilestones] = useState<ProjectMilestone[]>([]);
  const [vos, setVos] = useState<VariationOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const loadStatementData = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [pRes, mRes, vRes] = await Promise.all([
        supabase.from('projects').select('*').eq('id', id).single(),
        supabase.from('project_milestones').select('*').eq('project_id', id).order('sort_order', { ascending: true }),
        supabase.from('variation_orders').select('*').eq('project_id', id).order('created_at', { ascending: false })
      ]);

      if (pRes.data) setProject(pRes.data as Project);
      if (mRes.data) setMilestones(mRes.data as ProjectMilestone[]);
      if (vRes.data) setVos(vRes.data as VariationOrder[]);
    } catch (error) {
      toast.error('حدث خطأ أثناء تحميل كشف الحساب');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatementData();
  }, [id]);

  if (loading) return <div className="p-12 text-center text-slate-400">جاري إعداد كشف الحساب المالي...</div>;
  if (!project) return <div className="p-12 text-center text-slate-400">المشروع غير موجود</div>;

  // الحسابات المالية الخاصة بالمالك (صاحب المشروع)
  const contractValue = Number(project.contract_value || 0);
  const approvedVOs = vos.filter(v => v.status === 'approved' && v.billable).reduce((sum, v) => sum + Number(v.amount || 0), 0);
  const totalProjectValue = contractValue + approvedVOs;

  // الدفعات المستلمة (المدفوعة فعلياً) والمتبقية
  const totalPaidByClient = milestones.filter(m => m.status === 'paid').reduce((sum, m) => sum + Number(m.amount || 0), 0);
  const remainingBalance = totalProjectValue - totalPaidByClient;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-6 select-text print:p-0 print:bg-white">
      {/* هيدر التحكم - يختفي تلقائياً عند الطباعة */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-4 print:hidden">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/projects/${id}`)} className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-lg font-bold text-slate-800">كشف حساب العميل</h1>
            <p className="text-xs text-slate-500">المستند المالي الرسمي للمالك</p>
          </div>
        </div>
        <Button onClick={handlePrint} icon={<Printer size={16} />}>
          طباعة كشف الحساب
        </Button>
      </div>

      {/* ترويسة كشف الحساب الرسمية - تظهر في الطباعة بشكل أنيق */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6 print:border-none print:shadow-none">
        <div className="flex justify-between items-start border-b border-slate-100 pb-6">
          <div className="space-y-1">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">الميمون للمقاولات</h2>
            <p className="text-xs text-slate-500">مملكة البحرين | سجل تجاري رقم: 2017-01</p>
            <p className="text-xs text-slate-400">هاتف: 33221100</p>
          </div>
          <div className="text-left space-y-1">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">مستند مالي رسمي</div>
            <div className="text-sm font-mono font-bold text-slate-800">STATEMENT #{project.id.slice(0, 8).toUpperCase()}</div>
            <div className="text-xs text-slate-500">التاريخ: {formatDate(new Date().toISOString())}</div>
          </div>
        </div>

        {/* تفاصيل المالك والموقع */}
        <div className="grid grid-cols-2 gap-6 bg-slate-50 p-4 rounded-xl print:bg-slate-100/50">
          <div className="space-y-1">
            <div className="text-[10px] uppercase font-bold text-slate-400">بيانات العميل (المالك):</div>
            <div className="text-sm font-bold text-slate-800">{project.client_name}</div>
            <div className="text-xs text-slate-500">الموقع: {project.location}</div>
          </div>
          <div className="space-y-1 text-left">
            <div className="text-[10px] uppercase font-bold text-slate-400">تفاصيل المشروع:</div>
            <div className="text-sm font-bold text-slate-800">{project.project_name}</div>
            <div className="text-xs text-slate-500">الحالة العامة: {project.status === 'active' ? 'قيد التنفيذ حياً' : 'مكتمل'}</div>
          </div>
        </div>

        {/* ملخص الحساب الذهبي للمالك */}
        <div className="grid grid-cols-3 gap-4 border border-slate-100 rounded-xl p-4 bg-slate-50/50 print:bg-white">
          <div className="space-y-1">
            <div className="text-xs text-slate-500">إجمالي قيمة العقد (مع التغييرات)</div>
            <div className="text-xl font-black text-slate-800">{formatCurrency(totalProjectValue)}</div>
          </div>
          <div className="space-y-1 border-r border-slate-200/60 pr-4">
            <div className="text-xs text-slate-500">إجمالي المبالغ المستلمة منك</div>
            <div className="text-xl font-black text-emerald-600">{formatCurrency(totalPaidByClient)}</div>
          </div>
          <div className="space-y-1 border-r border-slate-200/60 pr-4">
            <div className="text-xs text-slate-500">المتبقي بذمة المالك</div>
            <div className="text-xl font-black text-amber-600">{formatCurrency(remainingBalance)}</div>
          </div>
        </div>

        {/* جدول تفصيل مراحل الدفع الأصلية المعتمدة بالعقد */}
        <div className="space-y-3 pt-4">
          <h3 className="text-sm font-bold text-slate-800 border-r-4 border-slate-800 pr-2">أولاً: الدفعات التعاقدية الأصلية (المرتبطة بالبناء)</h3>
          <div className="overflow-x-auto border border-slate-100 rounded-xl">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-medium">
                  <th className="p-3">المرحلة الإنشائية</th>
                  <th className="p-3">المبلغ المستحق</th>
                  <th className="p-3">حالة الدفعة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {milestones.map((m, index) => (
                  <tr key={m.id} className="hover:bg-slate-50/30">
                    <td className="p-3 font-medium text-slate-800">{index + 1}. {m.name}</td>
                    <td className="p-3 font-bold text-slate-700">{formatCurrency(Number(m.amount))}</td>
                    <td className="p-3">
                      <span className={`inline-flex items-center gap-1 text-xs font-bold ${m.status === 'paid' ? 'text-emerald-600' : 'text-slate-400'}`}>
                        {m.status === 'paid' ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
                        {m.status === 'paid' ? 'تم الاستلام' : 'غير مدفوعة بعد'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* جدول تفصيل أوامر التغيير الإضافية إن وجدت */}
        {vos.length > 0 && (
          <div className="space-y-3 pt-4 page-break-before">
            <h3 className="text-sm font-bold text-slate-800 border-r-4 border-slate-500 pr-2">ثانياً: أوامر التغيير والأعمال الإضافية (VO)</h3>
            <div className="overflow-x-auto border border-slate-100 rounded-xl">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-medium">
                    <th className="p-3">وصف العمل الإضافي المطلوب</th>
                    <th className="p-3">المبلغ المستحق</th>
                    <th className="p-3">حالة الاعتماد</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {vos.map(v => (
                    <tr key={v.id}>
                      <td className="p-3 text-slate-700">{v.description}</td>
                      <td className="p-3 font-bold text-slate-800">{formatCurrency(Number(v.amount))}</td>
                      <td className="p-3">
                        <span className={`text-xs font-bold ${v.status === 'approved' ? 'text-emerald-600' : 'text-amber-500'}`}>
                          {v.status === 'approved' ? 'معتمد ومضاف للحساب' : 'قيد الانتظار'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* تذييل المستند الرسمي والتوقيع */}
        <div className="pt-12 grid grid-cols-2 gap-12 text-center text-xs text-slate-400 print:pt-24">
          <div className="space-y-6">
            <div>توقيع وختم المؤسسة (الميمون للمقاولات)</div>
            <div className="h-12 border-b border-dashed border-slate-300 w-48 mx-auto"></div>
          </div>
          <div className="space-y-6">
            <div>توقيع المالك بالاستلام والموافقة</div>
            <div className="h-12 border-b border-dashed border-slate-300 w-48 mx-auto"></div>
          </div>
        </div>
      </div>
    </div>
  );
}
