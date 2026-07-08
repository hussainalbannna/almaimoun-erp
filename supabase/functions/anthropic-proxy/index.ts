// supabase/functions/anthropic-proxy/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.49.1"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })

// النموذج يُفرض على الخادم (لا يُترك للعميل)، وسقف التوكنات يحدّ التكلفة
const MODEL = "claude-sonnet-4-6"
const MAX_TOKENS_CAP = 4000

interface AnthropicRequest {
  messages: unknown
  system?: string
  max_tokens?: number
}

/**
 * يتحقق من أنّ مُرسِل الطلب مستخدم مسجّل الدخول (عبر توكن JWT المرفق).
 * يمنع أي طرف خارجي من استغلال الوسيط لإجراء نداءات مدفوعة باسم الحساب.
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
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders })
  if (req.method !== "POST") return json({ ok: false, message: "Method not allowed" }, 405)

  // لا نداء إلا لمستخدم مسجّل الدخول
  if (!(await isAuthenticated(req))) {
    return json({ ok: false, message: "Unauthorized" }, 401)
  }

  // المفتاح يُقرأ حصرياً من أسرار الخادم — لا يصل المتصفّح ولا قاعدة البيانات إطلاقاً
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY")
  if (!apiKey) {
    return json({ ok: false, message: "خدمة الذكاء الاصطناعي غير مهيأة على الخادم (ANTHROPIC_API_KEY)" })
  }

  try {
    const { messages, system, max_tokens } = (await req.json()) as AnthropicRequest
    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ ok: false, message: "messages مطلوبة" }, 400)
    }
    const cappedTokens = Math.min(Number(max_tokens) || 1024, MAX_TOKENS_CAP)

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: cappedTokens,
        ...(system ? { system } : {}),
        messages,
      }),
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      // نمرّر رسالة الخطأ (بحالة 200 مغلّفة) ليعرضها العميل بوضوح
      return json({ ok: false, status: String(response.status), message: data?.error?.message ?? "AI service error" })
    }

    return json({ ok: true, data })
  } catch (e) {
    return json({ ok: false, message: e instanceof Error ? e.message : "Unknown error" }, 500)
  }
})