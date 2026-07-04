import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Phone, Mail, MapPin, Edit, Trash2, MessageCircle, Copy, FileText } from 'lucide-react'
import { supabase, safeSelect } from '../../lib/supabase'
import type { Customer, Supplier } from '../../types'
import { openWhatsApp } from '../../lib/utils'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import toast from 'react-hot-toast'

type ContactType = 'client' | 'supplier' | 'engineer' | 'consultant' | 'subcontractor' | 'government' | 'other'
type Source = 'customer' | 'supplier' | 'contact'

interface Contact {
  id: string
  name: string
  name_en?: string
  type: ContactType
  company_name?: string
  phone?: string
  email?: string
  address?: string
  specialty?: string
  notes?: string
  source: Source
}

const TYPE_LABELS: Record<ContactType, string> = {
  client: 'عميل', supplier: 'مورد', engineer: 'مهندس', consultant: 'استشاري', subcontractor: 'مقاول', government: 'جهة حكومية', other: 'أخرى'
}
const TYPE_COLORS: Record<ContactType, { bg: string; text: string; dot: string }> = {
  client: { bg: 'bg-blue-100', text: 'text-blue-700', dot: '#2563eb' },
  supplier: { bg: 'bg-amber-100', text: 'text-amber-700', dot: '#c4925a' },
  engineer: { bg: 'bg-green-100', text: 'text-green-700', dot: '#16a34a' },
  consultant: { bg: 'bg-teal-100', text: 'text-teal-700', dot: '#0d9488' },
  subcontractor: { bg: 'bg-purple-100', text: 'text-purple-700', dot: '#7c3aed' },
  government: { bg: 'bg-rose-100', text: 'text-rose-700', dot: '#e11d48' },
  other: { bg: 'bg-slate-100', text: 'text-slate-600', dot: '#64748b' },
}

// أنواع جهات الاتصال اليدوية (غير العملاء والموردين)
const MANUAL_TYPES = [
  { value: 'engineer', label: 'مهندس' },
  { value: 'consultant', label: 'استشاري' },
  { value: 'subcontractor', label: 'مقاول' },
  { value: 'government', label: 'جهة حكومية' },
  { value: 'other', label: 'أخرى' },
]

const FILTER_TYPES: Array<ContactType | 'all'> = ['all', 'client', 'supplier', 'engineer', 'consultant', 'subcontractor', 'government']
const FILTER_LABELS: Record<string, string> = { all: 'الكل', ...TYPE_LABELS }

function getInitials(name: string): string {
  return name.trim().split(' ').slice(0, 2).map(w => w[0] ?? '').join('')
}

const emptyForm = () => ({ name: '', company_name: '', contact_type: 'engineer', phone: '', email: '', address: '', specialty: '', notes: '' })

// نوع صف جدول جهات الاتصال اليدوية
interface ContactRow {
  id: string
  name: string
  contact_type?: string
  company_name?: string
  phone?: string
  email?: string
  address?: string
  specialty?: string
  notes?: string
}

// جلب ودمج جهات الاتصال من العملاء والموردين والجهات اليدوية (مصدر React Query)
async function fetchContacts(): Promise<Contact[]> {
  const [cRes, sRes, mRes] = await Promise.all([
    safeSelect<Customer>('customers', '*', q => q.order('name')),
    safeSelect<Supplier>('suppliers', '*', q => q.order('name')),
    safeSelect<ContactRow>('contacts', '*', q => q.order('name')),
  ])
  const customers: Contact[] = cRes.map(c => ({
    id: c.id, name: c.name, name_en: c.company_name || undefined,
    type: 'client' as ContactType, company_name: c.company_name || undefined,
    phone: c.phone || undefined, email: c.email || undefined,
    address: c.city ? `${c.address ? c.address + '، ' : ''}${c.city}` : c.address || undefined,
    notes: c.notes || undefined, source: 'customer' as const,
  }))
  const suppliers: Contact[] = sRes.map(s => ({
    id: s.id, name: s.name, name_en: s.company_name || undefined,
    type: 'supplier' as ContactType, company_name: s.company_name || undefined,
    phone: s.phone || undefined, email: s.email || undefined,
    address: s.city ? `${s.address ? s.address + '، ' : ''}${s.city}` : s.address || undefined,
    notes: s.notes || undefined, source: 'supplier' as const,
  }))
  const manual: Contact[] = mRes.map(m => ({
    id: m.id, name: m.name,
    type: (m.contact_type as ContactType) || 'other',
    company_name: m.company_name || undefined,
    phone: m.phone || undefined, email: m.email || undefined,
    address: m.address || undefined,
    specialty: m.specialty || undefined,
    notes: m.notes || undefined, source: 'contact' as const,
  }))
  return [...customers, ...suppliers, ...manual]
}

export default function ContactsDirectory() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<ContactType | 'all'>('all')
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; source: Source } | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)

  const { data: contacts = [], isLoading } = useQuery({ queryKey: ['contacts-directory'], queryFn: fetchContacts })
  // أي تعديل يدوي أو حذف يُبطِل الكاش فيُعاد الدمج تلقائياً
  const reload = () => queryClient.invalidateQueries({ queryKey: ['contacts-directory'] })

  const openNew = () => { setEditId(null); setForm(emptyForm()); setModalOpen(true) }
  const openEditManual = (c: Contact) => {
    setEditId(c.id)
    setForm({
      name: c.name, company_name: c.company_name ?? '', contact_type: c.type,
      phone: c.phone ?? '', email: c.email ?? '', address: c.address ?? '',
      specialty: c.specialty ?? '', notes: c.notes ?? '',
    })
    setModalOpen(true)
  }

  const saveManual = async () => {
    if (!form.name.trim()) { toast.error('أدخل الاسم'); return }
    setSaving(true)
    const payload = { ...form, updated_at: new Date().toISOString() }
    try {
      if (editId) {
        const { error } = await supabase.from('contacts').update(payload).eq('id', editId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('contacts').insert(payload)
        if (error) throw error
      }
      toast.success(editId ? 'تم التحديث' : 'تمت الإضافة')
      setModalOpen(false)
      reload()
    } catch (e) {
      toast.error('خطأ: ' + ((e as Error)?.message ?? ''))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    const table = deleteTarget.source === 'customer' ? 'customers' : deleteTarget.source === 'supplier' ? 'suppliers' : 'contacts'
    await supabase.from(table).delete().eq('id', deleteTarget.id)
    toast.success('تم الحذف')
    setDeleteTarget(null)
    reload()
  }

  const copyPhone = (phone: string) => {
    navigator.clipboard?.writeText(phone).then(
      () => toast.success('تم نسخ الرقم'),
      () => toast.error('تعذّر النسخ')
    )
  }

  const filtered = useMemo(() => contacts.filter(c => {
    const matchType = typeFilter === 'all' || c.type === typeFilter
    const q = search.toLowerCase()
    const matchSearch = !q || c.name.toLowerCase().includes(q) ||
      c.company_name?.toLowerCase().includes(q) ||
      c.phone?.includes(q) || c.email?.toLowerCase().includes(q)
    return matchType && matchSearch
  }), [contacts, typeFilter, search])

  const typeCounts = useMemo(() => contacts.reduce<Record<string, number>>((acc, c) => {
    acc[c.type] = (acc[c.type] || 0) + 1
    return acc
  }, {}), [contacts])

  return (
    <div className="p-6" dir="rtl">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">جهات الاتصال</h1>
          <p className="text-slate-500 text-sm mt-0.5">{contacts.length} جهة اتصال</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="secondary" onClick={() => navigate('/customers/new')}>+ عميل</Button>
          <Button variant="secondary" onClick={() => navigate('/suppliers/new')}>+ مورد</Button>
          <Button icon={<Plus size={16} />} onClick={openNew}>مهندس / استشاري / مقاول</Button>
        </div>
      </div>

      {/* عدّادات الأنواع */}
      <div className="flex flex-wrap gap-2 mb-4">
        {FILTER_TYPES.map(t => {
          const count = t === 'all' ? contacts.length : (typeCounts[t] ?? 0)
          const isActive = typeFilter === t
          return (
            <button key={t} onClick={() => setTypeFilter(t)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                isActive ? 'bg-slate-800 text-white border-slate-800' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
              }`}>
              {t !== 'all' && <div className="w-2 h-2 rounded-full" style={{ background: TYPE_COLORS[t as ContactType].dot }} />}
              {FILTER_LABELS[t]} ({count})
            </button>
          )
        })}
      </div>

      {/* البحث */}
      <div className="relative mb-6 max-w-sm">
        <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="ابحث بالاسم أو الشركة أو الهاتف..."
          className="w-full pr-9 pl-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30" />
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-slate-400">جاري التحميل...</div>
      ) : filtered.length === 0 ? (
        <div className="p-12 text-center text-slate-400">لا توجد جهات اتصال</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(c => {
            const colors = TYPE_COLORS[c.type]
            const initials = getInitials(c.name)
            const editPath = c.source === 'customer' ? `/customers/${c.id}/edit` : c.source === 'supplier' ? `/suppliers/${c.id}/edit` : null
            return (
              <div key={`${c.source}-${c.id}`}
                className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow group">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                      style={{ background: colors.dot }}>
                      {initials}
                    </div>
                    <div>
                      <div className="font-semibold text-slate-800 text-sm">{c.name}</div>
                      {c.company_name && c.company_name !== c.name && (
                        <div className="text-xs text-slate-400">{c.company_name}</div>
                      )}
                      {c.specialty && <div className="text-xs text-slate-400">{c.specialty}</div>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => editPath ? navigate(editPath) : openEditManual(c)}
                      className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-blue-50">
                      <Edit size={14} />
                    </button>
                    <button
                      onClick={() => setDeleteTarget({ id: c.id, source: c.source })}
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-3">
                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${colors.bg} ${colors.text}`}>
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: colors.dot }} />
                    {TYPE_LABELS[c.type]}
                  </span>
                  {/* زر كشف الحساب للعملاء */}
                  {c.source === 'customer' && (
                    <button onClick={() => navigate(`/customers/${c.id}/statement`)}
                      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 hover:bg-amber-100 hover:text-amber-700 transition-colors">
                      <FileText size={11} /> كشف حساب
                    </button>
                  )}
                </div>

                <div className="space-y-1.5">
                  {c.phone && (
                    <div className="flex items-center gap-2 text-xs">
                      <Phone size={12} className="text-slate-400 shrink-0" />
                      <a href={`tel:${c.phone}`} className="text-slate-600 hover:text-amber-600 transition-colors flex-1">{c.phone}</a>
                      <button onClick={() => copyPhone(c.phone!)} title="نسخ" className="text-slate-300 hover:text-slate-500"><Copy size={12} /></button>
                      <button onClick={() => openWhatsApp(c.phone!, `مرحباً ${c.name}`)} title="واتساب" className="text-green-500 hover:text-green-700"><MessageCircle size={13} /></button>
                    </div>
                  )}
                  {c.email && (
                    <a href={`mailto:${c.email}`} className="flex items-center gap-2 text-xs text-slate-600 hover:text-amber-600 transition-colors truncate">
                      <Mail size={12} className="text-slate-400 shrink-0" /> {c.email}
                    </a>
                  )}
                  {c.address && (
                    <div className="flex items-start gap-2 text-xs text-slate-500">
                      <MapPin size={12} className="text-slate-400 shrink-0 mt-0.5" /> {c.address}
                    </div>
                  )}
                  {c.notes && (
                    <div className="text-xs text-slate-400 mt-2 border-t border-slate-50 pt-2">{c.notes}</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* نافذة إضافة/تعديل جهة يدوية */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'تعديل جهة الاتصال' : 'جهة اتصال جديدة'} size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="الاسم *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            <Select label="النوع" value={form.contact_type} onChange={e => setForm(f => ({ ...f, contact_type: e.target.value }))} options={MANUAL_TYPES} />
            <Input label="الشركة / الجهة" value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} />
            <Input label="التخصص" value={form.specialty} onChange={e => setForm(f => ({ ...f, specialty: e.target.value }))} placeholder="مثال: مهندس مدني" />
            <Input label="الهاتف" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} dir="ltr" />
            <Input label="البريد الإلكتروني" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} dir="ltr" />
          </div>
          <Input label="العنوان" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
          <Textarea label="ملاحظات" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
          <div className="flex gap-2 pt-1">
            <Button loading={saving} onClick={saveManual}>{editId ? 'حفظ' : 'إضافة'}</Button>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>إلغاء</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="حذف جهة الاتصال"
        message="هل أنت متأكد من حذف هذه الجهة؟"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        danger
      />
    </div>
  )
}
