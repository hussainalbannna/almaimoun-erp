import { useEffect, useState } from 'react'
import { Plus, Trash2, Search, Upload, ExternalLink } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { AccountsPayableEntry, Project } from '../../types'
import { formatCurrency, formatDate } from '../../lib/utils'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import toast from 'react-hot-toast'

const CATEGORIES = [
  { value: 'materials', label: 'مواد بناء' },
  { value: 'labor', label: 'عمالة' },
  { value: 'equipment', label: 'معدات' },
  { value: 'transport', label: 'نقل' },
  { value: 'other', label: 'أخرى' },
]

const EXPENSE_TYPES = [
  { value: 'general', label: 'مصروف عام' },
  { value: 'fuel', label: 'بنزين / وقود' },
  { value: 'uniforms', label: 'يونيفورم / ملابس' },
  { value: 'water_ice', label: 'مياه / ثلج' },
  { value: 'lmra_fees', label: 'رسوم LMRA' },
  { value: 'social_insurance', label: 'تأمين اجتماعي' },
  { value: 'insurance', label: 'تأمين / بوليصة' },
  { value: 'government', label: 'رسوم حكومية' },
  { value: 'tools', label: 'أدوات ومعدات صغيرة' },
]

const PAYMENT_METHODS = [
  { value: 'cash', label: 'نقداً' },
  { value: 'bank_transfer', label: 'تحويل بنكي' },
  { value: 'cheque', label: 'شيك' },
  { value: 'benefit', label: 'بنفت' },
  { value: 'card', label: 'بطاقة' },
]

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(CATEGORIES.map(c => [c.value, c.label]))
const EXPENSE_LABEL: Record<string, string> = Object.fromEntries(EXPENSE_TYPES.map(e => [e.value, e.label]))
const PAYMENT_LABEL: Record<string, string> = Object.fromEntries(PAYMENT_METHODS.map(m => [m.value, m.label]))

const GOVT_EXPENSE_TYPES = ['lmra_fees', 'social_insurance', 'insurance', 'government']

export default function CashBook() {
  const [entries, setEntries] = useState<AccountsPayableEntry[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [uploadingReceipt, setUploadingReceipt] = useState(false)

  const [form, setForm] = useState<Partial<AccountsPayableEntry>>({
    entry_date: new Date().toISOString().slice(0, 10),
    description: '', vendor_name: '', category: 'materials',
    expense_type: 'general', amount: 0, payment_method: 'cash',
    project_id: null, receipt_url: '', notes: '',
  })

  const load = async () => {
    setLoading(true)
    const [eRes, pRes] = await Promise.all([
      supabase.from('accounts_payable').select('*').order('entry_date', { ascending: false }),
      supabase.from('projects').select('id, project_name').order('project_name'),
    ])
    setEntries((eRes.data ?? []) as AccountsPayableEntry[])
    setProjects((pRes.data ?? []) as Project[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingReceipt(true)
    const ext = file.name.split('.').pop()
    const path = `receipts/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('documents').upload(path, file)
    if (error) { toast.error('فشل رفع الإيصال'); setUploadingReceipt(false); return }
    const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)
    setForm(p => ({ ...p, receipt_url: urlData.publicUrl }))
    setUploadingReceipt(false)
    toast.success('تم رفع الإيصال')
  }

  const handleSave = async () => {
    if (!form.description) { toast.error('يجب إدخال الوصف'); return }
    if (!form.amount || Number(form.amount) <= 0) { toast.error('يجب إدخال المبلغ'); return }
    setSaving(true)
    const { error } = await supabase.from('accounts_payable').insert({ ...form })
    if (error) { toast.error('حدث خطأ'); setSaving(false); return }
    toast.success('تم تسجيل القيد')
    setForm({
      entry_date: new Date().toISOString().slice(0, 10),
      description: '', vendor_name: '', category: 'materials',
      expense_type: 'general', amount: 0, payment_method: 'cash',
      project_id: null, receipt_url: '', notes: '',
    })
    setShowForm(false)
    load()
  }

  const handleDelete = async () => {
    if (!deleteId) return
    await supabase.from('accounts_payable').delete().eq('id', deleteId)
    toast.success('تم الحذف')
    setDeleteId(null)
    load()
  }

  const filtered = entries.filter(e => {
    const matchSearch = e.description.toLowerCase().includes(search.toLowerCase()) ||
      (e.vendor_name?.toLowerCase() ?? '').includes(search.toLowerCase())
    const matchType = filterType === 'all' || filterType === 'govt'
      ? filterType === 'govt' ? GOVT_EXPENSE_TYPES.includes(e.expense_type ?? 'general') : true
      : (e.expense_type ?? 'general') === filterType
    return matchSearch && matchType
  })

  const total = filtered.reduce((s, e) => s + Number(e.amount), 0)
  const projectOptions = [
    { value: '', label: 'بدون مشروع' },
    ...projects.map(p => ({ value: p.id, label: p.project_name }))
  ]

  const FILTER_TABS = [
    { value: 'all', label: 'الكل' },
    { value: 'govt', label: 'حكومية' },
    ...EXPENSE_TYPES.filter(t => !['general'].includes(t.value)).map(t => ({ value: t.value, label: t.label })),
  ]

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">دفتر المدفوعات</h1>
          <p className="text-slate-500 text-sm mt-0.5">تسجيل يدوي للمصروفات النقدية</p>
        </div>
        <Button icon={<Plus size={16} />} onClick={() => setShowForm(true)}>إضافة قيد</Button>
      </div>

      {/* New Entry Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-amber-200 p-5 mb-6 shadow-sm">
          <h2 className="font-semibold text-slate-700 mb-4">قيد مصروف جديد</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input label="التاريخ" type="date" value={form.entry_date ?? ''} onChange={e => setForm(p => ({ ...p, entry_date: e.target.value }))} />
            <Input label="اسم المورد / الجهة" value={form.vendor_name ?? ''} onChange={e => setForm(p => ({ ...p, vendor_name: e.target.value }))} />
            <Select label="التصنيف" value={form.category ?? 'other'} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} options={CATEGORIES} />
            <Select label="نوع المصروف" value={form.expense_type ?? 'general'} onChange={e => setForm(p => ({ ...p, expense_type: e.target.value }))} options={EXPENSE_TYPES} />
            <Input label="وصف المصروف *" value={form.description ?? ''} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
            <Input label="المبلغ (د.ب) *" type="number" value={String(form.amount ?? 0)} onChange={e => setForm(p => ({ ...p, amount: parseFloat(e.target.value) || 0 }))} />
            <Select label="طريقة الدفع" value={form.payment_method ?? 'cash'} onChange={e => setForm(p => ({ ...p, payment_method: e.target.value }))} options={PAYMENT_METHODS} />
            <Select label="المشروع" value={form.project_id ?? ''} onChange={e => setForm(p => ({ ...p, project_id: e.target.value || null }))} options={projectOptions} />
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">إيصال / صورة فاتورة</label>
              {form.receipt_url ? (
                <div className="flex items-center gap-2">
                  <a href={form.receipt_url} target="_blank" rel="noreferrer" className="text-sm text-primary-600 hover:underline flex items-center gap-1">
                    <ExternalLink size={13} /> عرض الإيصال
                  </a>
                  <button onClick={() => setForm(p => ({ ...p, receipt_url: '' }))} className="text-xs text-red-500 hover:underline">إزالة</button>
                </div>
              ) : (
                <label className={`flex items-center gap-2 cursor-pointer border border-dashed border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-500 hover:border-primary-400 hover:text-primary-600 ${uploadingReceipt ? 'opacity-60 pointer-events-none' : ''}`}>
                  <Upload size={14} />
                  {uploadingReceipt ? 'جاري الرفع...' : 'رفع إيصال'}
                  <input type="file" accept="image/*,application/pdf" className="hidden" onChange={handleReceiptUpload} />
                </label>
              )}
            </div>
          </div>
          <div className="mt-3">
            <Textarea label="ملاحظات" value={form.notes ?? ''} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} />
          </div>
          <div className="flex gap-3 mt-4">
            <Button loading={saving} onClick={handleSave}>حفظ القيد</Button>
            <Button variant="secondary" onClick={() => setShowForm(false)}>إلغاء</Button>
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 col-span-1">
          <div className="text-xs text-slate-500 mb-1">إجمالي المصروفات</div>
          <div className="text-xl font-bold text-red-600">{formatCurrency(total)}</div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-4">
        {FILTER_TABS.slice(0, 6).map(tab => (
          <button key={tab.value} onClick={() => setFilterType(tab.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${filterType === tab.value ? 'bg-amber-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-amber-400'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center">
          <div className="relative max-w-xs">
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث..."
              className="w-full pr-9 pl-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30" />
          </div>
          <span className="text-sm text-slate-500">{filtered.length} قيد</span>
        </div>
        {loading ? (
          <div className="p-8 text-center text-slate-400">جاري التحميل...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">التاريخ</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">الوصف</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">المورد</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">النوع</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">المبلغ</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">الدفع</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">إيصال</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">لا توجد قيود</td></tr>
                ) : filtered.map(e => (
                  <tr key={e.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 text-slate-500">{formatDate(e.entry_date)}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{e.description}</td>
                    <td className="px-4 py-3 text-slate-500">{e.vendor_name || '-'}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        {EXPENSE_LABEL[e.expense_type ?? 'general'] ?? CATEGORY_LABEL[e.category] ?? e.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-bold text-red-600">{formatCurrency(Number(e.amount))}</td>
                    <td className="px-4 py-3 text-slate-500">{PAYMENT_LABEL[e.payment_method] ?? e.payment_method}</td>
                    <td className="px-4 py-3">
                      {e.receipt_url ? (
                        <a href={e.receipt_url} target="_blank" rel="noreferrer" className="text-primary-600 hover:text-primary-800">
                          <ExternalLink size={14} />
                        </a>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => setDeleteId(e.id)} className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50">
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              {filtered.length > 0 && (
                <tfoot className="bg-slate-50 border-t border-slate-200">
                  <tr>
                    <td className="px-4 py-2.5 font-bold text-slate-700" colSpan={4}>الإجمالي</td>
                    <td className="px-4 py-2.5 font-bold text-red-600">{formatCurrency(total)}</td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog open={!!deleteId} title="حذف القيد" message="هل أنت متأكد من حذف هذا القيد؟" onConfirm={handleDelete} onCancel={() => setDeleteId(null)} />
    </div>
  )
}
