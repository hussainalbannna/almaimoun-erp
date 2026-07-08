// supabase/functions/create-user/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.49.1"

// ─── CORS ديناميكي ─────────────────────────────────────────────────────
// يعكس الترويسات التي يطلبها المتصفّح في الفحص المسبق (preflight) بدل قائمة
// ثابتة — فلا ينكسر الاتصال إذا أضاف عميل Supabase أو التطبيق ترويسة جديدة.
function corsHeaders(req: Request): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      req.headers.get("Access-Control-Request-Headers") ??
      "authorization, x-client-info, apikey, content-type, x-application-name",
    "Access-Control-Max-Age": "86400",
  }
}

const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  })

/**
 * يتحقق من أنّ مُرسِل الطلب مستخدم مسجّل الدخول فعلاً قبل السماح بإنشاء مستخدم جديد.
 * حرج أمنياً: بدونه يستطيع أي طرف يصل إلى رابط الدالة إنشاء حسابات بلا قيود.
 */
async function isAuthenticated(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("Authorization")
  if (!authHeader) return false
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data, error } = await supabase.auth.getUser()
  return !error && Boolean(data.user)
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders(req) })
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405)

  try {
    // لا تُنشئ مستخدمين إلا لطلب صادر عن مستخدم مسجّل الدخول
    if (!(await isAuthenticated(req))) {
      return json(req, { error: "Unauthorized" }, 401)
    }

    const { email, password } = await req.json()

    if (!email || !password) {
      return json(req, { error: "Email and password are required" }, 400)
    }
    if (typeof password !== "string" || password.length < 6) {
      return json(req, { error: "Password must be at least 6 characters" }, 400)
    }

    // عميل بصلاحيات الخدمة (Service Role) لإنشاء المستخدم — لا يُستخدم إلا بعد اجتياز التحقق أعلاه
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    )

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (error) {
      return json(req, { error: error.message }, 400)
    }

    return json(req, { success: true, user_id: data.user.id })
  } catch (err) {
    return json(req, { error: err instanceof Error ? err.message : "Unknown error" }, 500)
  }
})