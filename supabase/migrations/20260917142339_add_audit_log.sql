-- ════════════════════════════════════════════════════════════════════════
--  سجل التدقيق (Audit Log) — تتبّع كل حركة لكل مستخدم داخل النظام
--  مؤسسة الميمون للمقاولات · الحزمة S03
--
--  الهدف: تسجيل كل إضافة/تعديل/حذف على كل جدول أعمال تلقائيًا:
--         من فعلها (المستخدم) · ماذا (الجدول والسجل) · متى · البيانات قبل/بعد.
--  الفائدة: (1) رؤية تحرّكات كل موظف حرفيًا. (2) استرجاع أي سجل حُذف بالخطأ
--           من نسخته الكاملة المحفوظة (old_data). قاعدة «لا شيء يختفي».
--
--  المبدأ الأمني: السجل للقراءة فقط من التطبيق؛ لا يُعدّل ولا يُحذف من أحد —
--  تكتب فيه دالة المُشغِّل وحدها (SECURITY DEFINER) فيبقى دليلًا لا يُعبث به.
--  إضافي بالكامل: لا يغيّر أي سلوك قائم في النظام (خطر تشغيلي ضئيل جدًا).
-- ════════════════════════════════════════════════════════════════════════

-- ─── 1) جدول السجل ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_log (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  happened_at  timestamptz NOT NULL DEFAULT now(),
  actor_id     uuid,        -- معرّف المستخدم المنفّذ (auth.uid()) — قد يكون NULL لعمليات النظام
  actor_email  text,        -- بريد المنفّذ من رمز الجلسة (JWT) — لعرض بشري مباشر
  actor_role   text,        -- دور قاعدة البيانات المنفِّذ (authenticated / service_role …)
  action       text NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  table_name   text NOT NULL,
  record_id    text,        -- المعرّف الأساسي للسجل (نصًّا؛ يغطّي uuid وغيره)
  old_data     jsonb,       -- نسخة السجل قبل التغيير (للتعديل/الحذف) — مصدر الاسترجاع
  new_data     jsonb        -- نسخة السجل بعد التغيير (للإضافة/التعديل)
);

-- فهارس للبحث السريع في شاشة النشاط (حسب المستخدم/الجدول/الوقت)
CREATE INDEX IF NOT EXISTS idx_audit_log_happened_at ON public.audit_log (happened_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor       ON public.audit_log (actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_table_rec   ON public.audit_log (table_name, record_id);

COMMENT ON TABLE public.audit_log IS 'سجل تدقيق: كل إضافة/تعديل/حذف على جداول الأعمال — من، ماذا، متى، وقيم قبل/بعد. للقراءة فقط؛ لا يُعدّل/يُحذف.';

-- ─── 2) حماية السجل (RLS): قراءة فقط للمستخدمين المصادَقين، ولا كتابة/حذف من أحد ─
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_log_select ON public.audit_log;
CREATE POLICY audit_log_select ON public.audit_log
  FOR SELECT TO authenticated USING (true);
-- عمدًا: لا سياسات INSERT/UPDATE/DELETE — فلا يستطيع أي مستخدم الكتابة أو المحو.
-- الكتابة الوحيدة تأتي من دالة المُشغِّل أدناه (SECURITY DEFINER) التي تتجاوز RLS.

-- ─── 3) دالة المُشغِّل: تلتقط الصف والمنفّذ وتكتب في السجل ────────────────────
CREATE OR REPLACE FUNCTION public.audit_capture()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claims jsonb := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
  v_actor  uuid  := auth.uid();
  v_email  text  := v_claims ->> 'email';
  v_role   text  := v_claims ->> 'role';
  v_rec    text;
BEGIN
  -- دور المنفّذ: من مطالبة الرمز إن وُجدت، وإلا دور الجلسة الفعلي (عمليات النظام/الخدمة)
  IF v_role IS NULL OR v_role = '' THEN
    v_role := current_user;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_rec := to_jsonb(OLD) ->> 'id';
    INSERT INTO public.audit_log(actor_id, actor_email, actor_role, action, table_name, record_id, old_data, new_data)
    VALUES (v_actor, v_email, v_role, 'DELETE', TG_TABLE_NAME, v_rec, to_jsonb(OLD), NULL);
    RETURN OLD;

  ELSIF TG_OP = 'UPDATE' THEN
    v_rec := to_jsonb(NEW) ->> 'id';
    INSERT INTO public.audit_log(actor_id, actor_email, actor_role, action, table_name, record_id, old_data, new_data)
    VALUES (v_actor, v_email, v_role, 'UPDATE', TG_TABLE_NAME, v_rec, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;

  ELSE -- INSERT
    v_rec := to_jsonb(NEW) ->> 'id';
    INSERT INTO public.audit_log(actor_id, actor_email, actor_role, action, table_name, record_id, old_data, new_data)
    VALUES (v_actor, v_email, v_role, 'INSERT', TG_TABLE_NAME, v_rec, NULL, to_jsonb(NEW));
    RETURN NEW;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.audit_capture() IS 'مُشغِّل التدقيق: يكتب صفًّا في audit_log لكل INSERT/UPDATE/DELETE مع المنفّذ والقيم قبل/بعد.';

-- ─── 4) ربط المُشغِّل بكل جداول الأعمال (ما عدا جدول السجل نفسه) ──────────────
--  نمرّ على كل الجداول الأساسية في public ونركّب مُشغِّلًا واحدًا بعد كل عملية.
--  نستثني audit_log (منعًا للتكرار اللانهائي). idempotent: نُسقط المُشغِّل قبل إنشائه.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'                 -- جداول عادية فقط (لا Views)
      AND c.relname <> 'audit_log'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS zz_audit ON public.%I;', r.tbl);
    EXECUTE format(
      'CREATE TRIGGER zz_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.audit_capture();',
      r.tbl
    );
  END LOOP;
END;
$$;

-- ملاحظة تشغيلية (خارج نطاق هذه الهجرة): يُنصح لاحقًا بسياسة احتفاظ (retention)
-- أو أرشفة دورية لـ audit_log إذا كبر حجمه، وبشاشة «نشاط الموظفين» للعرض فقط.
