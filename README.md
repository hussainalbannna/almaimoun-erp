# نظام الميمون للمقاولات — Al‑Maimoun ERP

نظام تخطيط موارد (ERP) متكامل لإدارة شركة مقاولات، بواجهة عربية كاملة (RTL) وبالدينار البحريني (BHD). يغطّي المشاريع والفواتير وعروض الأسعار والمشتريات والعمالة والرواتب ومقاولي الباطن والإيجارات والتقارير المالية.

[![Open in Bolt](https://bolt.new/static/open-in-bolt.svg)](https://bolt.new/~/sb1-k1c9ivwa)

---

## التقنيات

| الطبقة | التقنية |
|--------|---------|
| الواجهة | React 18 · TypeScript · Vite |
| التنسيق | Tailwind CSS (RTL) |
| التوجيه | React Router 6 |
| إدارة البيانات | TanStack Query 5 |
| الخلفية | Supabase (Auth · PostgreSQL · RLS · Edge Functions) |
| أدوات | react-hot-toast · date-fns · lucide-react · pdfjs-dist · tesseract.js (OCR) · xlsx |

## المتطلبات

- Node.js **18** فأحدث
- مشروع Supabase (مع تفعيل صفوف RLS)

## الإعداد والتشغيل

```bash
npm install
npm run dev        # تشغيل بيئة التطوير
npm run build      # فحص الأنواع + بناء الإنتاج
npm run preview    # معاينة بناء الإنتاج
npm run typecheck  # فحص الأنواع فقط
```

## متغيّرات البيئة

أنشئ ملف `.env` في الجذر (انظر `.env.example`):

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

### أسرار الخادم (Supabase Edge Functions Secrets)

تُضبط في لوحة Supabase ولا تُوضع في الواجهة إطلاقاً:

```
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY   # لدالة create-user
RESEND_API_KEY              # لدالة send-email
SMTP_FROM                   # عنوان المُرسِل (اختياري)
```

## بنية المشروع

```
src/
├─ components/   مكوّنات واجهة عامة (ui) وهيكل (layout)
├─ contexts/     AuthContext
├─ lib/          supabase · utils · finance · ai · notifications · document-parser
├─ pages/        الصفحات مقسّمة حسب المجال (projects, invoices, workers, ...)
├─ types/        تعريفات TypeScript المشتركة
├─ App.tsx       التوجيه (تحميل كسول لكل صفحة)
└─ main.tsx      نقطة الدخول
supabase/
├─ functions/    create-user · send-email
└─ migrations/   مخطّط قاعدة البيانات
```

## ملاحظات معمارية

- **جلب البيانات** موحّد على TanStack Query بمفاتيح ثابتة وإبطال متبادل بين الصفحات.
- **الضريبة**: أعمال البناء الجديد للفلل صفرية الضريبة على العميل؛ فواتير الشراء من الموردين بنسبة 10%.
- **RLS** مفعّل على كل الجداول ومقيّد للمستخدمين المسجّلين.

## النشر

مُهيّأ للنشر على Vercel (`vercel.json`): توجيه SPA + ترويسات أمان.
