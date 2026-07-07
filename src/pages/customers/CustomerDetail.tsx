import { useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight, Plus, FileText, Pencil, MessageCircle, Phone, Mail, Building2,
  Wallet, Receipt, FolderOpen, MapPin, CreditCard, Hash, ClipboardList,
  Paperclip, Image as ImageIcon, X
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Customer } from '../../types'
import type { BadgeColor } from '../../components/ui/Badge'
import { formatCurrency, formatDate, openWhatsApp } from '../../lib/utils'
import { resolveAttachmentUrl } from '../../lib/storage'
import { openStoredFile } from '../../lib/ai'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import toast from 'react-hot-toast'

const GOLD = '#c4925a'
const DARK = '#7b4a2d'

const STATUS_LABEL: Record<string, string> = {
  draft: 'مسودة', sent: 'مرسلة', paid: 'مدفوعة', overdue: 'متأخرة', cancelled: 'ملغاة',
}
const STATUS_COLOR = (s: string): BadgeColor =>
  s === 'paid' ? 'green' : s === 'sent' ? 'blue' : s === 'overdue' ? 'red' : s === 'cancelled' ? 'gray' : 'amber'

interface CustomerInvoice {
  id: string
  invoice_number: string
  issue_date: string
  status: string
  total: number
  paid: number
  remaining: number
}
interface CustomerProject {
  id: string
  project_name: string
  contract_value: number
  status: string
}
// مستند العميل: file_url يحمل مسار Storage للمستندات الجديدة أو Data URL قديم (base64) للسجلّات السابقة
interface CustomerDoc {
  id: string
  name: string
  file_url: string
  file_type: string
  created_at: string
}
interface CustomerDetailData {
  customer: Customer | null
  invoices: CustomerInvoice[]
  projects: CustomerProject[]
  documents: CustomerDoc[]
  stats: { invoiceCount: number; totalInvoiced: number; totalPaid: number; outstanding: number }
}
const EMPTY: CustomerDetailData = {
  customer: null, invoices: [], projects: [], documents: [],
  stats: { invoiceCount: 0, totalInvoiced: 0, totalPaid: 0, outstanding: 0 },
}

// جلب كل ما يخص العميل (بياناته + فواتيره + إيصالاته + مشاريعه + مستنداته) وحساب إجمالياته — مصدر React Query
async function fetchCustomerDetail(id: string): Promise<CustomerDetailData> {
  const [custRes, invRes, recRes, projRes, docRes] = await Promise.all([
    supabase.from('customers').select('*').eq('id', id).maybeSingle(),
    supabase.from('invoices').select('id, invoice_number, issue_date, status, total').eq('customer_id', id).order('issue_date', { ascending: false }),
    supabase.from('receipts').select('amount, invoice_id').eq('customer_id', id),
    supabase.from('projects').select('id, project_name, contract_value, status').eq('client_id', id).order('created_at', { ascending: false }),
    supabase.from('documents').select('id, name, file_url, file_type, created_at').eq('related_id', id).eq('related_type', 'customer').order('created_at', { ascending: false }),
  ])

  const customer = (custRes.data as Customer) ?? null
  const rawInvoices = (invRes.data ?? []) as Array<{ id: string; invoice_number: string; issue_date: string; status: string; total: number }>
  const receipts = (recRes.data ?? []) as Array<{ amount: number; invoice_id: string | null }>
  const projects = (projRes.data ?? []) as CustomerProject[]
  const documents = (docRes.data ?? []) as CustomerDoc[]

  // مجموع المدفوع لكل فاتورة من الإيصالات المرتبطة بها
  const paidByInvoice = new Map<string, number>()
  for (const r of receipts) {
    if (r.invoice_id) paidByInvoice.set(r.invoice_id, (paidByInvoice.get(r.invoice_id) ?? 0) + Number(r.amount || 0))
  }

  const invoices: CustomerInvoice[] = rawInvoices.map(inv => {
    const total = Number(inv.total || 0)
    const paid = paidByInvoice.get(inv.id) ?? 0
    return { id: inv.id, invoice_number: inv.invoice_number, issue_date: inv.issue_date, status: inv.status, total, paid, remaining: total - paid }
  })

  // الإجماليات تستبعد الفواتير الملغاة (متوافق مع منطق كشف الحساب)
  const active = invoices.filter(i => i.status !== 'cancelled')
  const totalInvoiced = active.reduce((s, i) => s + i.total, 0)
  const totalPaid = receipts.reduce((s, r) => s + Number(r.amount || 0), 0)

  return {
    customer,
    invoices,
    projects,
    documents,
    stats: { invoiceCount: invoices.length, totalInvoiced, totalPaid, outstanding: totalInvoiced - totalPaid },
  }
}

function StatCard({ label, value, color = '#0f172a', icon }: { label: string; value: string; color?: string; icon: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center gap-2 text-slate-400 text-xs mb-1.5">{icon}<span>{label}</span></div>
      <div className="text-lg font-bold whitespace-nowrap" style={{ color }} dir="ltr">{value}</div>
    </div>
  )
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="text-slate-400 shrink-0 mt-0.5">{icon}</span>
      <span className="text-slate-400 shrink-0">{label}:</span>
      <span className="text-slate-700 font-medium break-all">{value}</span>
    </div>
  )
}

export default function CustomerDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [previewImg, setPreviewImg] = useState<string | null>(null)

  const { data = EMPTY, isLoading } = useQuery({
    queryKey: ['customer-detail', id],
    queryFn: () => fetchCustomerDetail(id!),
    enabled: !!id,
  })
  const { customer, invoices, projects, documents, stats } = data

  // فتح المستند: يحلّ مساره إلى رابط موقّع (أو base64 قديم) ثم يعرض الصورة أو يفتح الملف
  const openDoc = async (doc: CustomerDoc) => {
    const url = await resolveAttachmentUrl(doc.file_url)
    if (!url) { toast.error('تعذّر فتح المستند'); return }
    if (doc.file_type?.startsWith('image/')) setPreviewImg(url)
    else if (url.startsWith('data:')) openStoredFile(url, doc.file_type)
    else window.open(url, '_blank', 'noopener')
  }

  if (isLoading) {
    return <div className="flex justify-center py-16"><div className="animate-spin w-7 h-7 border-2 border-primary-600 border-t-transparent rounded-full" /></div>
  }

  if (!customer) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 py-16 text-center">
        <p className="text-slate-500 text-sm mb-3">لم يتم العثور على العميل</p>
        <Link to="/customers" className="text-sm text-primary-600 hover:underline">العودة لقائمة العملاء</Link>
      </div>
    )
  }

  return (
    <div className="space-y-5 pb-4" dir="rtl">
      {/* ── الترويسة والإجراءات ── */}
      <div className="flex flex-col gap-3">
        <button onClick={() => navigate('/customers')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 w-fit">
          <ArrowRight size={16} /> كل العملاء
        </button>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white text-lg font-bold shrink-0"
              style={{ background: `linear-gradient(135deg, ${GOLD} 0%, ${DARK} 100%)` }}>
              {(customer.name || '؟').trim().charAt(0)}
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">{customer.name}</h1>
              {customer.company_name && <p className="text-sm text-slate-500">{customer.company_name}</p>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/invoices/new?customer=${customer.id}`}><Button icon={<Plus size={15} />}>فاتورة جديدة</Button></Link>
            <Button variant="secondary" icon={<ClipboardList size={15} />} onClick={() => navigate(`/customers/${customer.id}/statement`)}>كشف الحساب</Button>
            <Button variant="secondary" icon={<Pencil size={15} />} onClick={() => navigate(`/customers/${customer.id}/edit`)}>تعديل</Button>
            {customer.whatsapp && (
              <button onClick={() => openWhatsApp(customer.whatsapp, `مرحباً ${customer.name}`)}
                className="h-9 w-9 flex items-center justify-center rounded-lg bg-green-50 text-green-600 hover:bg-green-100" title="واتساب">
                <MessageCircle size={16} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── الإحصائيات ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="عدد الفواتير" value={String(stats.invoiceCount)} color={DARK} icon={<FileText size={13} />} />
        <StatCard label="إجمالي الفواتير" value={formatCurrency(stats.totalInvoiced)} icon={<Wallet size={13} />} />
        <StatCard label="المحصَّل" value={formatCurrency(stats.totalPaid)} color="#16a34a" icon={<Receipt size={13} />} />
        <StatCard label="المتبقّي" value={formatCurrency(stats.outstanding)} color={stats.outstanding > 0 ? '#dc2626' : '#16a34a'} icon={<CreditCard size={13} />} />
      </div>

      {/* ── معلومات التواصل ── */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2"><Building2 size={16} style={{ color: GOLD }} /> معلومات العميل</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {customer.phone && <InfoRow icon={<Phone size={14} />} label="الهاتف" value={customer.phone} />}
          {customer.email && <InfoRow icon={<Mail size={14} />} label="البريد" value={customer.email} />}
          {customer.whatsapp && <InfoRow icon={<MessageCircle size={14} />} label="واتساب" value={customer.whatsapp} />}
          {(customer.city || customer.country) && <InfoRow icon={<MapPin size={14} />} label="الموقع" value={[customer.city, customer.country].filter(Boolean).join('، ')} />}
          {customer.address && <InfoRow icon={<MapPin size={14} />} label="العنوان" value={customer.address} />}
          {customer.tax_number && <InfoRow icon={<Hash size={14} />} label="الرقم الضريبي" value={customer.tax_number} />}
          {customer.commercial_reg && <InfoRow icon={<Hash size={14} />} label="السجل التجاري" value={customer.commercial_reg} />}
          {customer.payment_terms && <InfoRow icon={<CreditCard size={14} />} label="شروط الدفع" value={customer.payment_terms} />}
        </div>
        {customer.notes && (
          <div className="mt-3 pt-3 border-t border-slate-100 text-sm text-slate-600 whitespace-pre-wrap">{customer.notes}</div>
        )}
      </div>

      {/* ── مستندات العميل ── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2">
            <Paperclip size={16} style={{ color: GOLD }} /> المستندات <span className="text-slate-400 font-normal">({documents.length})</span>
          </h3>
          <Link to={`/customers/${customer.id}/edit`} className="text-xs text-primary-600 hover:underline">+ إرفاق مستند</Link>
        </div>
        {documents.length === 0 ? (
          <div className="py-10 text-center">
            <Paperclip size={32} className="mx-auto text-slate-300 mb-2" />
            <p className="text-slate-500 text-sm">لا توجد مستندات مرفقة</p>
            <Link to={`/customers/${customer.id}/edit`} className="mt-2 inline-block text-sm text-primary-600 hover:underline">إرفاق مستند من صفحة التعديل</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3">
            {documents.map(doc => {
              const isImage = doc.file_type?.startsWith('image/')
              return (
                <button key={doc.id} onClick={() => openDoc(doc)}
                  className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 hover:border-amber-300 hover:bg-amber-50/40 transition-colors text-right">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: isImage ? '#eff6ff' : '#fef2f2' }}>
                    {isImage ? <ImageIcon size={16} className="text-blue-500" /> : <FileText size={16} className="text-red-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-700 truncate">{doc.name}</div>
                    <div className="text-xs text-slate-400">{formatDate(doc.created_at)}</div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── فواتير العميل ── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2"><FileText size={16} style={{ color: GOLD }} /> الفواتير <span className="text-slate-400 font-normal">({invoices.length})</span></h3>
          <Link to={`/invoices/new?customer=${customer.id}`} className="text-xs text-primary-600 hover:underline">+ فاتورة</Link>
        </div>

        {invoices.length === 0 ? (
          <div className="py-12 text-center">
            <FileText size={36} className="mx-auto text-slate-300 mb-2" />
            <p className="text-slate-500 text-sm">لا توجد فواتير لهذا العميل بعد</p>
            <Link to={`/invoices/new?customer=${customer.id}`} className="mt-2 inline-block text-sm text-primary-600 hover:underline">إنشاء أول فاتورة</Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {invoices.map(inv => (
              <button key={inv.id} onClick={() => navigate(`/invoices/${inv.id}/view`)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-amber-50/40 transition-colors text-right">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium text-slate-700">#{inv.invoice_number}</span>
                    <Badge color={STATUS_COLOR(inv.status)}>{STATUS_LABEL[inv.status] ?? inv.status}</Badge>
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">{formatDate(inv.issue_date)}</div>
                </div>
                <div className="text-left shrink-0">
                  <div className="font-bold whitespace-nowrap" style={{ color: DARK }} dir="ltr">{formatCurrency(inv.total)}</div>
                  {inv.remaining > 0 && inv.status !== 'cancelled' && (
                    <div className="text-xs text-red-600 whitespace-nowrap" dir="ltr">متبقٍ: {formatCurrency(inv.remaining)}</div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── مشاريع العميل (إن وُجدت) ── */}
      {projects.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h3 className="font-semibold text-slate-800 flex items-center gap-2"><FolderOpen size={16} style={{ color: GOLD }} /> المشاريع <span className="text-slate-400 font-normal">({projects.length})</span></h3>
          </div>
          <div className="divide-y divide-slate-100">
            {projects.map(p => (
              <button key={p.id} onClick={() => navigate(`/projects/${p.id}`)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-amber-50/40 transition-colors text-right">
                <span className="font-medium text-slate-700 truncate">{p.project_name}</span>
                <span className="font-bold whitespace-nowrap shrink-0" style={{ color: DARK }} dir="ltr">{formatCurrency(p.contract_value)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── معاينة صورة مستند ── */}
      {previewImg && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setPreviewImg(null)}>
          <div className="relative max-w-2xl max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <button onClick={() => setPreviewImg(null)} className="absolute -top-3 -left-3 bg-white rounded-full p-1.5 shadow-lg text-slate-600 hover:text-red-600"><X size={18} /></button>
            <img src={previewImg} alt="مستند" className="rounded-xl max-h-[90vh] object-contain" />
          </div>
        </div>
      )}
    </div>
  )
}
