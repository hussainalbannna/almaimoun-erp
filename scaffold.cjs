/* ════════════════════════════════════════════════════════════════════
   سكربت إنشاء هيكل الصفحات والملفات الجديدة لنظام الميمون ERP
   التشغيل:  node scaffold.cjs
   آمن: لا يحذف ولا يستبدل أي ملف موجود (يتخطّى الموجود)
   ════════════════════════════════════════════════════════════════════ */
const fs = require('fs')
const path = require('path')

// مكوّن صفحة "قيد التطوير" يستخدمه كل ستب
const placeholder = `import { Sparkles } from 'lucide-react'

interface PlaceholderPageProps {
  title: string
  subtitle?: string
}

export default function PlaceholderPage({ title, subtitle }: PlaceholderPageProps) {
  return (
    <div className="p-6" dir="rtl">
      <div className="max-w-md mx-auto text-center py-20">
        <div className="w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #c4925a 0%, #7b4a2d 100%)' }}>
          <Sparkles size={28} className="text-white" />
        </div>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">{title}</h1>
        <p className="text-slate-500 leading-relaxed">{subtitle ?? 'قيد التطوير — سيتم تفعيل هذه الصفحة قريباً'}</p>
        <div className="mt-6 inline-block text-xs font-medium bg-amber-100 text-amber-800 px-3 py-1.5 rounded-full">قريباً</div>
      </div>
    </div>
  )
}
`

// مولّد ستب صفحة
const page = (name, title, subtitle) => `import PlaceholderPage from '../../components/ui/PlaceholderPage'

export default function ${name}() {
  return <PlaceholderPage title="${title}" subtitle="${subtitle}" />
}
`

// ستب مكوّن
const componentStub = (name) => `// ${name} — قيد التطوير، سيُملأ بالكود لاحقاً
export default function ${name}() {
  return null
}
`

// ستب مكتبة
const libStub = (note) => `// ${note} — قيد التطوير، سيُملأ بالكود لاحقاً
export {}
`

const files = {
  // ── المكوّن المشترك للصفحات قيد التطوير ──
  'src/components/ui/PlaceholderPage.tsx': placeholder,

  // ── الصفحات الجديدة (ستب) ──
  'src/pages/assistant/AIAssistant.tsx': page('AIAssistant', 'المساعد الذكي', 'اسأل عن مشاريعك وأرباحك وعمالك واطلب صياغة الرسائل'),
  'src/pages/quotations/QuotationList.tsx': page('QuotationList', 'عروض الأسعار', 'أنشئ عروض أسعار للفلل وحوّلها إلى مشاريع'),
  'src/pages/quotations/QuotationForm.tsx': page('QuotationForm', 'عرض سعر', 'إنشاء وتعديل عرض السعر'),
  'src/pages/quotations/QuotationView.tsx': page('QuotationView', 'عرض السعر', 'استعراض وطباعة عرض السعر'),
  'src/pages/calendar/CalendarView.tsx': page('CalendarView', 'التقويم', 'كل المواعيد والاستحقاقات في مكان واحد'),
  'src/pages/tasks/TasksBoard.tsx': page('TasksBoard', 'المهام والتذكيرات', 'نظّم مهام الفريق والمتابعات'),
  'src/pages/inventory/InventoryList.tsx': page('InventoryList', 'المخزون والمواد', 'تتبّع مواد المستودع والمخصّص لكل مشروع'),
  'src/pages/inventory/InventoryForm.tsx': page('InventoryForm', 'إضافة مادة', 'إضافة وتعديل مواد المخزون'),
  'src/pages/punch-list/PunchListPage.tsx': page('PunchListPage', 'قائمة الملاحظات', 'ملاحظات وعيوب ما قبل التسليم'),
  'src/pages/safety/SafetyPage.tsx': page('SafetyPage', 'السلامة والحوادث', 'قوائم فحص السلامة وتقارير الحوادث'),
  'src/pages/attendance/AttendanceBoard.tsx': page('AttendanceBoard', 'الحضور والانصراف', 'تتبّع حضور وانصراف العمال'),
  'src/pages/finance/FinanceDashboard.tsx': page('FinanceDashboard', 'اللوحة المالية', 'الأرباح والتدفق النقدي وتحليل المصاريف'),
  'src/pages/notifications/NotificationsCenter.tsx': page('NotificationsCenter', 'مركز الإشعارات', 'كل التنبيهات في مكان واحد'),

  // ── مكوّنات مشتركة جديدة (ستب) ──
  'src/components/ui/PageHeader.tsx': componentStub('PageHeader'),
  'src/components/ui/StatCard.tsx': componentStub('StatCard'),
  'src/components/ui/EmptyState.tsx': componentStub('EmptyState'),
  'src/components/ui/AIScanButton.tsx': componentStub('AIScanButton'),
  'src/components/ui/FileViewer.tsx': componentStub('FileViewer'),

  // ── مكتبات جديدة (ستب) ──
  'src/lib/notifications.ts': libStub('مركز التنبيهات: تجميع الاستحقاقات والوثائق المنتهية'),
  'src/lib/whatsapp.ts': libStub('قوالب رسائل واتساب: كشوف، تذكيرات، تحديثات'),
  'src/lib/pdf.ts': libStub('مولّد ملفات PDF: عروض الأسعار والتقارير'),
}

let created = 0, skipped = 0
for (const [p, content] of Object.entries(files)) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  if (fs.existsSync(p)) { console.log('⏭️  موجود (تخطّي):', p); skipped++; continue }
  fs.writeFileSync(p, content)
  console.log('✅ أُنشئ:', p)
  created++
}
console.log(`\n──────────────────────────────`)
console.log(`تم: ${created} ملف جديد | تخطّي: ${skipped} موجود`)
console.log(`الآن استبدل محتوى App.tsx و Sidebar.tsx بالملفّين المرفقين.`)
