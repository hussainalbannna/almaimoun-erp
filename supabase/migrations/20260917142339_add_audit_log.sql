-- ════════════════════════════════════════════════════════════════════════
--  سجل التدقيق (Audit Log) — تتبّع كل حركة لكل مستخدم داخل النظام
--  مؤسسة الميمون للمقاولات · الحزمة S03 · النسخة 2 (مُحصّنة بعد مراجعة Codex)
--
--  الهدف: تسجيل كل إضافة/تعديل/حذف على كل جدول أعمال تلقائيًا:
--         من فعلها · دور المنفّذ · اتصال النظام · متى · القيم قبل/بعد.
--  الفائدة: (1) رؤية تحرّكات كل موظف. (2) استرجاع بيانات أي صف حُذف بالخطأ من
--           نسخته المحفوظة (old_data). ملاحظة صادقة: يُسترجَع «صف قاعدة البيانات»،
--           لا محتوى ملفات المرفقات في التخزين (Storage) — تلك خطة منفصلة.
--
--  الحماية من العبث (تحصين v2):
--   • RLS: قراءة فقط للمصادَقين، بلا سياسات كتابة/حذف.
--   • ACL صريح: سحب كل صلاحيات الكتابة وTRUNCATE من PUBLIC/anon/authenticated/
--     service_role، ومنح SELECT فقط للمصادَقين. الكتابة حصراً عبر دالة المُشغِّل
--     (SECURITY DEFINER بمالك موثوق). حدّ الثقة: مالك القاعدة/المدير الخارق يبقى
--     قادرًا على تغيير الكائنات — مقاومة عبث المدير الكاملة تحتاج سجلًا خارجيًا.
--   • TRUNCATE ممنوع على الجداول المُدقَّقة (التطبيق يستخدم DELETE فيُسجَّل ويُسترجَع).
--   • تغطية مستقبلية: مُشغِّل أحداث يُلحِق التدقيق بأي جدول جديد في public تلقائيًا.
--
--  سلوك مقصود (يُوثّق بصراحة): التدقيق متزامن داخل المعاملة (fail-closed) — لو تعذّر
--  التسجيل تفشل العملية، فلا تمرّ كتابة غير مُسجَّلة. هذا تشديد مقصود لضمان الشمول.
-- ════════════════════════════════════════════════════════════════════════

-- ─── 1) جدول السجل ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_log (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  happened_at    timestamptz NOT NULL DEFAULT clock_timestamp(), -- وقت الصف الفعلي (لا بداية المعاملة)
  txid           bigint NOT NULL DEFAULT txid_current(),         -- لتجميع تغييرات المعاملة الواحدة
  actor_id       uuid,        -- auth.uid() من رمز الجلسة (JWT) — NULL لو لا مستخدم بشري
  actor_email    text,        -- بريد المنفّذ من claims
  actor_jwt_role text,        -- دور الرمز (authenticated …) — NULL لو لا JWT (لا نختلق مستخدمًا)
  db_session_user text,       -- هوية اتصال القاعدة (authenticator/postgres…) — مصدر النظام
  action         text NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE','TRUNCATE')),
  table_name     text NOT NULL,
  record_id      text,        -- قيمة id إن وُجدت؛ وإلا NULL (المفتاح الكامل محفوظ في old/new_data)
  old_data       jsonb,       -- الصف قبل التغيير (تعديل/حذف) — مصدر استرجاع بيانات الصف
  new_data       jsonb        -- الصف بعد التغيير (إضافة/تعديل)
);

CREATE INDEX IF NOT EXISTS idx_audit_log_happened_at ON public.audit_log (happened_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor       ON public.audit_log (actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_table_rec   ON public.audit_log (table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_txid        ON public.audit_log (txid);

COMMENT ON TABLE public.audit_log IS 'سجل تدقيق: كل إضافة/تعديل/حذف على جداول الأعمال — من، دوره، اتصال النظام، متى، وقيم قبل/بعد. للقراءة فقط؛ لا يُعدّل/يُحذف من أدوار التطبيق.';

-- ─── 2) حماية السجل: RLS + ACL صريح ─────────────────────────────────────
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- ACL: انزع كل شيء من الأدوار العامة/التطبيق/الخدمة، ثم امنح SELECT فقط للمصادَقين.
-- سحب ALL يشمل INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER — فلا عبث عبر مسار مخوّل.
REVOKE ALL ON public.audit_log FROM PUBLIC;
REVOKE ALL ON public.audit_log FROM anon;
REVOKE ALL ON public.audit_log FROM authenticated;
REVOKE ALL ON public.audit_log FROM service_role;
GRANT SELECT ON public.audit_log TO authenticated;

-- تسلسل عمود الهوية: لا حاجة له لأي دور تطبيق (الإدراج عبر الدالة المالكة) — ننزع صلاحياته
DO $$
DECLARE seq text := pg_get_serial_sequence('public.audit_log','id');
BEGIN
  IF seq IS NOT NULL THEN
    EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC, anon, authenticated, service_role;', seq);
  END IF;
END $$;

-- RLS: قراءة فقط للمصادَقين (قرار المالك: متاح لكل الموظفين). لا سياسات كتابة/حذف عمدًا.
DROP POLICY IF EXISTS audit_log_select ON public.audit_log;
CREATE POLICY audit_log_select ON public.audit_log FOR SELECT TO authenticated USING (true);

-- ─── 3أ) استبعاد أعمدة الملفات الثنائية (base64) بأسمائها — بنيويًّا لا بالطول ─
--  نحذف من نسخة السجل الأعمدةَ المعروفة التي تحفظ صورًا/ملفات base64 ضخمة فقط،
--  فيبقى **كل نصوص الأعمال كاملة** (ملاحظات/وصف/شروط مهما طالت) قابلةً للاسترجاع.
--  علَم has_* المولَّد يبقى في الصف فيدلّ على أن ملفًا كان موجودًا. محتوى الملف نفسه
--  لا يُكرَّر في السجل (كملفات Storage — حدّ موثّق). القائمة صريحة (لا اعتماد على الطول)،
--  ونطاقها الحاليّ هو الأعمدة النصّية العليا التي تحفظ base64 فعلًا؛ base64 المتداخل داخل
--  jsonb/مصفوفات (إن ظهر مستقبلًا) خارج هذا النطاق ويُضاف عند الحاجة — لا ندّعي شمولًا لكل الأشكال.
--  قاعدة صيانة (تُراجَع في كل هجرة/CI): أي عمود جديد يحفظ صورة/ملف base64 ضخم يُضاف هنا صراحةً.
--  ملاحظة: نستبعد فقط أعمدة المحتوى الثنائي (*_data / work_images)، لا أعمدة المسارات/الروابط
--  (*_path / *_url) لأنها صغيرة ومفيدة للاسترجاع.
CREATE OR REPLACE FUNCTION public.audit_redact(j jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT j - ARRAY[
    'cheque_image_data',   -- cheques
    'contract_data',       -- rentals, subcontractor_assignments
    'file_data',           -- worker_documents
    'invoice_copy_data',   -- subcontractor_payments
    'payment_proof_data',  -- subcontractor_payments
    'proof_data',          -- rental_payments
    'receipt_image_data',  -- accounts_payable
    'work_images'          -- subcontractor_assignments
  ]::text[];
$$;
-- سحب التشغيل من كل أدوار التطبيق/الخدمة صراحةً (منح Supabase الافتراضي يمنحها مباشرةً)
REVOKE EXECUTE ON FUNCTION public.audit_redact(jsonb) FROM PUBLIC, anon, authenticated, service_role;

-- ─── 3ب) دالة التقاط الصف: تفصل هوية المستخدم (JWT) عن اتصال النظام ─────────
CREATE OR REPLACE FUNCTION public.audit_capture()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp     -- مقيّد؛ كل كائنات public/auth مؤهَّلة بالاسم الكامل
AS $$
DECLARE
  v_claims jsonb := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
  v_actor  uuid  := auth.uid();            -- من sub في claims — NULL لو لا JWT (لا نختلق)
  v_email  text  := v_claims ->> 'email';
  v_jwt    text  := v_claims ->> 'role';   -- دور الرمز؛ يبقى NULL للعمليات النظامية
  v_sess   text  := session_user;          -- اتصال القاعدة (authenticator/postgres…) منفصل
  v_rec    text;
BEGIN
  -- دفاع عميق: لا نُدقّق جدول السجل نفسه إطلاقًا (يمنع أي تكرار لو رُكّب المُشغِّل عليه خطأً/عبثًا)
  IF TG_TABLE_NAME = 'audit_log' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_rec := to_jsonb(OLD) ->> 'id';
    INSERT INTO public.audit_log(actor_id,actor_email,actor_jwt_role,db_session_user,action,table_name,record_id,old_data,new_data)
    VALUES (v_actor, v_email, v_jwt, v_sess, 'DELETE', TG_TABLE_NAME, v_rec, public.audit_redact(to_jsonb(OLD)), NULL);
    RETURN OLD;

  ELSIF TG_OP = 'UPDATE' THEN
    v_rec := to_jsonb(NEW) ->> 'id';
    INSERT INTO public.audit_log(actor_id,actor_email,actor_jwt_role,db_session_user,action,table_name,record_id,old_data,new_data)
    VALUES (v_actor, v_email, v_jwt, v_sess, 'UPDATE', TG_TABLE_NAME, v_rec, public.audit_redact(to_jsonb(OLD)), public.audit_redact(to_jsonb(NEW)));
    RETURN NEW;

  ELSE -- INSERT
    v_rec := to_jsonb(NEW) ->> 'id';
    INSERT INTO public.audit_log(actor_id,actor_email,actor_jwt_role,db_session_user,action,table_name,record_id,old_data,new_data)
    VALUES (v_actor, v_email, v_jwt, v_sess, 'INSERT', TG_TABLE_NAME, v_rec, NULL, public.audit_redact(to_jsonb(NEW)));
    RETURN NEW;
  END IF;
END;
$$;
-- سحب التشغيل من كل أدوار التطبيق/الخدمة صراحةً (المُشغِّل يعمل بلا حاجة لهذه المنحة)
REVOKE EXECUTE ON FUNCTION public.audit_capture() FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION public.audit_capture() IS 'مُشغِّل صفّي: يكتب في audit_log لكل INSERT/UPDATE/DELETE مع فصل هوية JWT عن اتصال النظام.';

-- ─── 4) منع TRUNCATE على الجداول المُدقَّقة (يحمي قاعدة «لا شيء يختفي») ──────
CREATE OR REPLACE FUNCTION public.audit_block_truncate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'TRUNCATE ممنوع على الجدول المُدقَّق «%» — استخدم DELETE ليُسجَّل ويبقى قابلاً للاسترجاع.', TG_TABLE_NAME;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.audit_block_truncate() FROM PUBLIC, anon, authenticated, service_role;

-- ─── 5) دالة ربط المُشغِّلات بجدول (تُستخدم للحالي والمستقبلي) ─────────────
--  إدارية بحتة: تُسحب من كل أدوار التطبيق/الخدمة، وفيها حارس يرفض جدول السجل وأي اسم غير صالح.
CREATE OR REPLACE FUNCTION public.audit_attach(p_table text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  -- حارس: لا نربط المُشغِّل بجدول السجل نفسه، ولا بأي اسم ليس جدولًا عاديًا في public
  IF p_table = 'audit_log' THEN
    RAISE EXCEPTION 'لا يجوز تدقيق جدول السجل نفسه (audit_log).';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = p_table AND c.relkind = 'r'
  ) THEN
    RAISE EXCEPTION 'جدول غير صالح للتدقيق: %', p_table;
  END IF;

  EXECUTE format('DROP TRIGGER IF EXISTS zz_audit ON public.%I;', p_table);
  EXECUTE format('CREATE TRIGGER zz_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I
                    FOR EACH ROW EXECUTE FUNCTION public.audit_capture();', p_table);
  EXECUTE format('DROP TRIGGER IF EXISTS zz_audit_truncate ON public.%I;', p_table);
  EXECUTE format('CREATE TRIGGER zz_audit_truncate BEFORE TRUNCATE ON public.%I
                    FOR EACH STATEMENT EXECUTE FUNCTION public.audit_block_truncate();', p_table);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.audit_attach(text) FROM PUBLIC, anon, authenticated, service_role;

-- ─── 6) ربط كل الجداول الموجودة الآن (ما عدا جدول السجل نفسه) ───────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> 'audit_log'
  LOOP
    PERFORM public.audit_attach(r.tbl);
  END LOOP;
END $$;

-- ─── 7) تغطية مستقبلية: مُشغِّل أحداث يُلحِق التدقيق بأي جدول جديد في public ──
CREATE OR REPLACE FUNCTION public.audit_on_ddl()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE obj record; v_name text; v_kind "char"; v_ns text;
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_ddl_commands() WHERE command_tag = 'CREATE TABLE'
  LOOP
    SELECT c.relname, c.relkind, n.nspname INTO v_name, v_kind, v_ns
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.oid = obj.objid;
    -- جداول عادية في public فقط، ما عدا السجل
    IF v_ns = 'public' AND v_kind = 'r' AND v_name <> 'audit_log' THEN
      PERFORM public.audit_attach(v_name);
    END IF;
  END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.audit_on_ddl() FROM PUBLIC, anon, authenticated, service_role;

-- نطاق التغطية المستقبلية (موثّق بصراحة، بلا ادّعاء شمول): يغطّي `CREATE TABLE` العادي في
-- public عند نجاح مُشغِّل الأحداث. لا يضمن `CREATE TABLE AS`/`SELECT INTO` ولا الجداول
-- المقسّمة (partitioned). القاعدة العملية: أي هجرة تضيف جدولًا تستدعي public.audit_attach('<t>')
-- صراحةً وتفحص التغطية، ولا يُكتفى بالمُشغِّل التلقائي.
-- إنشاء مُشغِّل الأحداث يتطلب صلاحية عالية قد لا تتوفّر على بعض المنصّات (Supabase).
-- نجعله «أفضل جهد»: يُنشأ إن سُمح، وإلا يُتخطّى مع إشعار — دون إفشال الهجرة. التدقيق
-- الأساسي (الأقسام 1–6) يبقى كاملًا؛ يُفقد فقط الإلحاق التلقائي للجداول الجديدة مستقبلًا.
DO $$
BEGIN
  DROP EVENT TRIGGER IF EXISTS audit_on_create_table;
  CREATE EVENT TRIGGER audit_on_create_table ON ddl_command_end
    WHEN TAG IN ('CREATE TABLE') EXECUTE FUNCTION public.audit_on_ddl();
EXCEPTION
  WHEN insufficient_privilege OR feature_not_supported THEN
    RAISE NOTICE 'تعذّر إنشاء مُشغِّل الأحداث (صلاحية غير كافية) — التدقيق الأساسي مُطبَّق؛ ألحِق التدقيق يدويًا لأي جدول جديد عبر public.audit_attach(''<table>'').';
END $$;

-- ملاحظات متابعة (خارج نطاق هذه الهجرة، موثّقة صراحةً):
--  • أرشفة/احتفاظ (retention) لـ audit_log عند كبر الحجم + شاشة «نشاط الموظفين».
--  • حفظ/أرشفة ملفات المرفقات في التخزين إن لزم استرجاعها (خطة مستقلة).
--  • السجل لا يلتقط SELECT ولا المحاولات الفاشلة، ويتراجع مع rollback المعاملة (بحكم التصميم).
