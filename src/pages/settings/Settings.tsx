import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { CompanySettings } from '../../types'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Textarea from '../../components/ui/Textarea'
import toast from 'react-hot-toast'
import { Building2, Mail, Phone, MessageCircle, CreditCard, Settings2, Hash } from 'lucide-react'

type Tab = 'company' | 'banking' | 'numbering'

export default function Settings() {
  const [tab, setTab] = useState<Tab>('company')
  const [form, setForm] = useState<Partial<CompanySettings>>({
    name: 'مؤسسة الميمون للمقاولات',
    name_en: 'Almaimoun Construction Est.',
    address: 'Building 1165 T Road 2933, Jerdab 729, Bahrain',
    phone: '0097337055576',
    email: 'Info@almaimoun-construction.com',
    whatsapp: '',
    tax_number: '220023171000002',
    commercial_reg: '',
    bank_name: '',
    bank_account: '',
    bank_iban: '',
    currency: 'د.ب',
    invoice_prefix: '',
    lpo_prefix: '',
    resend_api_key: '',
    smtp_from: '',
  })
  const [settingsId, setSettingsId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.from('company_settings').select('*').single().then(({ data }) => {
      if (data) {
        setForm(data as CompanySettings)
        setSettingsId((data as CompanySettings).id)
      }
    })
  }, [])

  const set = (field: keyof CompanySettings) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }))

  const handleSave = async () => {
    setLoading(true)
    const payload = { ...form, updated_at: new Date().toISOString() }
    const { error } = settingsId
      ? await supabase.from('company_settings').update(payload).eq('id', settingsId)
      : await supabase.from('company_settings').insert(payload)
    setLoading(false)
    if (error) { toast.error('حدث خطأ أثناء الحفظ'); return }
    toast.success('تم حفظ الإعدادات')
  }

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'company', label: 'معلومات الشركة', icon: Building2 },
    { key: 'banking', label: 'البنك والدفع', icon: CreditCard },
    { key: 'numbering', label: 'الترقيم والعملة', icon: Hash },
  ]

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-xl border border-slate-200 p-1">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-2 h-9 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key
                ? 'bg-primary-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <t.icon size={16} />
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        {tab === 'company' && (
          <>
            <h3 className="font-semibold text-slate-800 flex items-center gap-2"><Building2 size={18} className="text-primary-600" /> معلومات الشركة</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="اسم الشركة (عربي)" value={form.name ?? ''} onChange={set('name')} />
              <Input label="اسم الشركة (إنجليزي)" value={form.name_en ?? ''} onChange={set('name_en')} />
              <Input label="رقم الضريبة (TRN)" value={form.tax_number ?? ''} onChange={set('tax_number')} />
              <Input label="السجل التجاري" value={form.commercial_reg ?? ''} onChange={set('commercial_reg')} />
            </div>
            <Textarea label="العنوان" value={form.address ?? ''} onChange={set('address')} rows={2} />
            <h4 className="font-medium text-slate-700 mt-4 flex items-center gap-2"><Phone size={16} className="text-primary-600" /> معلومات التواصل</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="الهاتف" value={form.phone ?? ''} onChange={set('phone')} placeholder="+971 X XXXX XXXX" />
              <Input label="البريد الإلكتروني" type="email" value={form.email ?? ''} onChange={set('email')} />
              <Input label="واتساب الشركة" value={form.whatsapp ?? ''} onChange={set('whatsapp')} placeholder="+971 5X XXXX XXXX" />
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
              <h4 className="font-medium text-blue-800 text-sm mb-2 flex items-center gap-2"><Mail size={15} /> إعدادات البريد الإلكتروني</h4>
              <p className="text-xs text-blue-600 mb-3">لإرسال البريد عبر النظام، أضف مفتاح Resend API. بدونه، سيتم استخدام عميل البريد المحلي.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input label="مفتاح Resend API" value={form.resend_api_key ?? ''} onChange={set('resend_api_key')} type="password" placeholder="re_..." />
                <Input label="البريد المُرسِل" value={form.smtp_from ?? ''} onChange={set('smtp_from')} placeholder="noreply@yourcompany.com" />
              </div>
            </div>
          </>
        )}

        {tab === 'banking' && (
          <>
            <h3 className="font-semibold text-slate-800 flex items-center gap-2"><CreditCard size={18} className="text-primary-600" /> معلومات البنك والدفع</h3>
            <p className="text-sm text-slate-500">تظهر هذه المعلومات في أسفل الفواتير</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="اسم البنك" value={form.bank_name ?? ''} onChange={set('bank_name')} placeholder="بنك الإمارات دبي الوطني" />
              <Input label="رقم الحساب" value={form.bank_account ?? ''} onChange={set('bank_account')} />
              <div className="sm:col-span-2">
                <Input label="رقم IBAN" value={form.bank_iban ?? ''} onChange={set('bank_iban')} placeholder="AE00 0000 0000 0000 0000 000" />
              </div>
            </div>
          </>
        )}

        {tab === 'numbering' && (
          <>
            <h3 className="font-semibold text-slate-800 flex items-center gap-2"><Settings2 size={18} className="text-primary-600" /> الترقيم والعملة</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="بادئة أرقام الفواتير" value={form.invoice_prefix ?? 'INV'} onChange={set('invoice_prefix')} hint="مثال: INV-2024-0001" />
              <Input label="بادئة أوامر الشراء" value={form.lpo_prefix ?? 'LPO'} onChange={set('lpo_prefix')} hint="مثال: LPO-2024-0001" />
              <Input label="العملة" value={form.currency ?? 'درهم'} onChange={set('currency')} hint="مثال: درهم، ريال، دولار" />
            </div>
            <div className="bg-slate-50 rounded-lg p-4 mt-2">
              <p className="text-sm text-slate-600">
                مثال على ترقيم الفاتورة: <span className="font-mono font-medium text-primary-700">{form.invoice_prefix ?? 'INV'}-2024-0001</span>
              </p>
              <p className="text-sm text-slate-600 mt-1">
                مثال على ترقيم أمر الشراء: <span className="font-mono font-medium text-primary-700">{form.lpo_prefix ?? 'LPO'}-2024-0001</span>
              </p>
            </div>
          </>
        )}

        <div className="pt-2">
          <Button onClick={handleSave} loading={loading}>حفظ الإعدادات</Button>
        </div>
      </div>
    </div>
  )
}
