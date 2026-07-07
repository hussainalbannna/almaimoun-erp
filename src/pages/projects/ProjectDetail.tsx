import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  ArrowRight, FileText,
  TrendingUp, TrendingDown,
  DollarSign, Briefcase, Users, ShoppingCart, KeyRound, ChevronDown,
  Upload, Image as ImageIcon, X, Trash2
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type {
  Project, ProjectMilestone, VariationOrder, DailyLog
} from '../../types';
import { formatCurrency, formatDate } from '../../lib/utils';
import { uploadAttachment, uploadDataUrl, resolveAttachmentUrl, deleteAttachment } from '../../lib/storage';
import { compressImage, openStoredFile } from '../../lib/ai';
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

// أنواع المستندات القابلة للاختيار عند الإرفاق
const DOC_TYPES: { value: string; label: string }[] = [
  { value: 'building_permit', label: 'رخصة البناء' },
  { value: 'drawings', label: 'المخططات' },
  { value: 'id_card', label: 'بطاقة الهوية' },
  { value: 'soil_report', label: 'تقرير فحص التربة' },
  { value: 'consultant_report', label: 'تقرير زيارة الاستشاري' },
  { value: 'post_tension', label: 'مخطط البوست تنشن (Post-Tension)' },
  { value: 'other', label: 'أخرى' },
];

// عرض اسم النوع (يشمل الرموز القديمة المخزّنة سابقاً)
const DOC_TYPE_LABEL = (t: string): string => {
  const map: Record<string, string> = {
    building_permit: 'رخصة البناء', drawings: 'المخططات', id_card: 'بطاقة الهوية',
    soil_report: 'تقرير فحص التربة', consultant_report: 'تقرير زيارة الاستشاري',
    post_tension: 'مخطط البوست تنشن', other: 'أخرى',
    contract: 'العقد', customer_doc: 'مستند عميل', worker_custom: 'مستند',
  };
  return map[t] || t || 'مستند';
};

// مستند موحّد للعرض (file_url = مسار Storage أو Data URL قديم) مع مصدره (مشروع/عميل)
interface ProjectDoc {
  id: string;
  name: string;
  doc_type: string;
  file_url: string;
  file_type: string;
  source: 'project' | 'customer';
}
type DocRow = Omit<ProjectDoc, 'source'>;

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [milestones, setMilestones] = useState<ProjectMilestone[]>([]);
  const [vos, setVos] = useState<VariationOrder[]>([]);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [tab, setTab] = useState<'milestones' | 'vos' | 'logs' | 'documents'>('milestones');
  const [loading, setLoading] = useState(true);

  // ── تبويب المستندات (مستندات المشروع + العميل) ──
  const [docs, setDocs] = useState<ProjectDoc[]>([]);
  const [previewImg, setPreviewImg] = useState<string | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docType, setDocType] = useState('building_permit');
  const [docName, setDocName] = useState('');
  const docFileRef = useRef<HTMLInputElement>(null);

  // المصاريف الفعلية المدفوعة فقط (التدفق النقدي الحقيقي)
  const [boxExpenses, setBoxExpenses] = useState<number>(0);
  const [purchasePaid, setPurchasePaid] = useState<number>(0);       // مشتريات مدفوعة فعلاً
  const [purchaseDeferred, setPurchaseDeferred] = useState<number>(0); // شيكات آجلة لم تُصرف بعد (للعرض فقط)
  const [subcontractorPaidSum, setSubcontractorPaidSum] = useState<number>(0);
  const [rentalsPaidSum, setRentalsPaidSum] = useState<number>(0); // دفعات الإيجارات المرتبطة بالمشروع
  const [workersLaborCost, setWorkersLaborCost] = useState<number>(0); // تكلفة العمالة الفعلية (تُخصم)
  const [overtimeCost, setOvertimeCost] = useState<number>(0); // مبلغ الأوفر تايم من التقارير اليومية
  const [laborDetails, setLaborDetails] = useState<{ name: string; days: number; cost: number; type: string }[]>([]); // تفصيل تكلفة كل عامل

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

      // مستندات المشروع + مستندات العميل معاً (file_url مسار خفيف؛ يُحلّ عند الفتح فقط)
      const clientId = (pRes.data as Project | null)?.client_id;
      const projDocsRes = await supabase.from('documents')
        .select('id, name, doc_type, file_url, file_type')
        .eq('related_id', id).eq('related_type', 'project')
        .order('created_at', { ascending: false });
      const projDocs: ProjectDoc[] = ((projDocsRes.data ?? []) as DocRow[]).map(d => ({ ...d, source: 'project' }));
      let custDocs: ProjectDoc[] = [];
      if (clientId) {
        const custDocsRes = await supabase.from('documents')
          .select('id, name, doc_type, file_url, file_type')
          .eq('related_id', clientId).eq('related_type', 'customer')
          .order('created_at', { ascending: false });
        custDocs = ((custDocsRes.data ?? []) as DocRow[]).map(d => ({ ...d, source: 'customer' }));
      }
      setDocs([...projDocs, ...custDocs]);

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

      // 5. تكلفة العمالة الفعلية على هذا الموقع (تُخصم من الربح)
      // المنطق: لكل عامل اشتغل في الموقع (من حضوره المرتبط بالمشروع):
      //   - شهري: (الراتب الكامل ÷ 26 يوم عمل) × أيام حضوره  [الجمعة إجازة مدفوعة]
      //   - يومي: الأجر اليومي × أيام حضوره
      // الراتب الكامل = actual_salary، وإن كان صفراً نرجع لـ basic_salary + social_allowance
      const MONTHLY_WORK_DAYS = 26;
      const { data: attendanceData } = await supabase
        .from('worker_attendance')
        .select('worker_id, status')
        .eq('project_id', id);

      // عدّ أيام حضور كل عامل في هذا الموقع
      const daysByWorker = new Map<string, number>();
      for (const a of (attendanceData || []) as Array<{ worker_id: string; status?: string }>) {
        if (a.status && a.status !== 'present') continue; // نحسب الحضور فقط
        daysByWorker.set(a.worker_id, (daysByWorker.get(a.worker_id) || 0) + 1);
      }

      let laborTotal = 0;
      const details: { name: string; days: number; cost: number; type: string }[] = [];
      if (daysByWorker.size > 0) {
        const workerIds = Array.from(daysByWorker.keys());
        const { data: workersData } = await supabase
          .from('workers')
          .select('id, name, name_en, pay_type, daily_rate, actual_salary, basic_salary, social_allowance')
          .in('id', workerIds);

        for (const w of (workersData || []) as Array<{
          id: string; name: string; name_en?: string; pay_type?: string;
          daily_rate?: number; actual_salary?: number; basic_salary?: number; social_allowance?: number;
        }>) {
          const days = daysByWorker.get(w.id) || 0;
          let dayCost = 0;
          let type = '';
          if (w.pay_type === 'daily') {
            dayCost = Number(w.daily_rate || 0);
            type = 'يومي';
          } else {
            // شهري: الراتب الكامل ÷ 26
            const fullSalary = Number(w.actual_salary || 0) > 0
              ? Number(w.actual_salary || 0)
              : Number(w.basic_salary || 0) + Number(w.social_allowance || 0);
            dayCost = fullSalary / MONTHLY_WORK_DAYS;
            type = 'شهري';
          }
          const cost = dayCost * days;
          laborTotal += cost;
          details.push({ name: w.name_en || w.name, days, cost, type });
        }
        // ترتيب تنازلي حسب التكلفة
        details.sort((a, b) => b.cost - a.cost);
      }
      setWorkersLaborCost(laborTotal);
      setLaborDetails(details);

      // 6. الأوفر تايم من التقارير اليومية لهذا المشروع
      const overtimeSum = (lRes.data || []).reduce(
        (sum, log) => sum + Number((log as DailyLog & { overtime_amount?: number }).overtime_amount || 0), 0
      );
      setOvertimeCost(overtimeSum);

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

  // رفع ملف مستند إلى Storage وإرجاع مساره (الصور تُضغط أولاً) — بدل base64
  const uploadDocFile = async (file: File): Promise<string> =>
    file.type.startsWith('image/')
      ? await uploadDataUrl(await compressImage(file), 'documents')
      : await uploadAttachment(file, 'documents');

  // إرفاق مستند جديد للمشروع (النوع المختار + اسم مخصّص) → يُرفع إلى Storage
  const handleDocUpload = async (file: File) => {
    if (!id) return;
    setUploadingDoc(true);
    try {
      const filePath = await uploadDocFile(file);
      const { error } = await supabase.from('documents').insert({
        name: docName.trim() || file.name,
        doc_type: docType,
        file_url: filePath,
        file_type: file.type,
        related_id: id,
        related_type: 'project',
      });
      if (error) throw error;
      setDocName('');
      toast.success('تم رفع المستند');
      load();
    } catch (e) {
      toast.error('تعذّر رفع المستند: ' + ((e as Error)?.message ?? ''));
    } finally {
      setUploadingDoc(false);
    }
  };

  // فتح المستند: يحلّ مساره إلى رابط موقّع (أو base64 قديم) ثم يعرض الصورة أو يفتح الملف
  const openDoc = async (doc: ProjectDoc) => {
    const url = await resolveAttachmentUrl(doc.file_url);
    if (!url) { toast.error('تعذّر فتح المستند'); return; }
    if (doc.file_type?.startsWith('image/')) setPreviewImg(url);
    else if (url.startsWith('data:')) openStoredFile(url, doc.file_type);
    else window.open(url, '_blank', 'noopener');
  };

  // حذف مستند المشروع (يحذف الملف من Storage أيضاً ويتجاهل base64 القديم)
  const deleteDoc = async (doc: ProjectDoc) => {
    await supabase.from('documents').delete().eq('id', doc.id);
    deleteAttachment(doc.file_url).catch(() => {});
    setDocs(prev => prev.filter(d => d.id !== doc.id));
    toast.success('تم حذف المستند');
  };

  if (loading) return <div className="p-12 text-center text-slate-400">جاري تحميل الحسابات المالية...</div>;
  if (!project) return <div className="p-12 text-center text-slate-400">المشروع غير موجود</div>;

  const contractValue = Number(project.contract_value || 0);
  const approvedVOs = vos.filter(v => v.status === 'approved' && v.billable).reduce((sum, v) => sum + Number(v.amount || 0), 0);
  const totalRevenue = contractValue + approvedVOs;

  // المصاريف الفعلية: المدفوعة فعلاً + تكلفة العمالة الحقيقية + الأوفر تايم (الشيكات الآجلة لا تُخصم)
  const laborTotal = workersLaborCost + overtimeCost;
  const totalExpenses = boxExpenses + purchasePaid + subcontractorPaidSum + rentalsPaidSum + laborTotal;
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
          <p className="text-xs text-white/70">يُحسب بطرح كل المصاريف الفعلية (نثريات + مشتريات + مقاولو باطن + إيجارات + تكلفة العمالة والأوفر تايم) من إجمالي الدخل. الشيكات الآجلة لا تُخصم حتى تُصرف.</p>
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
          <div className="text-xs text-slate-400 flex items-center gap-1"><Briefcase size={14} /> تكلفة العمالة</div>
          <div className="text-lg font-bold text-purple-600">{formatCurrency(laborTotal)}</div>
          <div className="text-[10px] text-slate-400">{laborDetails.length > 0 ? `${laborDetails.length} عامل` : 'لم تُسجّل رواتب'}{overtimeCost > 0 ? ` · أوفر تايم ${formatCurrency(overtimeCost)}` : ''}</div>
        </div>
      </div>

      {/* تفصيل تكلفة العمالة */}
      {laborDetails.length > 0 && (
        <details className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden group">
          <summary className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors list-none">
            <div className="flex items-center gap-2">
              <Briefcase size={16} className="text-purple-600" />
              <span className="font-bold text-slate-700 text-sm">تفصيل تكلفة العمالة</span>
              <span className="text-xs text-slate-400">({laborDetails.length} عامل · {laborDetails.reduce((s, w) => s + w.days, 0)} يوم عمل)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-purple-600 text-sm">{formatCurrency(workersLaborCost)}</span>
              <ChevronDown size={16} className="text-slate-400 group-open:rotate-180 transition-transform" />
            </div>
          </summary>
          <div className="border-t border-slate-100 overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-500">
                  <th className="p-3 font-semibold text-xs">العامل</th>
                  <th className="p-3 font-semibold text-xs">النوع</th>
                  <th className="p-3 font-semibold text-xs">أيام العمل بالموقع</th>
                  <th className="p-3 font-semibold text-xs">التكلفة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {laborDetails.map((w, i) => (
                  <tr key={i} className="hover:bg-slate-50/50">
                    <td className="p-3 font-medium text-slate-800">{w.name}</td>
                    <td className="p-3"><Badge color={w.type === 'يومي' ? 'blue' : 'amber'}>{w.type}</Badge></td>
                    <td className="p-3 text-slate-600">{w.days} يوم</td>
                    <td className="p-3 font-bold text-purple-600">{formatCurrency(w.cost)}</td>
                  </tr>
                ))}
                {overtimeCost > 0 && (
                  <tr className="bg-amber-50/40">
                    <td className="p-3 font-medium text-amber-800" colSpan={3}>إجمالي الأوفر تايم (من التقارير اليومية)</td>
                    <td className="p-3 font-bold text-amber-700">{formatCurrency(overtimeCost)}</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="bg-purple-50 border-t border-purple-100">
                  <td className="p-3 font-bold text-slate-700" colSpan={3}>الإجمالي (يُخصم من ربح المشروع)</td>
                  <td className="p-3 font-black text-purple-700">{formatCurrency(laborTotal)}</td>
                </tr>
              </tfoot>
            </table>
            <p className="text-[11px] text-slate-400 px-4 py-2 bg-slate-50/50">
              العامل الشهري: الراتب الكامل ÷ 26 يوم عمل × أيام حضوره بالموقع (الجمعة إجازة مدفوعة). العامل اليومي: الأجر اليومي × أيام حضوره. أيام الحضور تُؤخذ من التقارير اليومية.
            </p>
          </div>
        </details>
      )}

      <div className="flex gap-2 p-1 bg-slate-100 rounded-xl w-fit flex-wrap">
        {(['milestones', 'vos', 'logs', 'documents'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors ${tab === t ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>
            {t === 'milestones' ? 'مراحل الدفع وفواتير الزبون' : t === 'vos' ? 'أوامر التغيير (VO)' : t === 'logs' ? 'التقارير اليومية للموقع' : 'المستندات'}
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

        {tab === 'documents' && (
          <div className="space-y-5">
            {/* نموذج إرفاق مستند جديد للمشروع */}
            <div className="bg-slate-50 rounded-xl p-4 space-y-3 border border-slate-100">
              <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2"><Upload size={16} className="text-amber-600" /> إرفاق مستند جديد للمشروع</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">نوع المستند</label>
                  <select value={docType} onChange={e => setDocType(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm outline-none focus:border-amber-400 bg-white">
                    {DOC_TYPES.map(dt => <option key={dt.value} value={dt.value}>{dt.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">اسم المستند (اختياري)</label>
                  <input value={docName} onChange={e => setDocName(e.target.value)} placeholder="اسم وصفي للمستند"
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm outline-none focus:border-amber-400" />
                </div>
              </div>
              <input ref={docFileRef} type="file" accept="image/*,application/pdf,.doc,.docx" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleDocUpload(f); e.target.value = ''; }} />
              <Button loading={uploadingDoc} onClick={() => docFileRef.current?.click()} icon={<Upload size={15} />}>
                اختيار ملف ورفعه
              </Button>
            </div>

            {/* قائمة كل مستندات المشروع والعميل */}
            {docs.length === 0 ? (
              <p className="text-center text-slate-400 p-6 text-xs">لا توجد مستندات للمشروع أو العميل بعد</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {docs.map(doc => {
                  const isImage = doc.file_type?.startsWith('image/');
                  return (
                    <div key={doc.id} className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: isImage ? '#eff6ff' : '#fef2f2' }}>
                        {isImage ? <ImageIcon size={16} className="text-blue-500" /> : <FileText size={16} className="text-red-500" />}
                      </div>
                      <button onClick={() => openDoc(doc)} className="flex-1 min-w-0 text-right">
                        <div className="text-sm font-medium text-slate-700 truncate">{doc.name}</div>
                        <div className="text-xs text-slate-400">{DOC_TYPE_LABEL(doc.doc_type)}</div>
                      </button>
                      <Badge color={doc.source === 'project' ? 'amber' : 'blue'}>{doc.source === 'project' ? 'مشروع' : 'عميل'}</Badge>
                      {doc.source === 'project' && (
                        <button onClick={() => deleteDoc(doc)} className="p-1 text-slate-400 hover:text-red-600 shrink-0" title="حذف"><Trash2 size={15} /></button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* معاينة صورة مستند */}
      {previewImg && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setPreviewImg(null)}>
          <div className="relative max-w-2xl max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <button onClick={() => setPreviewImg(null)} className="absolute -top-3 -left-3 bg-white rounded-full p-1.5 shadow-lg text-slate-600 hover:text-red-600"><X size={18} /></button>
            <img src={previewImg} alt="مستند" className="rounded-xl max-h-[90vh] object-contain" />
          </div>
        </div>
      )}
    </div>
  );
}
