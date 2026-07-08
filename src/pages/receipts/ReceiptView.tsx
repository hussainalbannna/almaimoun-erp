import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Printer, MessageCircle, Send } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Receipt, CompanySettings } from '../../types'
import { formatCurrencyEn, formatDate, openWhatsApp } from '../../lib/utils'
import Button from '../../components/ui/Button'
import toast from 'react-hot-toast'

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  cheque: 'Cheque',
  card: 'Card',
  benefit: 'Benefit Pay',
  deferred_cheque: 'Deferred Cheque',
}

export default function ReceiptView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [sending, setSending] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['receipt-view', id],
    queryFn: async () => {
      const [rRes, cRes] = await Promise.all([
        supabase.from('receipts').select('*').eq('id', id).maybeSingle(),
        supabase.from('company_settings').select('*').maybeSingle(),
      ])
      return { receipt: (rRes.data as Receipt) ?? null, company: (cRes.data as CompanySettings) ?? null }
    },
    enabled: !!id,
  })
  const receipt = data?.receipt ?? null
  const company = data?.company ?? null

  const resolveClientPhone = async (): Promise<string> => {
    if (!receipt) return ''
    let phone = ''

    // 1. Try customer record
    if (receipt.customer_id) {
      const { data } = await supabase.from('customers').select('whatsapp, phone').eq('id', receipt.customer_id).single()
      if (data) {
        const c = data as { whatsapp: string; phone: string }
        phone = c.whatsapp || c.phone || ''
      }
    }

    // 2. Try linked invoice's project's client_phone
    if (!phone && receipt.invoice_id) {
      const { data: inv } = await supabase.from('invoices').select('project_id, customer_id').eq('id', receipt.invoice_id).single()
      if (inv) {
        const invoiceData = inv as { project_id: string | null; customer_id: string | null }
        if (invoiceData.project_id) {
          const { data: proj } = await supabase.from('projects').select('client_phone').eq('id', invoiceData.project_id).single()
          if (proj) phone = (proj as { client_phone: string }).client_phone || ''
        }
        if (!phone && invoiceData.customer_id) {
          const { data: cust } = await supabase.from('customers').select('whatsapp, phone').eq('id', invoiceData.customer_id).single()
          if (cust) {
            const c = cust as { whatsapp: string; phone: string }
            phone = c.whatsapp || c.phone || ''
          }
        }
      }
    }

    // 3. Fallback: search by customer name
    if (!phone && receipt.customer_name) {
      const { data } = await supabase.from('customers').select('whatsapp, phone').ilike('name', `%${receipt.customer_name}%`).limit(1).single()
      if (data) {
        const c = data as { whatsapp: string; phone: string }
        phone = c.whatsapp || c.phone || ''
      }
    }

    return phone
  }

  const triggerPdfDownload = (r: Receipt, comp: CompanySettings | null) => {
    const html = buildPrintableHTML(r, comp)
    const filename = `إيصال_الميمون_رقم_${r.receipt_number}.html`
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleWhatsApp = async () => {
    if (!receipt) return
    const phone = await resolveClientPhone()
    if (!phone) {
      toast.error('لا يوجد رقم هاتف مسجل للعميل — يرجى إضافة الرقم في بيانات العميل أو المشروع')
      return
    }

    triggerPdfDownload(receipt, company)

    const message = `السلام عليكم ورحمة الله وبركاته، عزيزي العميل ${receipt.customer_name}، تم استلام المبلغ (${formatCurrencyEn(Number(receipt.amount))} د.ب) بنجاح. رقم الإيصال: ${receipt.receipt_number}${receipt.invoice_number ? ` — للفاتورة رقم: ${receipt.invoice_number}` : ''}. شكرًا لثقتكم بمؤسسة الميمون للمقاولات.`
    setTimeout(() => {
      openWhatsApp(phone, message)
      toast.success('تم فتح الواتساب — يمكنك سحب ملف PDF المحمّل إلى المحادثة')
    }, 500)
  }

  const handleSendEmail = async () => {
    if (!receipt) return
    // Resolve customer email from receipt or linked customer
    let email = ''
    if (receipt.customer_id) {
      const { data } = await supabase.from('customers').select('email').eq('id', receipt.customer_id).single()
      if (data) email = (data as { email: string }).email || ''
    }
    if (!email && receipt.invoice_id) {
      const { data } = await supabase.from('invoices').select('customer_email').eq('id', receipt.invoice_id).single()
      if (data) email = (data as { customer_email: string }).customer_email || ''
    }
    if (!email) {
      toast.error('لا يوجد بريد إلكتروني مسجل للعميل')
      return
    }

    setSending(true)
    try {
      const subject = `إيصال استلام رقم ${receipt.receipt_number} — مؤسسة الميمون للمقاولات`
      const html = buildEmailHTML(receipt, company)

      // مفتاح Resend يبقى في أسرار الخادم حصرياً — لا يُرسَل من المتصفّح إطلاقاً
      const payload: Record<string, string> = { to: email, subject, html }
      if (company?.smtp_from) payload.from = company.smtp_from

      const { data: res, error } = await supabase.functions.invoke('send-email', { body: payload })
      const result = res as { success?: boolean; error?: string } | null

      // نجاح فقط عند تأكيد الخادم — لا رسالة نجاح كاذبة عند فشل الإرسال
      if (error || !result?.success) {
        toast.error('تعذّر إرسال البريد: ' + (result?.error ?? error?.message ?? 'خطأ غير معروف'))
        return
      }

      toast.success('تم إرسال البريد الإلكتروني للعميل بنجاح')
    } catch (e) {
      toast.error('تعذّر إرسال البريد: ' + ((e as Error)?.message ?? 'تعذّر الوصول للخادم'))
    } finally {
      setSending(false)
    }
  }

  if (isLoading) return <div className="flex justify-center py-16"><div className="animate-spin w-7 h-7 border-2 border-primary-600 border-t-transparent rounded-full" /></div>
  if (!receipt) return <div className="p-12 text-center text-slate-400">Receipt not found</div>

  return (
    <div className="max-w-4xl mx-auto">
      {/* Actions bar */}
      <div className="flex flex-wrap items-center gap-3 mb-6 no-print">
        <button onClick={() => navigate('/receipts')} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-600">
          <ArrowLeft size={20} />
        </button>
        <Button variant="outline" size="sm" icon={<Printer size={15} />} onClick={() => window.print()}>طباعة</Button>
        <Button
          variant="outline" size="sm"
          icon={<MessageCircle size={15} className="text-green-600" />}
          className="border-green-300 text-green-700 hover:bg-green-50"
          onClick={handleWhatsApp}
        >
          إرسال عبر الواتساب
        </Button>
        <Button
          variant="outline" size="sm"
          icon={<Send size={15} className="text-blue-600" />}
          className="border-blue-300 text-blue-700 hover:bg-blue-50"
          loading={sending}
          onClick={handleSendEmail}
        >
          إرسال عبر البريد
        </Button>
      </div>

      {/* Printable receipt */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-8 sm:p-10 print:shadow-none print:border-0 print:rounded-none print:p-0">
        {/* Header */}
        <div className="flex justify-between items-start mb-8 pb-6 border-b border-slate-100">
          <div className="flex items-start gap-4">
            <img
              src="/Logo_Final-01.jpg"
              alt="AlMaimoun Construction"
              className="w-20 h-20 object-contain"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
            <div>
              <div className="text-xl font-bold" style={{ color: '#7b4a2d' }}>Almaimoun Construction Est.</div>
              <div className="font-medium text-slate-600 text-sm">مؤسسة الميمون للمقاولات</div>
              {company?.address && <div className="text-slate-500 text-sm mt-1">{company.address}</div>}
              {company?.phone && <div className="text-slate-500 text-sm">Tel: {company.phone}</div>}
              {company?.email && <div className="text-slate-500 text-sm">{company.email}</div>}
              {company?.commercial_reg && <div className="text-slate-500 text-sm">CR No.: {company.commercial_reg}</div>}
            </div>
          </div>
          <div className="text-right">
            <h1 className="text-4xl font-extrabold tracking-wide mb-1" style={{ color: '#c4925a' }}>RECEIPT</h1>
            <p className="text-slate-700 font-bold text-lg">#{receipt.receipt_number}</p>
          </div>
        </div>

        {/* Received from + meta */}
        <div className="grid grid-cols-2 gap-8 mb-8">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Received From</p>
            <p className="font-bold text-slate-800 text-base">{receipt.customer_name}</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-4 print:bg-gray-50">
            <table className="w-full text-sm">
              <tbody>
                <tr>
                  <td className="text-slate-500 pb-2 pr-4">Receipt No.</td>
                  <td className="font-semibold text-slate-800 pb-2 text-right">{receipt.receipt_number}</td>
                </tr>
                <tr>
                  <td className="text-slate-500 pb-2 pr-4">Date</td>
                  <td className="font-medium text-slate-700 pb-2 text-right">{formatDate(receipt.receipt_date)}</td>
                </tr>
                <tr>
                  <td className="text-slate-500 pb-2 pr-4">Payment Method</td>
                  <td className="font-medium text-slate-700 pb-2 text-right">{PAYMENT_LABELS[receipt.payment_method] ?? receipt.payment_method}</td>
                </tr>
                {receipt.reference_no && (
                  <tr>
                    <td className="text-slate-500 pr-4">Reference No.</td>
                    <td className="font-medium text-slate-700 text-right">{receipt.reference_no}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Invoice details table */}
        {receipt.invoice_number && (
          <table className="w-full text-sm mb-6">
            <thead>
              <tr style={{ background: '#7b4a2d' }}>
                <th className="px-4 py-3 text-left font-semibold text-white rounded-tl-lg">Invoice Number</th>
                <th className="px-4 py-3 text-left font-semibold text-white">Invoice Date</th>
                <th className="px-4 py-3 text-left font-semibold text-white">Due Date</th>
                <th className="px-4 py-3 text-right font-semibold text-white">Original Amount</th>
                <th className="px-4 py-3 text-right font-semibold text-white">Balance</th>
                <th className="px-4 py-3 text-right font-semibold text-white rounded-tr-lg">Payment</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-100">
                <td className="px-4 py-3 text-slate-700">{receipt.invoice_number}</td>
                <td className="px-4 py-3 text-slate-600">{formatDate(receipt.invoice_date ?? '')}</td>
                <td className="px-4 py-3 text-slate-600">{formatDate(receipt.due_date ?? '')}</td>
                <td className="px-4 py-3 text-right text-slate-600">{Number(receipt.original_amount).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</td>
                <td className="px-4 py-3 text-right text-slate-600">{Number(receipt.balance).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-800">{Number(receipt.amount).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</td>
              </tr>
            </tbody>
          </table>
        )}

        {/* Total */}
        <div className="flex justify-end mt-6">
          <div className="w-72 space-y-2 text-sm">
            {receipt.memo && (
              <div className="text-slate-500 pb-2">Memo: <span className="text-slate-700 font-medium">{receipt.memo}</span></div>
            )}
            <div className="flex justify-between border-t-2 border-slate-200 pt-3 font-bold text-base">
              <span style={{ color: '#7b4a2d' }}>Amount Received</span>
              <span style={{ color: '#7b4a2d' }}>{formatCurrencyEn(Number(receipt.amount))}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-10 pt-4 border-t border-slate-100 text-center">
          <p className="text-slate-400 text-xs">Thank you for your payment — {company?.name_en ?? 'Almaimoun Construction Est.'}</p>
        </div>
      </div>
    </div>
  )
}

function buildPrintableHTML(receipt: Receipt, company: CompanySettings | null): string {
  return `<!DOCTYPE html>
<html dir="ltr">
<head>
<meta charset="utf-8" />
<title>إيصال_الميمون_رقم_${receipt.receipt_number}</title>
<style>
  @page { margin: 15mm; size: A4; }
  body { margin:0; padding:0; font-family:Arial,Helvetica,sans-serif; color:#1e293b; }
  table { border-collapse:collapse; }
</style>
</head>
<body>
  <div style="max-width:700px;margin:0 auto;padding:20px;">
    <!-- Header -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:20px;border-bottom:2px solid #f1f5f9;margin-bottom:24px;">
      <div>
        <h1 style="margin:0;font-size:20px;color:#7b4a2d;">Almaimoun Construction Est.</h1>
        <p style="margin:4px 0 0;font-size:14px;color:#64748b;font-weight:500;">مؤسسة الميمون للمقاولات</p>
        ${company?.address ? `<p style="margin:4px 0 0;font-size:12px;color:#94a3b8;">${company.address}</p>` : ''}
        ${company?.phone ? `<p style="margin:2px 0 0;font-size:12px;color:#94a3b8;">Tel: ${company.phone}</p>` : ''}
        ${company?.email ? `<p style="margin:2px 0 0;font-size:12px;color:#94a3b8;">${company.email}</p>` : ''}
        ${company?.commercial_reg ? `<p style="margin:2px 0 0;font-size:12px;color:#94a3b8;">CR: ${company.commercial_reg}</p>` : ''}
      </div>
      <div style="text-align:right;">
        <h2 style="margin:0;font-size:32px;font-weight:800;color:#c4925a;letter-spacing:1px;">RECEIPT</h2>
        <p style="margin:6px 0 0;font-size:16px;font-weight:700;color:#334155;">#${receipt.receipt_number}</p>
      </div>
    </div>

    <!-- Client + Meta -->
    <div style="display:flex;justify-content:space-between;margin-bottom:24px;">
      <div>
        <p style="margin:0;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">Received From</p>
        <p style="margin:6px 0 0;font-size:15px;font-weight:700;color:#1e293b;">${receipt.customer_name}</p>
      </div>
      <div style="text-align:right;font-size:12px;color:#64748b;background:#f8fafc;padding:14px 18px;border-radius:8px;">
        <p style="margin:0;"><strong>Receipt No.:</strong> ${receipt.receipt_number}</p>
        <p style="margin:4px 0 0;"><strong>Date:</strong> ${receipt.receipt_date}</p>
        <p style="margin:4px 0 0;"><strong>Payment:</strong> ${PAYMENT_LABELS[receipt.payment_method] ?? receipt.payment_method}</p>
        ${receipt.reference_no ? `<p style="margin:4px 0 0;"><strong>Ref:</strong> ${receipt.reference_no}</p>` : ''}
      </div>
    </div>

    ${receipt.invoice_number ? `
    <!-- Invoice details -->
    <table style="width:100%;margin-bottom:20px;border:1px solid #e2e8f0;">
      <thead>
        <tr style="background:#7b4a2d;">
          <th style="padding:10px 14px;text-align:left;color:white;font-size:12px;font-weight:600;">Invoice No.</th>
          <th style="padding:10px 14px;text-align:left;color:white;font-size:12px;font-weight:600;">Invoice Date</th>
          <th style="padding:10px 14px;text-align:right;color:white;font-size:12px;font-weight:600;">Original Amount</th>
          <th style="padding:10px 14px;text-align:right;color:white;font-size:12px;font-weight:600;">Payment</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="padding:10px 14px;font-size:13px;color:#334155;">${receipt.invoice_number}</td>
          <td style="padding:10px 14px;font-size:13px;color:#64748b;">${receipt.invoice_date || '-'}</td>
          <td style="padding:10px 14px;text-align:right;font-size:13px;color:#64748b;">${Number(receipt.original_amount).toFixed(3)} BHD</td>
          <td style="padding:10px 14px;text-align:right;font-size:13px;font-weight:600;color:#1e293b;">${Number(receipt.amount).toFixed(3)} BHD</td>
        </tr>
      </tbody>
    </table>` : ''}

    <!-- Total -->
    <div style="text-align:right;margin-bottom:24px;">
      <table style="margin-left:auto;width:260px;font-size:13px;">
        ${receipt.memo ? `<tr><td style="padding:5px 0;color:#64748b;">Memo</td><td style="padding:5px 0;text-align:right;color:#334155;">${receipt.memo}</td></tr>` : ''}
        <tr style="border-top:2px solid #7b4a2d;"><td style="padding:10px 0;font-weight:700;color:#7b4a2d;font-size:15px;">Amount Received</td><td style="padding:10px 0;text-align:right;font-weight:700;color:#7b4a2d;font-size:15px;">${Number(receipt.amount).toFixed(3)} BHD</td></tr>
      </table>
    </div>

    <!-- Footer -->
    <div style="margin-top:30px;padding-top:12px;border-top:1px solid #f1f5f9;text-align:center;">
      <p style="margin:0;font-size:11px;color:#94a3b8;">Thank you for your payment — ${company?.name_en ?? 'Almaimoun Construction Est.'}</p>
    </div>
  </div>
</body>
</html>`
}

function buildEmailHTML(receipt: Receipt, company: CompanySettings | null): string {
  return `<!DOCTYPE html>
<html dir="ltr">
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:20px;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">
    <div style="padding:28px 32px;border-bottom:1px solid #f1f5f9;">
      <table style="width:100%;"><tr>
        <td style="vertical-align:top;">
          <h1 style="margin:0;font-size:18px;color:#7b4a2d;">Almaimoun Construction Est.</h1>
          <p style="margin:4px 0 0;font-size:13px;color:#64748b;">مؤسسة الميمون للمقاولات</p>
          ${company?.address ? `<p style="margin:2px 0 0;font-size:12px;color:#94a3b8;">${company.address}</p>` : ''}
          ${company?.phone ? `<p style="margin:2px 0 0;font-size:12px;color:#94a3b8;">Tel: ${company.phone}</p>` : ''}
        </td>
        <td style="vertical-align:top;text-align:right;">
          <h2 style="margin:0;font-size:28px;font-weight:800;color:#c4925a;letter-spacing:1px;">RECEIPT</h2>
          <p style="margin:4px 0 0;font-size:14px;font-weight:700;color:#334155;">#${receipt.receipt_number}</p>
        </td>
      </tr></table>
    </div>

    <div style="padding:24px 32px;">
      <p style="margin:0 0 16px;font-size:14px;color:#334155;">Dear <strong>${receipt.customer_name}</strong>,</p>
      <p style="margin:0 0 16px;font-size:14px;color:#475569;">We hereby confirm receipt of the following payment:</p>

      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;border:1px solid #e2e8f0;">
        <tr style="background:#f8fafc;">
          <td style="padding:12px 16px;font-size:13px;color:#64748b;font-weight:600;">Receipt No.</td>
          <td style="padding:12px 16px;font-size:13px;color:#1e293b;text-align:right;">${receipt.receipt_number}</td>
        </tr>
        <tr style="border-top:1px solid #f1f5f9;">
          <td style="padding:12px 16px;font-size:13px;color:#64748b;font-weight:600;">Date</td>
          <td style="padding:12px 16px;font-size:13px;color:#1e293b;text-align:right;">${receipt.receipt_date}</td>
        </tr>
        <tr style="border-top:1px solid #f1f5f9;">
          <td style="padding:12px 16px;font-size:13px;color:#64748b;font-weight:600;">Payment Method</td>
          <td style="padding:12px 16px;font-size:13px;color:#1e293b;text-align:right;">${PAYMENT_LABELS[receipt.payment_method] ?? receipt.payment_method}</td>
        </tr>
        ${receipt.invoice_number ? `<tr style="border-top:1px solid #f1f5f9;">
          <td style="padding:12px 16px;font-size:13px;color:#64748b;font-weight:600;">For Invoice</td>
          <td style="padding:12px 16px;font-size:13px;color:#1e293b;text-align:right;">${receipt.invoice_number}</td>
        </tr>` : ''}
        <tr style="border-top:2px solid #7b4a2d;background:#fefcfb;">
          <td style="padding:14px 16px;font-size:14px;color:#7b4a2d;font-weight:700;">Amount Received</td>
          <td style="padding:14px 16px;font-size:14px;color:#7b4a2d;font-weight:700;text-align:right;">${Number(receipt.amount).toFixed(3)} BHD</td>
        </tr>
      </table>

      ${receipt.memo ? `<p style="margin:0 0 16px;font-size:13px;color:#64748b;"><strong>Memo:</strong> ${receipt.memo}</p>` : ''}
      <p style="margin:0;font-size:13px;color:#64748b;">Thank you for your prompt payment.</p>
    </div>

    <div style="padding:16px 32px;border-top:1px solid #f1f5f9;text-align:center;">
      <p style="margin:0;font-size:11px;color:#94a3b8;">Thank you for your business — ${company?.name_en ?? 'Almaimoun Construction Est.'}</p>
    </div>
  </div>
</body>
</html>`
}
