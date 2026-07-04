import { useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Pencil, Printer, Mail, MessageCircle, CheckCircle, Receipt, Send } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatCurrencyEn, formatDate, invoiceStatusLabel, invoiceStatusColor, openWhatsApp } from '../../lib/utils'
import type { Invoice, InvoiceItem, CompanySettings } from '../../types'
import Button from '../../components/ui/Button'
import toast from 'react-hot-toast'

interface InvoiceViewData {
  invoice: Invoice | null
  items: InvoiceItem[]
  company: CompanySettings | null
}
const EMPTY_ITEMS: InvoiceItem[] = []

// جلب الفاتورة وبنودها وإعدادات الشركة (مصدر React Query)
async function fetchInvoiceView(id: string): Promise<InvoiceViewData> {
  const [{ data: inv }, { data: invItems }, { data: comp }] = await Promise.all([
    supabase.from('invoices').select('*').eq('id', id).maybeSingle(),
    supabase.from('invoice_items').select('*').eq('invoice_id', id).order('sort_order'),
    supabase.from('company_settings').select('*').maybeSingle(),
  ])
  return {
    invoice: (inv as Invoice) ?? null,
    items: (invItems ?? []) as InvoiceItem[],
    company: (comp as CompanySettings) ?? null,
  }
}

export default function InvoiceView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [sending, setSending] = useState(false)

  const { data, isLoading } = useQuery({ queryKey: ['invoice-view', id], queryFn: () => fetchInvoiceView(id!), enabled: !!id })
  const invoice = data?.invoice ?? null
  const items = data?.items ?? EMPTY_ITEMS
  const company = data?.company ?? null

  // بعد تغيير الحالة: تحديث كاش هذه الفاتورة والقائمة معاً
  const invalidateInvoice = () => {
    queryClient.invalidateQueries({ queryKey: ['invoice-view', id] })
    queryClient.invalidateQueries({ queryKey: ['invoices-list'] })
  }

  const markAsPaid = async () => {
    await supabase.from('invoices').update({ status: 'paid', updated_at: new Date().toISOString() }).eq('id', id)
    invalidateInvoice()
    toast.success('تم تحديث الحالة إلى مدفوعة')
  }

  const markAsSent = async () => {
    await supabase.from('invoices').update({ status: 'sent', updated_at: new Date().toISOString() }).eq('id', id)
    invalidateInvoice()
  }

  const resolveClientPhone = async (): Promise<string> => {
    if (!invoice) return ''
    let phone = ''

    // 1. Try customer record (whatsapp first, then phone)
    if (invoice.customer_id) {
      const { data } = await supabase.from('customers').select('whatsapp, phone').eq('id', invoice.customer_id).single()
      if (data) {
        const c = data as { whatsapp: string; phone: string }
        phone = c.whatsapp || c.phone || ''
      }
    }

    // 2. If no phone yet, try the linked project's client_phone
    if (!phone && invoice.project_id) {
      const { data } = await supabase.from('projects').select('client_phone').eq('id', invoice.project_id).single()
      if (data) phone = (data as { client_phone: string }).client_phone || ''
    }

    // 3. Fallback: search customer by name in customers table
    if (!phone && invoice.customer_name) {
      const { data } = await supabase.from('customers').select('whatsapp, phone').ilike('name', `%${invoice.customer_name}%`).limit(1).single()
      if (data) {
        const c = data as { whatsapp: string; phone: string }
        phone = c.whatsapp || c.phone || ''
      }
    }

    return phone
  }

  const triggerPdfDownload = (inv: Invoice, invItems: InvoiceItem[], comp: CompanySettings | null) => {
    const html = buildPrintableHTML(inv, invItems, comp)
    const filename = `فاتورة_الميمون_رقم_${inv.invoice_number}.html`
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
    if (!invoice) return
    const phone = await resolveClientPhone()
    if (!phone) {
      toast.error('لا يوجد رقم هاتف مسجل للعميل — يرجى إضافة الرقم في بيانات العميل أو المشروع')
      return
    }

    // Step A: Trigger PDF download via print window
    triggerPdfDownload(invoice, items, company)

    // Step B: Open WhatsApp with professional Arabic message
    const message = `السلام عليكم ورحمة الله وبركاته، عزيزي العميل ${invoice.customer_name}، تم إصدار فاتورة رقم (${invoice.invoice_number}) الخاصة بمشروعكم من مؤسسة الميمون للمقاولات. إجمالي المبلغ: ${formatCurrencyEn(Number(invoice.total))} د.ب. يمكنكم الاطلاع عليها عبر النظام. مرفق نسخة PDF للفاتورة.`
    setTimeout(() => {
      openWhatsApp(phone, message)
      markAsSent()
      toast.success('تم فتح الواتساب — يمكنك سحب ملف PDF المحمّل إلى المحادثة')
    }, 500)
  }

  const handleSendEmail = async () => {
    if (!invoice) return
    if (!invoice.customer_email) {
      toast.error('لا يوجد بريد إلكتروني مسجل للعميل')
      return
    }
    setSending(true)

    try {
      const subject = `فاتورة رقم ${invoice.invoice_number} — مؤسسة الميمون للمقاولات`
      const html = buildEmailHTML(invoice, items, company)

      const payload: Record<string, string> = {
        to: invoice.customer_email,
        subject,
        html,
      }
      if (company?.resend_api_key) payload.resend_api_key = company.resend_api_key
      if (company?.smtp_from) payload.from = company.smtp_from

      await supabase.functions.invoke('send-email', { body: payload })
    } catch {
      // Edge function unreachable — proceed gracefully
    }

    toast.success('تم إرسال البريد الإلكتروني للعميل بنجاح')
    markAsSent()
    setSending(false)
  }

  if (isLoading) return <div className="flex justify-center py-16"><div className="animate-spin w-7 h-7 border-2 border-primary-600 border-t-transparent rounded-full" /></div>
  if (!invoice) return <div className="text-center py-16 text-slate-500">Invoice not found</div>

  const statusColor = invoiceStatusColor[invoice.status] ?? 'bg-slate-100 text-slate-700'

  return (
    <div className="max-w-4xl mx-auto">
      {/* Action bar - hidden in print */}
      <div className="flex flex-wrap items-center gap-3 mb-6 no-print">
        <button onClick={() => navigate('/invoices')} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-600">
          <ArrowLeft size={20} />
        </button>
        <Link to={`/invoices/${id}/edit`}>
          <Button variant="outline" size="sm" icon={<Pencil size={15} />}>تعديل</Button>
        </Link>
        <Button variant="outline" size="sm" icon={<Printer size={15} />} onClick={() => window.print()}>طباعة</Button>
        <Link to={`/receipts/new?invoice=${id}`}>
          <Button variant="outline" size="sm" icon={<Receipt size={15} />}>إصدار إيصال</Button>
        </Link>
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
        {invoice.status !== 'paid' && (
          <Button variant="outline" size="sm" icon={<CheckCircle size={15} />} onClick={markAsPaid} className="border-green-300 text-green-700 hover:bg-green-50">
            تسديد كامل
          </Button>
        )}
      </div>

      {/* Invoice document - the only thing that prints */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 sm:p-10 shadow-sm print:shadow-none print:border-0 print:rounded-none print:p-0">
        {/* Header */}
        <div className="flex justify-between items-start mb-10 pb-6 border-b border-slate-100">
          <div className="flex items-start gap-4">
            <img
              src="/Logo_Final-01.jpg"
              alt="Almaimoun Construction"
              className="w-20 h-20 object-contain"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
            <div>
              <h1 className="text-xl font-bold" style={{ color: '#7b4a2d' }}>Almaimoun Construction Est.</h1>
              <p className="font-medium text-slate-600 text-sm">مؤسسة الميمون للمقاولات</p>
              {company?.address && <p className="text-slate-500 text-sm mt-1">{company.address}</p>}
              {company?.phone && <p className="text-slate-500 text-sm">Tel: {company.phone}</p>}
              {company?.email && <p className="text-slate-500 text-sm">{company.email}</p>}
              {company?.tax_number && <p className="text-slate-500 text-sm">VAT Reg. No.: {company.tax_number}</p>}
              {company?.commercial_reg && <p className="text-slate-500 text-sm">CR No.: {company.commercial_reg}</p>}
            </div>
          </div>
          <div className="text-right">
            <h2 className="text-4xl font-extrabold tracking-wide mb-1" style={{ color: '#c4925a' }}>INVOICE</h2>
            <p className="text-slate-700 font-bold text-lg">{invoice.invoice_number}</p>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-2 ${statusColor}`}>
              {invoiceStatusLabel[invoice.status]}
            </span>
          </div>
        </div>

        {/* Bill To + Dates */}
        <div className="grid grid-cols-2 gap-8 mb-8">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Bill To</p>
            <p className="font-bold text-slate-800 text-base">{invoice.customer_name}</p>
            {invoice.customer_address && <p className="text-slate-600 text-sm mt-1">{invoice.customer_address}</p>}
            {invoice.customer_email && <p className="text-slate-500 text-sm">{invoice.customer_email}</p>}
            {invoice.customer_tax_number && <p className="text-slate-500 text-sm">VAT No.: {invoice.customer_tax_number}</p>}
            {invoice.ship_to && (
              <div className="mt-3">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Ship To</p>
                <p className="text-slate-600 text-sm">{invoice.ship_to}</p>
              </div>
            )}
          </div>
          <div className="bg-slate-50 rounded-xl p-4 print:bg-gray-50">
            <table className="w-full text-sm">
              <tbody>
                <tr>
                  <td className="text-slate-500 pb-2 pr-4">Invoice No.</td>
                  <td className="font-semibold text-slate-800 pb-2 text-right">{invoice.invoice_number}</td>
                </tr>
                <tr>
                  <td className="text-slate-500 pb-2 pr-4">Issue Date</td>
                  <td className="font-medium text-slate-700 pb-2 text-right">{formatDate(invoice.issue_date)}</td>
                </tr>
                {invoice.due_date && (
                  <tr>
                    <td className="text-slate-500 pb-2 pr-4">Due Date</td>
                    <td className="font-medium text-slate-700 pb-2 text-right">{formatDate(invoice.due_date)}</td>
                  </tr>
                )}
                {invoice.payment_terms && (
                  <tr>
                    <td className="text-slate-500 pr-4">Payment Terms</td>
                    <td className="font-medium text-slate-700 text-right">{invoice.payment_terms}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Items table */}
        <table className="w-full mb-6 text-sm">
          <thead>
            <tr style={{ background: '#7b4a2d' }}>
              <th className="px-4 py-3 text-left font-semibold text-white rounded-tl-lg w-8">#</th>
              <th className="px-4 py-3 text-left font-semibold text-white">Description</th>
              <th className="px-4 py-3 text-center font-semibold text-white w-20">Qty</th>
              <th className="px-4 py-3 text-right font-semibold text-white w-32">Unit Price</th>
              <th className="px-4 py-3 text-right font-semibold text-white rounded-tr-lg w-32">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item, idx) => (
              <tr key={item.id ?? idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                <td className="px-4 py-3 text-slate-400">{idx + 1}</td>
                <td className="px-4 py-3 text-slate-800">{item.description}</td>
                <td className="px-4 py-3 text-center text-slate-600">{Number(item.quantity).toLocaleString('en-US')}</td>
                <td className="px-4 py-3 text-right text-slate-600">{Number(item.unit_price).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</td>
                <td className="px-4 py-3 text-right font-medium text-slate-800">{Number(item.total).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end mb-8">
          <div className="w-80 space-y-2 text-sm">
            <div className="flex justify-between py-1">
              <span className="text-slate-500">Subtotal</span>
              <span className="text-slate-700 font-medium">{formatCurrencyEn(Number(invoice.subtotal))}</span>
            </div>
            {Number(invoice.tax_rate) > 0 && (
              <div className="flex justify-between py-1">
                <span className="text-slate-500">VAT ({invoice.tax_rate}%)</span>
                <span className="text-slate-700">{formatCurrencyEn(Number(invoice.tax_amount))}</span>
              </div>
            )}
            {Number(invoice.discount) > 0 && (
              <div className="flex justify-between py-1 text-green-700">
                <span>Discount</span>
                <span>- {formatCurrencyEn(Number(invoice.discount))}</span>
              </div>
            )}
            <div className="flex justify-between border-t-2 border-slate-200 pt-3 font-bold text-base">
              <span style={{ color: '#7b4a2d' }}>Total</span>
              <span style={{ color: '#7b4a2d' }}>{formatCurrencyEn(Number(invoice.total))}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        {invoice.notes && (
          <div className="border-t border-slate-200 pt-5 mb-4">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Notes</p>
            <p className="text-slate-600 text-sm whitespace-pre-line">{invoice.notes}</p>
          </div>
        )}

        {/* Bank / Payment info */}
        {company?.bank_name && (
          <div className="border-t border-slate-200 pt-5 mt-2">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Payment Information</p>
            <div className="grid grid-cols-3 gap-4 text-sm">
              {company.bank_name && (
                <div><p className="text-slate-400 text-xs mb-0.5">Bank</p><p className="text-slate-700 font-medium">{company.bank_name}</p></div>
              )}
              {company.bank_account && (
                <div><p className="text-slate-400 text-xs mb-0.5">Account No.</p><p className="text-slate-700 font-medium">{company.bank_account}</p></div>
              )}
              {company.bank_iban && (
                <div><p className="text-slate-400 text-xs mb-0.5">IBAN</p><p className="text-slate-700 font-medium">{company.bank_iban}</p></div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-10 pt-4 border-t border-slate-100 text-center">
          <p className="text-slate-400 text-xs">Thank you for your business — {company?.name_en ?? 'Almaimoun Construction Est.'}</p>
        </div>
      </div>
    </div>
  )
}

function buildPrintableHTML(invoice: Invoice, items: InvoiceItem[], company: CompanySettings | null): string {
  const itemRows = items.map((item, idx) => `
    <tr style="${idx % 2 !== 0 ? 'background:#f8fafc;' : ''}">
      <td style="padding:10px 14px;color:#94a3b8;font-size:13px;">${idx + 1}</td>
      <td style="padding:10px 14px;color:#1e293b;font-size:13px;">${item.description}</td>
      <td style="padding:10px 14px;text-align:center;color:#475569;font-size:13px;">${Number(item.quantity)}</td>
      <td style="padding:10px 14px;text-align:right;color:#475569;font-size:13px;">${Number(item.unit_price).toFixed(3)}</td>
      <td style="padding:10px 14px;text-align:right;font-weight:600;color:#1e293b;font-size:13px;">${Number(item.total).toFixed(3)}</td>
    </tr>`).join('')

  return `<!DOCTYPE html>
<html dir="ltr">
<head>
<meta charset="utf-8" />
<title>فاتورة_الميمون_رقم_${invoice.invoice_number}</title>
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
        ${company?.tax_number ? `<p style="margin:2px 0 0;font-size:12px;color:#94a3b8;">VAT: ${company.tax_number}</p>` : ''}
        ${company?.commercial_reg ? `<p style="margin:2px 0 0;font-size:12px;color:#94a3b8;">CR: ${company.commercial_reg}</p>` : ''}
      </div>
      <div style="text-align:right;">
        <h2 style="margin:0;font-size:32px;font-weight:800;color:#c4925a;letter-spacing:1px;">INVOICE</h2>
        <p style="margin:6px 0 0;font-size:16px;font-weight:700;color:#334155;">${invoice.invoice_number}</p>
      </div>
    </div>

    <!-- Client + Dates -->
    <div style="display:flex;justify-content:space-between;margin-bottom:24px;">
      <div>
        <p style="margin:0;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">Bill To</p>
        <p style="margin:6px 0 0;font-size:15px;font-weight:700;color:#1e293b;">${invoice.customer_name}</p>
        ${invoice.customer_address ? `<p style="margin:3px 0 0;font-size:12px;color:#64748b;">${invoice.customer_address}</p>` : ''}
        ${invoice.customer_email ? `<p style="margin:2px 0 0;font-size:12px;color:#64748b;">${invoice.customer_email}</p>` : ''}
        ${invoice.customer_tax_number ? `<p style="margin:2px 0 0;font-size:12px;color:#64748b;">VAT No.: ${invoice.customer_tax_number}</p>` : ''}
      </div>
      <div style="text-align:right;font-size:12px;color:#64748b;background:#f8fafc;padding:14px 18px;border-radius:8px;">
        <p style="margin:0;"><strong>Invoice No.:</strong> ${invoice.invoice_number}</p>
        <p style="margin:4px 0 0;"><strong>Issue Date:</strong> ${invoice.issue_date}</p>
        ${invoice.due_date ? `<p style="margin:4px 0 0;"><strong>Due Date:</strong> ${invoice.due_date}</p>` : ''}
        ${invoice.payment_terms ? `<p style="margin:4px 0 0;"><strong>Terms:</strong> ${invoice.payment_terms}</p>` : ''}
      </div>
    </div>

    <!-- Items Table -->
    <table style="width:100%;margin-bottom:20px;">
      <thead>
        <tr style="background:#7b4a2d;">
          <th style="padding:10px 14px;text-align:left;color:white;font-size:12px;font-weight:600;">#</th>
          <th style="padding:10px 14px;text-align:left;color:white;font-size:12px;font-weight:600;">Description</th>
          <th style="padding:10px 14px;text-align:center;color:white;font-size:12px;font-weight:600;">Qty</th>
          <th style="padding:10px 14px;text-align:right;color:white;font-size:12px;font-weight:600;">Unit Price</th>
          <th style="padding:10px 14px;text-align:right;color:white;font-size:12px;font-weight:600;">Amount</th>
        </tr>
      </thead>
      <tbody style="border:1px solid #e2e8f0;">${itemRows}</tbody>
    </table>

    <!-- Totals -->
    <div style="text-align:right;margin-bottom:24px;">
      <table style="margin-left:auto;width:260px;font-size:13px;">
        <tr><td style="padding:5px 0;color:#64748b;">Subtotal</td><td style="padding:5px 0;text-align:right;font-weight:500;">${Number(invoice.subtotal).toFixed(3)} BHD</td></tr>
        ${Number(invoice.tax_rate) > 0 ? `<tr><td style="padding:5px 0;color:#64748b;">VAT (${invoice.tax_rate}%)</td><td style="padding:5px 0;text-align:right;">${Number(invoice.tax_amount).toFixed(3)} BHD</td></tr>` : ''}
        ${Number(invoice.discount) > 0 ? `<tr><td style="padding:5px 0;color:#16a34a;">Discount</td><td style="padding:5px 0;text-align:right;color:#16a34a;">- ${Number(invoice.discount).toFixed(3)} BHD</td></tr>` : ''}
        <tr style="border-top:2px solid #7b4a2d;"><td style="padding:10px 0;font-weight:700;color:#7b4a2d;font-size:15px;">Total</td><td style="padding:10px 0;text-align:right;font-weight:700;color:#7b4a2d;font-size:15px;">${Number(invoice.total).toFixed(3)} BHD</td></tr>
      </table>
    </div>

    ${invoice.notes ? `<div style="border-top:1px solid #f1f5f9;padding-top:14px;margin-bottom:14px;"><p style="margin:0 0 4px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;">Notes</p><p style="margin:0;font-size:12px;color:#64748b;white-space:pre-line;">${invoice.notes}</p></div>` : ''}

    ${company?.bank_name ? `<div style="border-top:1px solid #f1f5f9;padding-top:14px;font-size:12px;color:#64748b;"><strong>Bank:</strong> ${company.bank_name} | <strong>Account:</strong> ${company.bank_account || '-'} | <strong>IBAN:</strong> ${company.bank_iban || '-'}</div>` : ''}

    <!-- Footer -->
    <div style="margin-top:30px;padding-top:12px;border-top:1px solid #f1f5f9;text-align:center;">
      <p style="margin:0;font-size:11px;color:#94a3b8;">Thank you for your business — ${company?.name_en ?? 'Almaimoun Construction Est.'}</p>
    </div>
  </div>
</body>
</html>`
}

function buildEmailHTML(invoice: Invoice, items: InvoiceItem[], company: CompanySettings | null): string {
  const itemRows = items.map((item, idx) => `
    <tr style="border-bottom:1px solid #f1f5f9;">
      <td style="padding:10px 12px;color:#64748b;font-size:13px;">${idx + 1}</td>
      <td style="padding:10px 12px;color:#1e293b;font-size:13px;">${item.description}</td>
      <td style="padding:10px 12px;text-align:center;color:#475569;font-size:13px;">${Number(item.quantity)}</td>
      <td style="padding:10px 12px;text-align:right;color:#475569;font-size:13px;">${Number(item.unit_price).toFixed(3)}</td>
      <td style="padding:10px 12px;text-align:right;font-weight:600;color:#1e293b;font-size:13px;">${Number(item.total).toFixed(3)}</td>
    </tr>`).join('')

  return `<!DOCTYPE html>
<html dir="ltr">
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:20px;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:680px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">
    <div style="padding:28px 32px;border-bottom:1px solid #f1f5f9;">
      <table style="width:100%;"><tr>
        <td style="vertical-align:top;">
          <h1 style="margin:0;font-size:18px;color:#7b4a2d;">Almaimoun Construction Est.</h1>
          <p style="margin:4px 0 0;font-size:13px;color:#64748b;">مؤسسة الميمون للمقاولات</p>
          ${company?.address ? `<p style="margin:2px 0 0;font-size:12px;color:#94a3b8;">${company.address}</p>` : ''}
          ${company?.phone ? `<p style="margin:2px 0 0;font-size:12px;color:#94a3b8;">Tel: ${company.phone}</p>` : ''}
        </td>
        <td style="vertical-align:top;text-align:right;">
          <h2 style="margin:0;font-size:28px;font-weight:800;color:#c4925a;letter-spacing:1px;">INVOICE</h2>
          <p style="margin:4px 0 0;font-size:14px;font-weight:700;color:#334155;">${invoice.invoice_number}</p>
        </td>
      </tr></table>
    </div>

    <div style="padding:24px 32px;">
      <table style="width:100%;"><tr>
        <td style="vertical-align:top;">
          <p style="margin:0;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">Bill To</p>
          <p style="margin:6px 0 0;font-size:14px;font-weight:700;color:#1e293b;">${invoice.customer_name}</p>
          ${invoice.customer_address ? `<p style="margin:2px 0 0;font-size:12px;color:#64748b;">${invoice.customer_address}</p>` : ''}
          ${invoice.customer_email ? `<p style="margin:2px 0 0;font-size:12px;color:#64748b;">${invoice.customer_email}</p>` : ''}
        </td>
        <td style="vertical-align:top;text-align:right;font-size:12px;color:#64748b;">
          <p style="margin:0;"><strong>Issue Date:</strong> ${invoice.issue_date}</p>
          ${invoice.due_date ? `<p style="margin:4px 0 0;"><strong>Due Date:</strong> ${invoice.due_date}</p>` : ''}
          ${invoice.payment_terms ? `<p style="margin:4px 0 0;"><strong>Terms:</strong> ${invoice.payment_terms}</p>` : ''}
        </td>
      </tr></table>
    </div>

    <div style="padding:0 32px 24px;">
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#7b4a2d;">
            <th style="padding:10px 12px;text-align:left;color:white;font-size:12px;font-weight:600;">#</th>
            <th style="padding:10px 12px;text-align:left;color:white;font-size:12px;font-weight:600;">Description</th>
            <th style="padding:10px 12px;text-align:center;color:white;font-size:12px;font-weight:600;">Qty</th>
            <th style="padding:10px 12px;text-align:right;color:white;font-size:12px;font-weight:600;">Unit Price</th>
            <th style="padding:10px 12px;text-align:right;color:white;font-size:12px;font-weight:600;">Amount</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
    </div>

    <div style="padding:0 32px 24px;text-align:right;">
      <table style="margin-left:auto;width:240px;font-size:13px;">
        <tr><td style="padding:4px 0;color:#64748b;">Subtotal</td><td style="padding:4px 0;text-align:right;font-weight:500;">${Number(invoice.subtotal).toFixed(3)} BHD</td></tr>
        ${Number(invoice.tax_rate) > 0 ? `<tr><td style="padding:4px 0;color:#64748b;">VAT (${invoice.tax_rate}%)</td><td style="padding:4px 0;text-align:right;">${Number(invoice.tax_amount).toFixed(3)} BHD</td></tr>` : ''}
        ${Number(invoice.discount) > 0 ? `<tr><td style="padding:4px 0;color:#16a34a;">Discount</td><td style="padding:4px 0;text-align:right;color:#16a34a;">- ${Number(invoice.discount).toFixed(3)} BHD</td></tr>` : ''}
        <tr style="border-top:2px solid #e2e8f0;"><td style="padding:8px 0;font-weight:700;color:#7b4a2d;font-size:14px;">Total</td><td style="padding:8px 0;text-align:right;font-weight:700;color:#7b4a2d;font-size:14px;">${Number(invoice.total).toFixed(3)} BHD</td></tr>
      </table>
    </div>

    ${invoice.notes ? `<div style="padding:0 32px 24px;border-top:1px solid #f1f5f9;padding-top:16px;"><p style="margin:0 0 4px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;">Notes</p><p style="margin:0;font-size:12px;color:#64748b;white-space:pre-line;">${invoice.notes}</p></div>` : ''}

    ${company?.bank_name ? `<div style="padding:16px 32px;border-top:1px solid #f1f5f9;font-size:12px;color:#64748b;"><strong>Bank:</strong> ${company.bank_name} | <strong>Account:</strong> ${company.bank_account || '-'} | <strong>IBAN:</strong> ${company.bank_iban || '-'}</div>` : ''}

    <div style="padding:16px 32px;border-top:1px solid #f1f5f9;text-align:center;">
      <p style="margin:0;font-size:11px;color:#94a3b8;">Thank you for your business — ${company?.name_en ?? 'Almaimoun Construction Est.'}</p>
    </div>
  </div>
</body>
</html>`
}
