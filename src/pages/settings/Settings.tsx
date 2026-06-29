import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { CompanySettings } from '../../types'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Textarea from '../../components/ui/Textarea'
import toast from 'react-hot-toast'
import { Building2, Mail, Phone, CreditCard, Settings2, Hash, Sparkles, Loader2, CheckCircle, ExternalLink } from 'lucide-react'
import { loadApiKey, saveApiKey, readDocumentText } from '../../lib/ai'

type Tab = 'company' | 'banking' | 'numbering' | 'ai'

const GOLD = '#c4925a'

export default function Settings() {
  const [tab, setTab] = useState<Tab>('company')
  const [form, setForm] = useState<Partial<CompanySettings>>({
    name: 'مؤسسة الميمون للمقاولات',
    name_en: 'AlMaimoun Construction',
    address: 'Building 1165, T Road 2933, Jerdab 729, Kingdom of Bahrain',
    phone: '0097337055576',
    email: 'Info@almaimoun-construction.com',
    whatsapp: '',
    tax_number: '220023171000002',
    commercial_reg: '120637-2',
    bank_name: '',
    bank_account: '',
    bank_iban: '',
    currency: 'د.ب',
    invoice_prefix: 'INV',
    lpo_prefix: 'LPO',
    smtp_from: 'info@almaimoun-construction.com',
  })
  const [settingsId, setSettingsId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // الذكاء الاصطناعي
  const [aiKey, setAiKey] = useState('')
  const [testing, setTesting] = useState(false)
  const [keyValid, setKeyValid] = useState<boolean | null>(null)
  const [savingKey, setSavingKey] = useState(false)

  useEffect(() => {
    loadApiKey().then(k => setAiKey(k)).catch(() => {})
  }, [])

  useEffect(() => {
    supabase.from('company_settings').select('*').single().then(({ data }) => {
      if (data) {
        // نستبعد مفتاح الذكاء الاصطناعي من نموذج الإعدادات العامة حتى لا يُكتب فوقه أبداً.
        // المفتاح يُدار حصرياً من تبويب الذكاء الاصطناعي عبر حقل aiKey.
        const { anthropic_api_key: _omit, ...rest } = data as CompanySettings & { anthropic_api_key?: string }
        void _omit
        setForm(rest as Partial<CompanySettings>)
        setSettingsId((data as CompanySettings).id)
      }
    })
  }, [])

  const set = (field: keyof CompanySettings) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }))

  const handleSave = async () => {
    setLoading(true)
    // مهم: لا نلمس مفتاح الذكاء الاصطناعي هنا أبداً — يُحفظ فقط من تبويب الذكاء الاصطناعي.
    // نحذفه من الحمولة حتى لا نكتب فوقه بقيمة قديمة بالخطأ.
    const cleanForm = { ...form } as Partial<CompanySettings> & { anthropic_api_key?: string }
    delete cleanForm.anthropic_api_key
    const payload = { ...cleanForm, updated_at: new Date().toISOString() }
    const { error } = settingsId
      ? await supabase.from('company_settings').update(payload).eq('id', settingsId)
      : await supabase.from('company_settings').insert(payload)
    setLoading(false)
    if (error) { toast.error('حدث خطأ أثناء الحفظ'); return }
    toast.success('تم حفظ الإعدادات')
  }

  // ─── حفظ واختبار مفتاح الذكاء الاصطناعي (في السحابة) ─────────────────
  const handleSaveKey = async () => {
    setSavingKey(true)
    const ok = await saveApiKey(aiKey)
    setSavingKey(false)
    setKeyValid(null)
    if (!ok) { toast.error('تعذّر حفظ المفتاح في قاعدة البيانات'); return }
    toast.success(aiKey.trim() ? 'تم حفظ المفتاح — يعمل الآن على كل أجهزتك' : 'تم مسح المفتاح')
  }

  const handleTestKey = async () => {
    if (!aiKey.trim()) { toast.error('أدخل المفتاح أولاً'); return }
    setTesting(true)
    setKeyValid(null)
    toast.loading('جاري حفظ واختبار المفتاح...', { id: 'test' })
    try {
      await saveApiKey(aiKey) // حفظ في السحابة قبل الاختبار
      // صورة صغيرة لاختبار الاتصال
      const canvas = document.createElement('canvas')
      canvas.width = 60; canvas.height = 20
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 60, 20)
      ctx.fillStyle = '#000'; ctx.font = '14px sans-serif'; ctx.fillText('123', 5, 15)
      const blob = await new Promise<Blob>(res => canvas.toBlob(b => res(b!), 'image/jpeg'))
      const file = new File([blob], 'test.jpg', { type: 'image/jpeg' })
      await readDocumentText(file, 'ما الرقم المكتوب في الصورة؟ أجب برقم واحد فقط.')
      setKeyValid(true)
      toast.success('المفتاح يعمل بنجاح ✓', { id: 'test' })
    } catch (e) {
      setKeyValid(false)
      toast.error((e as Error)?.message ?? 'فشل الاختبار', { id: 'test' })
    } finally {
      setTesting(false)
    }
  }

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'company', label: 'معلومات الشركة', icon: Building2 },
    { key: 'banking', label: 'البنك والدفع', icon: CreditCard },
    { key: 'numbering', label: 'الترقيم والعملة', icon: Hash },
    { key: 'ai', label: 'الذكاء الاصطناعي', icon: Sparkles },
  ]

  return (
    <div className="max-w-2xl mx-auto space-y-5 p-6" dir="rtl">
      {/* التبويبات */}
      <div className="flex gap-1 bg-white rounded-xl border border-slate-200 p-1">
        {tabs.map(t => {
          const active = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="flex-1 flex items-center justify-center gap-2 h-9 rounded-lg text-sm font-medium transition-colors"
              style={active ? { background: GOLD, color: '#fff' } : { color: '#475569' }}
            >
              <t.icon size={16} />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          )
        })}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        {tab === 'company' && (
          <>
            <h3 className="font-semibold text-slate-800 flex items-center gap-2"><Building2 size={18} style={{ color: GOLD }} /> معلومات الشركة</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="اسم الشركة (عربي)" value={form.name ?? ''} onChange={set('name')} />
              <Input label="اسم الشركة (إنجليزي)" value={form.name_en ?? ''} onChange={set('name_en')} dir="ltr" />
              <Input label="رقم الضريبة (VAT)" value={form.tax_number ?? ''} onChange={set('tax_number')} dir="ltr" />
              <Input label="السجل التجاري (CR)" value={form.commercial_reg ?? ''} onChange={set('commercial_reg')} dir="ltr" />
            </div>
            <Textarea label="العنوان" value={form.address ?? ''} onChange={set('address')} rows={2} />
            <h4 className="font-medium text-slate-700 mt-4 flex items-center gap-2"><Phone size={16} style={{ color: GOLD }} /> معلومات التواصل</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="الهاتف" value={form.phone ?? ''} onChange={set('phone')} placeholder="0097337055576" dir="ltr" />
              <Input label="البريد الإلكتروني" type="email" value={form.email ?? ''} onChange={set('email')} dir="ltr" />
              <Input label="واتساب الشركة" value={form.whatsapp ?? ''} onChange={set('whatsapp')} placeholder="973XXXXXXXX" dir="ltr" />
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
              <h4 className="font-medium text-blue-800 text-sm mb-2 flex items-center gap-2"><Mail size={15} /> إعدادات البريد الإلكتروني (SMTP)</h4>
              <p className="text-xs text-blue-600 mb-3">
                البريد يُرسَل عبر خادم الشركة الرسمي (info@almaimoun-construction.com). كلمة المرور محفوظة بأمان كسرّ في الخادم (Supabase Secret) ولا تظهر هنا. تأكد من ضبط أسرار الخادم: SMTP_HOST و SMTP_PORT و SMTP_USER و SMTP_PASSWORD.
              </p>
              <Input label="البريد المُرسِل" value={form.smtp_from ?? ''} onChange={set('smtp_from')} placeholder="info@almaimoun-construction.com" dir="ltr" />
            </div>
          </>
        )}

        {tab === 'banking' && (
          <>
            <h3 className="font-semibold text-slate-800 flex items-center gap-2"><CreditCard size={18} style={{ color: GOLD }} /> معلومات البنك والدفع</h3>
            <p className="text-sm text-slate-500">تظهر هذه المعلومات في أسفل الفواتير</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="اسم البنك" value={form.bank_name ?? ''} onChange={set('bank_name')} placeholder="بنك البحرين الوطني (NBB)" />
              <Input label="رقم الحساب" value={form.bank_account ?? ''} onChange={set('bank_account')} dir="ltr" />
              <div className="sm:col-span-2">
                <Input label="رقم IBAN" value={form.bank_iban ?? ''} onChange={set('bank_iban')} placeholder="BH00 NBOB 0000 0000 0000 00" dir="ltr" />
              </div>
            </div>
          </>
        )}

        {tab === 'numbering' && (
          <>
            <h3 className="font-semibold text-slate-800 flex items-center gap-2"><Settings2 size={18} style={{ color: GOLD }} /> الترقيم والعملة</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="بادئة أرقام الفواتير" value={form.invoice_prefix ?? 'INV'} onChange={set('invoice_prefix')} hint="مثال: INV-2026-0001" />
              <Input label="بادئة أوامر الشراء" value={form.lpo_prefix ?? 'LPO'} onChange={set('lpo_prefix')} hint="مثال: LPO-2026-0001" />
              <Input label="العملة" value={form.currency ?? 'د.ب'} onChange={set('currency')} hint="مثال: د.ب" />
            </div>
            <div className="bg-slate-50 rounded-lg p-4 mt-2">
              <p className="text-sm text-slate-600">
                مثال على ترقيم الفاتورة: <span className="font-mono font-medium" style={{ color: GOLD }}>{form.invoice_prefix ?? 'INV'}-2026-0001</span>
              </p>
              <p className="text-sm text-slate-600 mt-1">
                مثال على ترقيم أمر الشراء: <span className="font-mono font-medium" style={{ color: GOLD }}>{form.lpo_prefix ?? 'LPO'}-2026-0001</span>
              </p>
            </div>
          </>
        )}

        {tab === 'ai' && (
          <>
            <h3 className="font-semibold text-slate-800 flex items-center gap-2"><Sparkles size={18} style={{ color: GOLD }} /> الذكاء الاصطناعي</h3>
            <p className="text-sm text-slate-500">
              يُستخدم لقراءة العقود والهويات والمستندات تلقائياً (حتى الممسوحة ضوئياً) وملء الحقول. المفتاح يُحفظ في قاعدة البيانات بشكل آمن ويعمل تلقائياً على جميع أجهزتك (كمبيوتر وجوال).
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">مفتاح Anthropic API</label>
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    value={aiKey}
                    onChange={e => { setAiKey(e.target.value); setKeyValid(null) }}
                    placeholder="sk-ant-..."
                    className="flex-1 h-10 px-3 rounded-lg border border-slate-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                    dir="ltr"
                  />
                  {keyValid === true && <CheckCircle size={20} className="text-green-600 shrink-0" />}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={handleSaveKey} loading={savingKey}>حفظ المفتاح</Button>
                <Button variant="outline" onClick={handleTestKey} disabled={testing}
                  icon={testing ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}>
                  {testing ? 'جاري الاختبار...' : 'اختبار المفتاح'}
                </Button>
              </div>

              {keyValid === true && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800 flex items-center gap-2">
                  <CheckCircle size={16} /> المفتاح يعمل بنجاح. كل ميزات الذكاء الاصطناعي مفعّلة الآن.
                </div>
              )}
              {keyValid === false && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
                  المفتاح لم يعمل. تأكد من نسخه كاملاً ومن وجود رصيد في حسابك.
                </div>
              )}
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mt-2 space-y-2">
              <h4 className="font-medium text-amber-900 text-sm">كيف تحصل على المفتاح؟</h4>
              <ol className="text-xs text-amber-800 space-y-1.5 list-decimal pr-4">
                <li>ادخل على <span className="font-mono">console.anthropic.com</span> وسجّل حساب</li>
                <li>اشحن رصيد بسيط (يبدأ من 5 دولار) من Billing</li>
                <li>من API Keys اضغط Create Key وانسخ المفتاح (يبدأ بـ sk-ant)</li>
                <li>الصقه هنا واضغط حفظ ثم اختبار</li>
              </ol>
              <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 hover:text-amber-900 mt-1">
                فتح صفحة المفاتيح <ExternalLink size={12} />
              </a>
            </div>

            <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-500">
              التكلفة تقريبية جداً: قراءة عقد أو هوية واحدة تكلف أقل من 1 سنت. الرصيد يكفي لمئات المستندات.
            </div>
          </>
        )}

        <div className="pt-2">
          {tab !== 'ai' && <Button onClick={handleSave} loading={loading}>حفظ الإعدادات</Button>}
        </div>
      </div>
    </div>
  )
}
