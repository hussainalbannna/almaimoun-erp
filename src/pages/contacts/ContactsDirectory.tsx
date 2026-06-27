import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Phone, Mail, MapPin, Edit, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Customer, Supplier } from '../../types'
import Button from '../../components/ui/Button'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import toast from 'react-hot-toast'

type ContactType = 'client' | 'supplier' | 'engineer' | 'subcontractor' | 'other'

interface Contact {
  id: string
  name: string
  name_en?: string
  type: ContactType
  company_name?: string
  phone?: string
  email?: string
  address?: string
  notes?: string
  source: 'customer' | 'supplier'
}

const TYPE_LABELS: Record<ContactType, string> = {
  client: 'عميل', supplier: 'مورد', engineer: 'مهندس', subcontractor: 'مقاول فرعي', other: 'أخرى'
}
const TYPE_COLORS: Record<ContactType, { bg: string; text: string; dot: string }> = {
  client: { bg: 'bg-blue-100', text: 'text-blue-700', dot: '#2563eb' },
  supplier: { bg: 'bg-amber-100', text: 'text-amber-700', dot: '#c4925a' },
  engineer: { bg: 'bg-green-100', text: 'text-green-700', dot: '#16a34a' },
  subcontractor: { bg: 'bg-purple-100', text: 'text-purple-700', dot: '#7c3aed' },
  other: { bg: 'bg-slate-100', text: 'text-slate-600', dot: '#64748b' },
}

const FILTER_TYPES: Array<ContactType | 'all'> = ['all', 'client', 'supplier', 'engineer', 'subcontractor']
const FILTER_LABELS: Record<string, string> = { all: 'جميع الأنواع', ...TYPE_LABELS }

function getInitials(name: string): string {
  return name.trim().split(' ').slice(0, 2).map(w => w[0] ?? '').join('')
}

export default function ContactsDirectory() {
  const navigate = useNavigate()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<ContactType | 'all'>('all')
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; source: 'customer' | 'supplier' } | null>(null)

  const load = async () => {
    setLoading(true)
    const [cRes, sRes] = await Promise.all([
      supabase.from('customers').select('*').order('name'),
      supabase.from('suppliers').select('*').order('name'),
    ])
    const customers = ((cRes.data ?? []) as Customer[]).map(c => ({
      id: c.id, name: c.name, name_en: c.company_name || undefined,
      type: 'client' as ContactType,
      company_name: c.company_name || undefined,
      phone: c.phone || undefined, email: c.email || undefined,
      address: c.city ? `${c.address ? c.address + '، ' : ''}${c.city}` : c.address || undefined,
      notes: c.notes || undefined, source: 'customer' as const,
    }))
    const suppliers = ((sRes.data ?? []) as Supplier[]).map(s => ({
      id: s.id, name: s.name, name_en: s.company_name || undefined,
      type: 'supplier' as ContactType,
      company_name: s.company_name || undefined,
      phone: s.phone || undefined, email: s.email || undefined,
      address: s.city ? `${s.address ? s.address + '، ' : ''}${s.city}` : s.address || undefined,
      notes: s.notes || undefined, source: 'supplier' as const,
    }))
    setContacts([...customers, ...suppliers])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleDelete = async () => {
    if (!deleteTarget) return
    if (deleteTarget.source === 'customer') {
      await supabase.from('customers').delete().eq('id', deleteTarget.id)
    } else {
      await supabase.from('suppliers').delete().eq('id', deleteTarget.id)
    }
    toast.success('تم الحذف')
    setDeleteTarget(null)
    load()
  }

  const filtered = contacts.filter(c => {
    const matchType = typeFilter === 'all' || c.type === typeFilter
    const q = search.toLowerCase()
    const matchSearch = !q || c.name.toLowerCase().includes(q) ||
      c.company_name?.toLowerCase().includes(q) ||
      c.phone?.includes(q) || c.email?.toLowerCase().includes(q)
    return matchType && matchSearch
  })

  const typeCounts = contacts.reduce<Record<string, number>>((acc, c) => {
    acc[c.type] = (acc[c.type] || 0) + 1
    return acc
  }, {})

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">جهات الاتصال</h1>
          <p className="text-slate-500 text-sm mt-0.5">{contacts.length} جهة اتصال</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => navigate('/customers/new')}>إضافة عميل</Button>
          <Button icon={<Plus size={16} />} onClick={() => navigate('/suppliers/new')}>إضافة مورد</Button>
        </div>
      </div>

      {/* Type counts */}
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

      {/* Search */}
      <div className="relative mb-6 max-w-sm">
        <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="ابحث بالاسم أو الشركة أو الهاتف..."
          className="w-full pr-9 pl-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30" />
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-400">جاري التحميل...</div>
      ) : filtered.length === 0 ? (
        <div className="p-12 text-center text-slate-400">لا توجد جهات اتصال</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(c => {
            const colors = TYPE_COLORS[c.type]
            const initials = getInitials(c.name)
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
                      {c.name_en && c.name_en !== c.name && (
                        <div className="text-xs text-slate-400">{c.name_en}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => navigate(c.source === 'customer' ? `/customers/${c.id}/edit` : `/suppliers/${c.id}/edit`)}
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

                <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium mb-3 ${colors.bg} ${colors.text}`}>
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: colors.dot }} />
                  {TYPE_LABELS[c.type]}
                </span>

                <div className="space-y-1.5">
                  {c.phone && (
                    <a href={`tel:${c.phone}`} className="flex items-center gap-2 text-xs text-slate-600 hover:text-amber-600 transition-colors">
                      <Phone size={12} className="text-slate-400 shrink-0" /> {c.phone}
                    </a>
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

      <ConfirmDialog
        open={!!deleteTarget}
        title="حذف جهة الاتصال"
        message="هل أنت متأكد من حذف هذه الجهة؟"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
