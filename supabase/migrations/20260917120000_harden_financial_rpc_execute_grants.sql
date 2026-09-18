/*
  # S01 — تحصين منح تنفيذ الدوال المالية (احتواء وصول الزائر)

  ## المشكلة
  ثلاث دوال SECURITY DEFINER مملوكة لـ postgres كانت تمنح EXECUTE لـ PUBLIC و anon،
  فأتاحت مسار كتابة مالية غير مصادَق عبر /rest/v1/rpc/... .

  ## التغيير (منح فقط — بلا مسّ منطق الدوال أو المخطط أو البيانات)
  سحب EXECUTE من PUBLIC و anon عن الدوال الثلاث. يحتفظ authenticated و service_role
  بمنحهما المستقل الصريح (لا يعتمد على PUBLIC)، فلا تتأثر استدعاءات المستخدم المسجّل.

  ## خارج النطاق (عمل مفتوح موثّق)
  - التفويض الداخلي (فحص الدور داخل الدوال) — يرتبط بـ S02 (RBAC).
  - منع تكرار منح PUBLIC مستقبلًا (ALTER DEFAULT PRIVILEGES).
*/

REVOKE EXECUTE ON FUNCTION public.generate_milestone_invoice(uuid, text)            FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.save_invoice_with_items(uuid, jsonb, jsonb, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.replace_purchase_deliveries(uuid, jsonb)          FROM PUBLIC, anon;
