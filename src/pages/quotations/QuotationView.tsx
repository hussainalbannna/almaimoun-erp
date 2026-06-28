import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, Printer, Pencil, Send, CheckCircle, Briefcase, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatCurrency, formatDate, openWhatsApp } from '../../lib/utils'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import toast from 'react-hot-toast'

interface QItem { id: string; description: string; category: string; quantity: number; unit: string; unit_price: number; total: number; sort_order: number }
interface Quote {
  id: string; quote_number: string; customer_name: string; customer_phone: string
  project_name: string; location: string; issue_date: string; valid_until: string | null
  status: string; subtotal: number; discount: number; tax_rate: number; tax_amount: number
  total: number; notes: string; terms: string; converted_project_id: string | null
}

const STATUS: Record<string, { label: string; color: 'gray' | 'blue' | 'green' | 'red' | 'amber' }> = {
  draft: { label: 'مسودة', color: 'gray' },
  sent: { label: 'مُرسل', color: 'blue' },
  accepted: { label: 'مقبول', color: 'green' },
  rejected: { label: 'مرفوض', color: 'red' },
  expired: { label: 'منتهي', color: 'amber' },
}

export default function QuotationView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [quote, setQuote] = useState<Quote | null>(null)
  const [items, setItems] = useState<QItem[]>([])
  const [company, setCompany] = useState<{ name?: string; phone?: string; address?: string; logo_url?: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [converting, setConverting] = useState(false)
  const [showConvert, setShowConvert] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data: q } = await supabase.from('quotations').select('*').eq('id', id).single()
      setQuote(q as Quote)
      const { data: its } = await supabase.from('quotation_items').select('*').eq('quotation_id', id).order('sort_order')
      setItems((its ?? []) as QItem[])
      const { data: c } = await supabase.from('company_settings').select('name,phone,address,logo_url').limit(1)
      if (c && c.length) setCompany(c[0])
      setLoading(false)
    }
    load()
  }, [id])

  const setStatus = async (status: string) => {
    if (!quote) return
    await supabase.from('quotations').update({ status }).eq('id', quote.id)
    setQuote({ ...quote, status })
    toast.success('تم تحديث الحالة')
  }

  const sendWhatsApp = () => {
    if (!quote) return
    const msg = `عرض سعر رقم ${quote.quote_number}\nمن: ${company?.name ?? 'مؤسسة الميمون للمقاولات'}\nالمشروع: ${quote.project_name}\nالقيمة الإجمالية: ${formatCurrency(Number(quote.total))}\nصالح حتى: ${quote.valid_until ? formatDate(quote.valid_until) : '—'}\n\nنسعد بخدمتكم.`
    openWhatsApp(quote.customer_phone || '', msg)
  }

  // تحويل العرض إلى مشروع
  const convertToProject = async () => {
    if (!quote) return
    setConverting(true)
    try {
      const year = new Date().getFullYear()
      const { data: existing } = await supabase.from('projects').select('project_number').order('created_at', { ascending: false }).limit(50)
      const nums = (existing ?? []).map(p => { const m = String(p.project_number).match(/(\d+)$/); return m ? parseInt(m[1]) : 0 })
      const next = (nums.length ? Math.max(...nums) : 0) + 1
      const projectNumber = `PRJ-${year}-${String(next).padStart(3, '0')}`

      const { data: proj, error } = await supabase.from('projects').insert({
        project_number: projectNumber,
        client_name: quote.customer_name,
        client_phone: quote.customer_phone,
        project_name: quote.project_name || `مشروع ${quote.customer_name}`,
        location: quote.location,
        contract_value: quote.total,
        status: 'active',
        notes: `محوّل من عرض السعر رقم ${quote.quote_number}`,
      }).select('id').single()
      if (error) throw error

      await supabase.from('quotations').update({ converted_project_id: proj.id, status: 'accepted' }).eq('id', quote.id)
      toast.success('تم تحويل العرض إلى مشروع بنجاح')
      navigate(`/projects/${proj.id}`)
    } catch (e) {
      toast.error('تعذّر التحويل: ' + ((e as Error)?.message ?? ''))
    } finally {
      setConverting(false)
      setShowConvert(false)
    }
  }

  if (loading) return <div className="p-6 text-center text-slate-400" dir="rtl">جاري التحميل...</div>
  if (!quote) return <div className="p-6 text-center text-slate-400" dir="rtl">العرض غير موجود</div>

  return (
    <div className="p-6 max-w-4xl mx-auto" dir="rtl">
      {/* شريط الأدوات — يختفي عند الطباعة */}
      <div className="no-print flex items-center justify-between mb-5 flex-wrap gap-3">
        <button onClick={() => navigate('/quotations')} className="p-2 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100">
          <ArrowRight size={20} />
        </button>
        <div className="flex items-center gap-2 flex-wrap">
          {quote.status !== 'sent' && quote.status !== 'accepted' && (
            <Button size="sm" variant="outline" icon={<Send size={14} />} onClick={() => setStatus('sent')}>تعليم كمُرسل</Button>
          )}
          {quote.status !== 'accepted' && (
            <Button size="sm" variant="outline" icon={<CheckCircle size={14} />} onClick={() => setStatus('accepted')}>تعليم كمقبول</Button>
          )}
          <Button size="sm" variant="outline" icon={<Send size={14} />} onClick={sendWhatsApp}>واتساب</Button>
          <Button size="sm" variant="outline" icon={<Pencil size={14} />} onClick={() => navigate(`/quotations/${quote.id}/edit`)}>تعديل</Button>
          <Button size="sm" variant="outline" icon={<Printer size={14} />} onClick={() => window.print()}>طباعة</Button>
          {!quote.converted_project_id ? (
            <Button size="sm" icon={<Briefcase size={14} />} onClick={() => setShowConvert(true)}>تحويل لمشروع</Button>
          ) : (
            <Button size="sm" variant="secondary" icon={<Briefcase size={14} />} onClick={() => navigate(`/projects/${quote.converted_project_id}`)}>فتح المشروع</Button>
          )}
        </div>
      </div>

      {/* ورقة العرض */}
      <div className="bg-white rounded-xl border border-slate-200 p-8 print:border-0 print:shadow-none">
        {/* رأس */}
        <div className="flex items-start justify-between border-b-2 pb-5 mb-5" style={{ borderColor: '#c4925a' }}>
          <div className="flex items-center gap-3">
            {company?.logo_url && <img src={company.logo_url} alt="" className="w-16 h-16 rounded-lg object-cover" />}
            <div>
              <div className="text-lg font-bold text-slate-800">{company?.name ?? 'مؤسسة الميمون للمقاولات'}</div>
              {company?.address && <div className="text-xs text-slate-500 mt-0.5">{company.address}</div>}
              {company?.phone && <div className="text-xs text-slate-500">هاتف: {company.phone}</div>}
            </div>
          </div>
          <div className="text-left">
            <div className="text-2xl font-bold" style={{ color: '#7b4a2d' }}>عرض سعر</div>
            <div className="text-sm text-slate-500 mt-1">{quote.quote_number}</div>
            <div className="mt-2"><Badge color={STATUS[quote.status]?.color ?? 'gray'}>{STATUS[quote.status]?.label ?? quote.status}</Badge></div>
          </div>
        </div>

        {/* بيانات */}
        <div className="grid grid-cols-2 gap-6 mb-6 text-sm">
          <div>
            <div className="text-xs text-slate-400 mb-1">مقدّم إلى</div>
            <div className="font-semibold text-slate-800">{quote.customer_name || '—'}</div>
            {quote.customer_phone && <div className="text-slate-500">{quote.customer_phone}</div>}
            {quote.location && <div className="text-slate-500">{quote.location}</div>}
          </div>
          <div className="text-left">
            <div className="flex justify-between mb-1"><span className="text-slate-400">المشروع:</span><span className="text-slate-700 font-medium">{quote.project_name || '—'}</span></div>
            <div className="flex justify-between mb-1"><span className="text-slate-400">التاريخ:</span><span className="text-slate-700">{formatDate(quote.issue_date)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">صالح حتى:</span><span className="text-slate-700">{quote.valid_until ? formatDate(quote.valid_until) : '—'}</span></div>
          </div>
        </div>

        {/* جدول البنود */}
        <table className="w-full text-sm mb-6">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500 text-xs">
              <th className="text-right font-medium py-2 w-8">#</th>
              <th className="text-right font-medium py-2">الوصف</th>
              <th className="text-center font-medium py-2">الكمية</th>
              <th className="text-center font-medium py-2">الوحدة</th>
              <th className="text-left font-medium py-2">سعر الوحدة</th>
              <th className="text-left font-medium py-2">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={it.id} className="border-b border-slate-100">
                <td className="py-2.5 text-slate-400">{i + 1}</td>
                <td className="py-2.5 text-slate-700">
                  {it.description}
                  {it.category && <span className="text-xs text-slate-400 block">{it.category}</span>}
                </td>
                <td className="py-2.5 text-center text-slate-600">{it.quantity}</td>
                <td className="py-2.5 text-center text-slate-600">{it.unit}</td>
                <td className="py-2.5 text-left text-slate-600">{Number(it.unit_price).toFixed(3)}</td>
                <td className="py-2.5 text-left font-medium text-slate-800">{Number(it.total).toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* الإجماليات */}
        <div className="flex justify-end mb-6">
          <div className="w-64 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">المجموع الفرعي</span><span>{formatCurrency(Number(quote.subtotal))}</span></div>
            {Number(quote.discount) > 0 && <div className="flex justify-between"><span className="text-slate-500">الخصم</span><span>- {formatCurrency(Number(quote.discount))}</span></div>}
            <div className="flex justify-between"><span className="text-slate-500">الضريبة ({quote.tax_rate}%)</span><span>{formatCurrency(Number(quote.tax_amount))}</span></div>
            <div className="flex justify-between border-t-2 pt-2 font-bold text-base" style={{ borderColor: '#c4925a' }}>
              <span>الإجمالي</span>
              <span style={{ color: '#7b4a2d' }}>{formatCurrency(Number(quote.total))}</span>
            </div>
          </div>
        </div>

        {/* الشروط والملاحظات */}
        {quote.terms && (
          <div className="border-t border-slate-200 pt-4 mb-3">
            <div className="text-xs font-semibold text-slate-600 mb-1">الشروط والأحكام</div>
            <p className="text-xs text-slate-500 leading-relaxed whitespace-pre-wrap">{quote.terms}</p>
          </div>
        )}
        {quote.notes && (
          <div className="text-xs text-slate-500"><span className="font-semibold">ملاحظات: </span>{quote.notes}</div>
        )}
      </div>

      <ConfirmDialog
        open={showConvert}
        onCancel={() => setShowConvert(false)}
        onConfirm={convertToProject}
        title="تحويل العرض إلى مشروع"
        message={`سيتم إنشاء مشروع جديد بقيمة عقد ${formatCurrency(Number(quote.total))} وربطه بهذا العرض. هل تريد المتابعة؟`}
        confirmLabel={converting ? 'جاري التحويل...' : 'تحويل'}
      />
    </div>
  )
}
