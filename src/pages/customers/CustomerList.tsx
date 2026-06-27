import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, Pencil, Trash2, Phone, Mail, MessageCircle, Users } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { openWhatsApp } from '../../lib/utils'
import type { Customer } from '../../types'
import Button from '../../components/ui/Button'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import toast from 'react-hot-toast'

export default function CustomerList() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('customers').select('*').order('created_at', { ascending: false })
    setCustomers((data ?? []) as Customer[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = customers.filter(c =>
    c.name.includes(search) || c.company_name?.includes(search) || c.email?.includes(search)
  )

  const handleDelete = async () => {
    if (!deleteId) return
    const { error } = await supabase.from('customers').delete().eq('id', deleteId)
    if (error) { toast.error('حدث خطأ أثناء الحذف'); return }
    toast.success('تم حذف العميل')
    setDeleteId(null)
    load()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="بحث عن عميل..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-9 pr-9 pl-3 rounded-lg border border-slate-300 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none"
          />
        </div>
        <Link to="/customers/new">
          <Button icon={<Plus size={16} />}>عميل جديد</Button>
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin w-7 h-7 border-2 border-primary-600 border-t-transparent rounded-full" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 py-16 text-center">
          <Users size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500 text-sm">{search ? 'لا توجد نتائج للبحث' : 'لا يوجد عملاء بعد'}</p>
          {!search && (
            <Link to="/customers/new" className="mt-3 inline-block text-sm text-primary-600 hover:underline">
              أضف أول عميل
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(customer => (
            <div key={customer.id} className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-slate-800">{customer.name}</h3>
                  {customer.company_name && (
                    <p className="text-sm text-slate-500 mt-0.5">{customer.company_name}</p>
                  )}
                </div>
                <div className="flex gap-1">
                  <Link to={`/customers/${customer.id}/edit`} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-primary-600">
                    <Pencil size={15} />
                  </Link>
                  <button onClick={() => setDeleteId(customer.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-600">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              <div className="space-y-1.5 text-sm text-slate-600">
                {customer.email && (
                  <div className="flex items-center gap-2">
                    <Mail size={13} className="text-slate-400 shrink-0" />
                    <a href={`mailto:${customer.email}`} className="hover:text-primary-600 truncate">{customer.email}</a>
                  </div>
                )}
                {customer.phone && (
                  <div className="flex items-center gap-2">
                    <Phone size={13} className="text-slate-400 shrink-0" />
                    <span>{customer.phone}</span>
                  </div>
                )}
                {customer.whatsapp && (
                  <button
                    onClick={() => openWhatsApp(customer.whatsapp, `مرحباً ${customer.name}`)}
                    className="flex items-center gap-2 text-green-600 hover:text-green-700"
                  >
                    <MessageCircle size={13} className="shrink-0" />
                    <span>{customer.whatsapp}</span>
                  </button>
                )}
                {customer.city && <div className="text-xs text-slate-400">{customer.city}, {customer.country}</div>}
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100">
                <Link to={`/invoices/new?customer=${customer.id}`} className="text-xs text-primary-600 hover:underline">
                  + إنشاء فاتورة
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        title="حذف العميل"
        message="هل أنت متأكد من حذف هذا العميل؟ لا يمكن التراجع عن هذا الإجراء."
        confirmLabel="حذف"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
        danger
      />
    </div>
  )
}
