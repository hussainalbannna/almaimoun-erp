// supabase/functions/send-email/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.49.1"

// نطاق المؤسسة الموثَّق في Resend — لا يُسمح بالإرسال بأي مُرسِل خارجه (يمنع التزوير بنطاق آخر)
const ALLOWED_DOMAIN = "almaimoun-construction.com"
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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

interface EmailPayload {
  to: string
  subject: string
  html: string
  from?: string
}

/**
 * يتحقق من أنّ مُرسِل الطلب مستخدم مسجّل الدخول فعلاً (عبر توكن JWT المرفق في ترويسة Authorization).
 * يمنع أي طرف خارجي من استغلال الدالة لإرسال بريد عشوائي باسم المؤسسة.
 * يعمل تلقائياً عند الاستدعاء من التطبيق عبر supabase.functions.invoke (يُرفق التوكن ذاتياً).
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
    if (!(await isAuthenticated(req))) {
      return json(req, { error: "Unauthorized" }, 401)
    }

    const { to, subject, html, from } = (await req.json()) as EmailPayload
    if (!to || !subject || !html) {
      return json(req, { error: "Missing required fields: to, subject, html" }, 400)
    }

    // تحقق من صيغة بريد المستلم — يمنع تمرير قيمة تالفة إلى مزوّد الإرسال
    if (!EMAIL_RE.test(String(to).trim())) {
      return json(req, { error: "Invalid recipient email" }, 400)
    }

    // مفتاح Resend يُقرأ حصرياً من أسرار الخادم (Supabase Secrets) ولا يُقبل من العميل إطلاقاً.
    // هذا يمنع تسريب المفتاح إلى المتصفّح — بخلاف السلوك السابق الذي كان يستقبله ضمن الحمولة.
    const apiKey = Deno.env.get("RESEND_API_KEY")
    if (!apiKey) {
      return json(req, { error: "Email service is not configured on the server" }, 500)
    }

    // المُرسِل: نقبل ما يطلبه العميل فقط إن كان ضمن نطاق المؤسسة الموثَّق؛
    // وإلا نعود إلى مُرسِل الخادم — فلا يمكن انتحال نطاق آخر حتى من مستخدم مسجّل.
    const serverFrom = Deno.env.get("SMTP_FROM") || `noreply@${ALLOWED_DOMAIN}`
    const requestedFrom = (from || serverFrom).trim()
    const fromAddress = requestedFrom.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`) ? requestedFrom : serverFrom

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: fromAddress, to: [to], subject, html }),
    })

    const result = await response.json().catch(() => ({}))

    if (!response.ok) {
      return json(req, { error: result?.message ?? "Failed to send email" }, response.status)
    }

    return json(req, { success: true, id: result.id })
  } catch (error) {
    return json(req, { error: error instanceof Error ? error.message : "Unknown error" }, 500)
  }
})