import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ArrowLeft, Pencil, Printer, Mail, MessageCircle, CheckCircle, Package, Truck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatCurrencyEn, formatDate, lpoStatusLabel, lpoStatusColor, openWhatsApp, openEmail } from '../../lib/utils'
import type { LPO, LPOItem, CompanySettings, LPOStatus } from '../../types'
import Button from '../../components/ui/Button'
import toast from 'react-hot-toast'

export default function LPOView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [lpo, setLpo] = useState<LPO | null>(null)
  const [items, setItems] = useState<LPOItem[]>([])
  const [company, setCompany] = useState<CompanySettings | null>(null)
  const [supplierPhone, setSupplierPhone] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('lpos').select('*').eq('id', id).single(),
      supabase.from('lpo_items').select('*').eq('lpo_id', id).order('sort_order'),
      supabase.from('company_settings').select('*').single(),
    ]).then(([{ data: lpoData }, { data: lpoItems }, { data: comp }]) => {
      const lpoRecord = lpoData as LPO
      setLpo(lpoRecord)
      setItems((lpoItems ?? []) as LPOItem[])
      setCompany(comp as CompanySettings)
      if (lpoRecord?.supplier_id) {
        supabase.from('suppliers').select('whatsapp, phone').eq('id', lpoRecord.supplier_id).single().then(({ data }) => {
          if (data) setSupplierPhone((data as { whatsapp: string; phone: string }).whatsapp || (data as { whatsapp: string; phone: string }).phone || '')
        })
      }
      setLoading(false)
    })
  }, [id])

  const updateStatus = async (status: LPOStatus) => {
    await supabase.from('lpos').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    setLpo(prev => prev ? { ...prev, status } : prev)
    toast.success('Status updated')
  }

  if (loading) return <div className="flex justify-center py-16"><div className="animate-spin w-7 h-7 border-2 border-primary-600 border-t-transparent rounded-full" /></div>
  if (!lpo) return <div className="text-center py-16 text-slate-500">Purchase Order not found</div>

  const subject = `Purchase Order No. ${lpo.lpo_number} from ${company?.name_en ?? 'AlMaimoun Construction'}`
  const emailBody = `Dear ${lpo.supplier_name},\n\nPlease find attached Purchase Order No. ${lpo.lpo_number} dated ${formatDate(lpo.issue_date)}.\n\nTotal Amount: ${formatCurrencyEn(Number(lpo.total))}\n\nThank you,\n${company?.name_en ?? 'AlMaimoun Construction'}`
  const waMessage = `Dear ${lpo.supplier_name},\n\nPlease review Purchase Order No. *${lpo.lpo_number}* dated ${formatDate(lpo.issue_date)}\n\nTotal: *${formatCurrencyEn(Number(lpo.total))}*\n\n${company?.name_en ?? 'AlMaimoun Construction'}`

  const statusColor = lpoStatusColor[lpo.status as LPOStatus] ?? 'bg-slate-100 text-slate-700'

  return (
    <div className="max-w-4xl mx-auto">
      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-3 mb-6 no-print">
        <button onClick={() => navigate('/lpos')} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-600">
          <ArrowLeft size={20} />
        </button>
        <Link to={`/lpos/${id}/edit`}>
          <Button variant="outline" size="sm" icon={<Pencil size={15} />}>Edit</Button>
        </Link>
        <Button variant="outline" size="sm" icon={<Printer size={15} />} onClick={() => window.print()}>Print</Button>
        <Link to={`/lpos/${id}/deliveries`}>
          <Button variant="outline" size="sm" icon={<Truck size={15} />}>Delivery Log</Button>
        </Link>
        {lpo.supplier_email && (
          <Button variant="outline" size="sm" icon={<Mail size={15} />}
            onClick={() => { openEmail(lpo.supplier_email, subject, emailBody); updateStatus('sent') }}>
            Send Email
          </Button>
        )}
        {supplierPhone && (
          <Button
            variant="outline" size="sm"
            icon={<MessageCircle size={15} className="text-green-600" />}
            className="border-green-300 text-green-700 hover:bg-green-50"
            onClick={() => { openWhatsApp(supplierPhone, waMessage); updateStatus('sent') }}
          >
            WhatsApp
          </Button>
        )}
        {lpo.status === 'sent' && (
          <Button variant="outline" size="sm" icon={<CheckCircle size={15} />} onClick={() => updateStatus('approved')}
            className="border-blue-300 text-blue-700 hover:bg-blue-50">
            Mark Approved
          </Button>
        )}
        {lpo.status === 'approved' && (
          <Button variant="outline" size="sm" icon={<Package size={15} />} onClick={() => updateStatus('received')}
            className="border-green-300 text-green-700 hover:bg-green-50">
            Mark Received
          </Button>
        )}
      </div>

      {/* LPO document */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 sm:p-10 shadow-sm print:shadow-none print:border-0 print:rounded-none">
        {/* Header */}
        <div className="flex justify-between items-start mb-10 pb-6 border-b border-slate-100">
          <div className="flex items-start gap-4">
            <img
              src="/Logo_Final-01.jpg"
              alt="AlMaimoun Construction"
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
            <h2 className="text-3xl font-extrabold tracking-wide mb-1" style={{ color: '#c4925a' }}>PURCHASE ORDER</h2>
            <p className="text-slate-500 text-sm">Local Purchase Order</p>
            <p className="font-bold text-lg mt-1 text-slate-800">{lpo.lpo_number}</p>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-2 ${statusColor}`}>
              {lpoStatusLabel[lpo.status as LPOStatus]}
            </span>
          </div>
        </div>

        {/* Vendor + Details */}
        <div className="grid grid-cols-2 gap-8 mb-8">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Vendor</p>
            <p className="font-bold text-slate-800 text-base">{lpo.supplier_name}</p>
            {lpo.supplier_address && <p className="text-slate-600 text-sm mt-1">{lpo.supplier_address}</p>}
            {lpo.supplier_email && <p className="text-slate-500 text-sm">{lpo.supplier_email}</p>}
            {lpo.supplier_tax_number && <p className="text-slate-500 text-sm">VAT No.: {lpo.supplier_tax_number}</p>}
          </div>
          <div className="bg-slate-50 rounded-xl p-4">
            <table className="w-full text-sm">
              <tbody>
                <tr>
                  <td className="text-slate-500 pb-2 pr-4">PO Number</td>
                  <td className="font-semibold text-slate-800 pb-2 text-right">{lpo.lpo_number}</td>
                </tr>
                <tr>
                  <td className="text-slate-500 pb-2 pr-4">Issue Date</td>
                  <td className="font-medium text-slate-700 pb-2 text-right">{formatDate(lpo.issue_date)}</td>
                </tr>
                {lpo.delivery_date && (
                  <tr>
                    <td className="text-slate-500 pb-2 pr-4">Delivery Date</td>
                    <td className="font-medium text-slate-700 pb-2 text-right">{formatDate(lpo.delivery_date)}</td>
                  </tr>
                )}
                {lpo.payment_terms && (
                  <tr>
                    <td className="text-slate-500 pb-2 pr-4">Payment Terms</td>
                    <td className="font-medium text-slate-700 pb-2 text-right">{lpo.payment_terms}</td>
                  </tr>
                )}
                {lpo.delivery_address && (
                  <tr>
                    <td className="text-slate-500 pr-4">Delivery To</td>
                    <td className="font-medium text-slate-700 text-right text-xs">{lpo.delivery_address}</td>
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
              <th className="px-4 py-3 text-center font-semibold text-white w-20">QTY</th>
              <th className="px-4 py-3 text-center font-semibold text-white w-20">Unit</th>
              <th className="px-4 py-3 text-right font-semibold text-white w-28">Unit Price</th>
              <th className="px-4 py-3 text-right font-semibold text-white rounded-tr-lg w-28">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item, idx) => (
              <tr key={item.id ?? idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                <td className="px-4 py-3 text-slate-400">{idx + 1}</td>
                <td className="px-4 py-3 text-slate-800">{item.description}</td>
                <td className="px-4 py-3 text-center text-slate-600">{Number(item.quantity).toLocaleString('en-US')}</td>
                <td className="px-4 py-3 text-center text-slate-600">{item.unit}</td>
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
              <span className="text-slate-700 font-medium">{formatCurrencyEn(Number(lpo.subtotal))}</span>
            </div>
            {Number(lpo.tax_rate) > 0 && (
              <div className="flex justify-between py-1">
                <span className="text-slate-500">VAT ({lpo.tax_rate}%)</span>
                <span className="text-slate-700">{formatCurrencyEn(Number(lpo.tax_amount))}</span>
              </div>
            )}
            {Number(lpo.discount) > 0 && (
              <div className="flex justify-between py-1 text-green-700">
                <span>Discount</span>
                <span>- {formatCurrencyEn(Number(lpo.discount))}</span>
              </div>
            )}
            <div className="flex justify-between border-t-2 border-slate-200 pt-3 font-bold text-base">
              <span style={{ color: '#7b4a2d' }}>Total</span>
              <span style={{ color: '#7b4a2d' }}>{formatCurrencyEn(Number(lpo.total))}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        {lpo.notes && (
          <div className="border-t border-slate-200 pt-5 mb-4">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Notes & Terms</p>
            <p className="text-slate-600 text-sm whitespace-pre-line">{lpo.notes}</p>
          </div>
        )}

        {/* Signature area */}
        <div className="mt-10 grid grid-cols-2 gap-8 border-t border-slate-200 pt-8">
          <div className="text-center">
            <p className="text-sm text-slate-400 mb-10">Authorized Signature</p>
            <div className="border-t border-slate-300 pt-2">
              <p className="text-xs text-slate-500">{company?.name_en ?? 'Almaimoun Construction Est.'}</p>
            </div>
          </div>
          <div className="text-center">
            <p className="text-sm text-slate-400 mb-10">Supplier Signature</p>
            <div className="border-t border-slate-300 pt-2">
              <p className="text-xs text-slate-500">{lpo.supplier_name}</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-slate-100 text-center">
          <p className="text-slate-400 text-xs">{company?.name_en ?? 'Almaimoun Construction Est.'} — {company?.address ?? ''}</p>
        </div>
      </div>
    </div>
  )
}
