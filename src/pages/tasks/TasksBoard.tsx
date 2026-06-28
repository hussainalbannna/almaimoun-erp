import { useEffect, useState } from 'react'
import { Plus, ListTodo, Clock, CheckCircle2, Trash2, Pencil, AlertTriangle, Calendar } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatDate } from '../../lib/utils'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import toast from 'react-hot-toast'

interface Task {
  id: string
  title: string
  description: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
  status: 'todo' | 'in_progress' | 'done'
  due_date: string | null
  project_id: string | null
  project_name: string
  assigned_to: string
  completed_at: string | null
  created_at: string
}

interface ProjectOpt { id: string; project_name: string }

const PRIORITY: Record<string, { label: string; color: string; bg: string }> = {
  low: { label: 'منخفضة', color: '#64748b', bg: '#f1f5f9' },
  medium: { label: 'متوسطة', color: '#0369a1', bg: '#e0f2fe' },
  high: { label: 'عالية', color: '#c2410c', bg: '#ffedd5' },
  urgent: { label: 'عاجلة', color: '#b91c1c', bg: '#fee2e2' },
}

const COLUMNS: { key: Task['status']; label: string; icon: typeof ListTodo; color: string }[] = [
  { key: 'todo', label: 'للعمل', icon: ListTodo, color: '#64748b' },
  { key: 'in_progress', label: 'قيد التنفيذ', icon: Clock, color: '#c4925a' },
  { key: 'done', label: 'منجز', icon: CheckCircle2, color: '#16a34a' },
]

const emptyForm = () => ({
  title: '', description: '', priority: 'medium' as Task['priority'],
  status: 'todo' as Task['status'], due_date: '', project_id: '', assigned_to: '',
})

export default function TasksBoard() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [projects, setProjects] = useState<ProjectOpt[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('tasks').select('*').order('created_at', { ascending: false })
    setTasks((data ?? []) as Task[])
    setLoading(false)
  }

  useEffect(() => {
    load()
    supabase.from('projects').select('id,project_name').order('created_at', { ascending: false }).then(({ data }) => {
      setProjects((data ?? []) as ProjectOpt[])
    })
  }, [])

  const openNew = () => { setEditId(null); setForm(emptyForm()); setModalOpen(true) }
  const openEdit = (t: Task) => {
    setEditId(t.id)
    setForm({
      title: t.title, description: t.description, priority: t.priority,
      status: t.status, due_date: t.due_date ?? '', project_id: t.project_id ?? '', assigned_to: t.assigned_to,
    })
    setModalOpen(true)
  }

  const save = async () => {
    if (!form.title.trim()) { toast.error('أدخل عنوان المهمة'); return }
    setSaving(true)
    const proj = projects.find(p => p.id === form.project_id)
    const payload = {
      title: form.title,
      description: form.description,
      priority: form.priority,
      status: form.status,
      due_date: form.due_date || null,
      project_id: form.project_id || null,
      project_name: proj?.project_name ?? '',
      assigned_to: form.assigned_to,
      completed_at: form.status === 'done' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }
    try {
      if (editId) {
        const { error } = await supabase.from('tasks').update(payload).eq('id', editId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('tasks').insert(payload)
        if (error) throw error
      }
      toast.success(editId ? 'تم تحديث المهمة' : 'تمت إضافة المهمة')
      setModalOpen(false)
      load()
    } catch (e) {
      toast.error('حدث خطأ: ' + ((e as Error)?.message ?? ''))
    } finally {
      setSaving(false)
    }
  }

  // نقل سريع بين الحالات
  const moveTask = async (t: Task, status: Task['status']) => {
    setTasks(prev => prev.map(x => x.id === t.id ? { ...x, status } : x))
    await supabase.from('tasks').update({
      status,
      completed_at: status === 'done' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq('id', t.id)
  }

  const handleDelete = async () => {
    if (!deleteId) return
    await supabase.from('tasks').delete().eq('id', deleteId)
    setDeleteId(null)
    toast.success('تم حذف المهمة')
    load()
  }

  const isOverdue = (t: Task) => t.status !== 'done' && t.due_date && new Date(t.due_date) < new Date(new Date().toDateString())

  // إحصائيات
  const overdueCount = tasks.filter(isOverdue).length
  const todoCount = tasks.filter(t => t.status === 'todo').length
  const doneCount = tasks.filter(t => t.status === 'done').length

  return (
    <div className="p-6" dir="rtl">
      {/* الترويسة */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #c4925a 0%, #7b4a2d 100%)' }}>
            <ListTodo size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">المهام والتذكيرات</h1>
            <p className="text-sm text-slate-500">{tasks.length} مهمة</p>
          </div>
        </div>
        <Button icon={<Plus size={16} />} onClick={openNew}>مهمة جديدة</Button>
      </div>

      {/* تنبيه المتأخرة */}
      {overdueCount > 0 && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-5 text-sm">
          <AlertTriangle size={18} />
          لديك {overdueCount} مهمة متأخرة عن موعدها
        </div>
      )}

      {/* لوحة الأعمدة */}
      {loading ? (
        <div className="text-center text-slate-400 py-12">جاري التحميل...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {COLUMNS.map(col => {
            const colTasks = tasks.filter(t => t.status === col.key)
            const ColIcon = col.icon
            return (
              <div key={col.key} className="bg-slate-50 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-3 px-1">
                  <ColIcon size={18} style={{ color: col.color }} />
                  <span className="font-semibold text-slate-700">{col.label}</span>
                  <span className="text-xs text-slate-400 bg-white rounded-full px-2 py-0.5">{colTasks.length}</span>
                </div>
                <div className="space-y-2">
                  {colTasks.length === 0 ? (
                    <div className="text-center text-xs text-slate-400 py-6">لا توجد مهام</div>
                  ) : colTasks.map(t => {
                    const overdue = isOverdue(t)
                    return (
                      <div key={t.id} className="bg-white rounded-lg border border-slate-200 p-3 group">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <span className="text-sm font-medium text-slate-800 leading-snug">{t.title}</span>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <button onClick={() => openEdit(t)} className="p-1 text-slate-400 hover:text-amber-600"><Pencil size={13} /></button>
                            <button onClick={() => setDeleteId(t.id)} className="p-1 text-slate-400 hover:text-red-600"><Trash2 size={13} /></button>
                          </div>
                        </div>
                        {t.description && <p className="text-xs text-slate-500 mb-2 line-clamp-2">{t.description}</p>}
                        <div className="flex items-center gap-1.5 flex-wrap mb-2">
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ color: PRIORITY[t.priority].color, background: PRIORITY[t.priority].bg }}>
                            {PRIORITY[t.priority].label}
                          </span>
                          {t.project_name && <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{t.project_name}</span>}
                        </div>
                        {(t.due_date || t.assigned_to) && (
                          <div className="flex items-center gap-3 text-xs mb-2">
                            {t.due_date && (
                              <span className={`flex items-center gap-1 ${overdue ? 'text-red-600 font-medium' : 'text-slate-500'}`}>
                                <Calendar size={12} /> {formatDate(t.due_date)}
                              </span>
                            )}
                            {t.assigned_to && <span className="text-slate-500">👤 {t.assigned_to}</span>}
                          </div>
                        )}
                        {/* أزرار النقل */}
                        <div className="flex gap-1 pt-2 border-t border-slate-100">
                          {COLUMNS.filter(c => c.key !== t.status).map(c => (
                            <button key={c.key} onClick={() => moveTask(t, c.key)}
                              className="flex-1 text-xs py-1 rounded-md hover:bg-slate-100 text-slate-500 transition-colors">
                              {c.key === 'todo' ? '← للعمل' : c.key === 'in_progress' ? 'قيد التنفيذ' : 'تم ✓'}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* نافذة الإضافة/التعديل */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'تعديل المهمة' : 'مهمة جديدة'} size="md">
        <div className="space-y-4">
          <Input label="عنوان المهمة *" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="مثال: متابعة تسليم مواد فيلا سترة" />
          <Textarea label="التفاصيل" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} />
          <div className="grid grid-cols-2 gap-3">
            <Select label="الأولوية" value={form.priority}
              onChange={e => setForm(f => ({ ...f, priority: e.target.value as Task['priority'] }))}
              options={[
                { value: 'low', label: 'منخفضة' },
                { value: 'medium', label: 'متوسطة' },
                { value: 'high', label: 'عالية' },
                { value: 'urgent', label: 'عاجلة' },
              ]} />
            <Select label="الحالة" value={form.status}
              onChange={e => setForm(f => ({ ...f, status: e.target.value as Task['status'] }))}
              options={[
                { value: 'todo', label: 'للعمل' },
                { value: 'in_progress', label: 'قيد التنفيذ' },
                { value: 'done', label: 'منجز' },
              ]} />
            <Input label="تاريخ الاستحقاق" type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
            <Input label="مُسند إلى" value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))} placeholder="اسم الشخص" />
          </div>
          <Select label="المشروع (اختياري)" value={form.project_id}
            onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}
            placeholder="بدون مشروع"
            options={projects.map(p => ({ value: p.id, label: p.project_name }))} />
          <div className="flex gap-2 pt-2">
            <Button loading={saving} onClick={save}>{editId ? 'حفظ' : 'إضافة'}</Button>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>إلغاء</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        onCancel={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="حذف المهمة"
        message="هل أنت متأكد من حذف هذه المهمة؟"
        confirmLabel="حذف"
        danger
      />
    </div>
  )
}