import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Phone, Wrench, ChevronLeft, CheckCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatCurrency, subcontractorSpecialtyLabel, subcontractorSpecialtyColor } from '../../lib/utils'
import Button from '../../components/ui/Button'

interface Subcontractor {
  id: string
  name: string
  specialty: string
  phone: string
  whatsapp: string
  cr_number: string
  notes: string
  status: string
  created_at: string
}

interface SubWithStats extends Subcontractor {
  totalAgreed: number
  totalPaid: number
  activeProjects: number
}

const SPECIALTY_OPTIONS = [
  { value: 'all', label: 'جميع التخصصات' },
  { value: 'excavation', label: 'حفر وترسية' },
  { value: 'electrical', label: 'كهرباء' },
  { value: 'plumbing', label: 'سباكة' },
  { value: 'finishing', label: 'تشطيبات' },
  { value: 'tiles', label: 'بلاط وسيراميك' },
  { value: 'other', label: 'أخرى' },
]

export default function SubcontractorList() {
  const navigate = useNavigate()
  const [subs, setSubs] = useState<SubWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [specialtyFilter, setSpecialtyFilter] = useState('all')

  const load = async () => {
    setLoading(true)
    const [subRes, assignRes, payRes] = await Promise.all([
      supabase.from('subcontractors').select('*').order('name'),
      supabase.from('subcontractor_assignments').select('subcontractor_id, agreed_amount, status'),
      supabase.from('subcontractor_payments').select('subcontractor_id, amount'),
    ])
    const subList = (subRes.data ?? []) as Subcontractor[]
    const assigns = (assignRes.data ?? []) as { subcontractor_id: string; agreed_amount: number; status: string }[]
    const payments = (payRes.data ?? []) as { subcontractor_id: string; amount: number }[]

    const withStats: SubWithStats[] = subList.map(s => ({
      ...s,
      totalAgreed: assigns.filter(a => a.subcontractor_id === s.id).reduce((sum, a) => sum + Number(a.agreed_amount), 0),
      totalPaid: payments.filter(p => p.subcontractor_id === s.id).reduce((sum, p) => sum + Number(p.amount), 0),
      activeProjects: assigns.filter(a => a.subcontractor_id === s.id && a.status === 'active').length,
    }))

    setSubs(withStats)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = subs.filter(s => {
    const matchSearch = !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.phone.includes(search)
    const matchSpec = specialtyFilter === 'all' || s.specialty === specialtyFilter
    return matchSearch && matchSpec
  })

  const totalRemaining = subs.reduce((sum, s) => sum + (s.totalAgreed - s.totalPaid), 0)
  const totalActive = subs.filter(s => s.activeProjects > 0).length

  return (
    <div className="p-6" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100">
            <ChevronLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">المقاولون من الباطن</h1>
            <p className="text-slate-500 text-sm mt-0.5">حفار · كهربائي · سباك · تشطيبات</p>
          </div>
        </div>
        <Button icon={<Plus size={16} />} onClick={() => navigate('/subcontractors/new')}>
          إضافة مقاول
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">إجمالي المتفق عليه</div>
          <div className="text-xl font-bold" style={{ color: '#7b4a2d' }}>
            {formatCurrency(subs.reduce((s, x) => s + x.totalAgreed, 0))}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">إجمالي المدفوع</div>
          <div className="text-xl font-bold text-green-700">
            {formatCurrency(subs.reduce((s, x) => s + x.totalPaid, 0))}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">المتبقي المستحق</div>
          <div className="text-xl font-bold text-red-600">{formatCurrency(totalRemaining)}</div>
          <div className="text-xs text-slate-400 mt-0.5">{totalActive} مقاول نشط</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-48">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو الهاتف..."
            className="w-full pr-9 pl-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
          />
        </div>
        <select
          value={specialtyFilter}
          onChange={e => setSpecialtyFilter(e.target.value)}
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
        >
          {SPECIALTY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-400">جاري التحميل...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Wrench size={48} className="mx-auto text-slate-200 mb-4" />
          <p className="text-slate-500 font-medium">لا يوجد مقاولون</p>
          <p className="text-slate-400 text-sm mt-1">أضف أول مقاول من الباطن</p>
          <Button className="mt-4" icon={<Plus size={16} />} onClick={() => navigate('/subcontractors/new')}>
            إضافة مقاول
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(sub => {
            const remaining = sub.totalAgreed - sub.totalPaid
            const paidPercent = sub.totalAgreed > 0 ? Math.round((sub.totalPaid / sub.totalAgreed) * 100) : 0
            return (
              <div
                key={sub.id}
                className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-sm transition-shadow cursor-pointer"
                onClick={() => navigate(`/subcontractors/${sub.id}`)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0"
                      style={{ background: 'linear-gradient(135deg, #c4925a 0%, #7b4a2d 100%)' }}
                    >
                      {sub.name.trim()[0]}
                    </div>
                    <div>
                      <div className="font-semibold text-slate-800">{sub.name}</div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${subcontractorSpecialtyColor[sub.specialty] ?? 'bg-slate-100 text-slate-600'}`}>
                        {subcontractorSpecialtyLabel[sub.specialty] ?? sub.specialty}
                      </span>
                      {sub.phone && (
                        <div className="flex items-center gap-1 mt-1.5 text-xs text-slate-500">
                          <Phone size={11} />
                          <span dir="ltr">{sub.phone}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-left shrink-0">
                    <div className="text-xs text-slate-400">المتبقي</div>
                    <div className={`font-bold ${remaining > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatCurrency(remaining)}
                    </div>
                    {sub.totalAgreed > 0 && (
                      <div className="mt-2">
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden w-32">
                          <div className="h-full bg-green-500 rounded-full" style={{ width: `${Math.min(paidPercent, 100)}%` }} />
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5 text-left">{paidPercent}% مدفوع</div>
                      </div>
                    )}
                  </div>
                </div>
                {sub.activeProjects > 0 && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-green-700">
                    <CheckCircle size={12} />
                    <span>نشط في {sub.activeProjects} مشروع</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}