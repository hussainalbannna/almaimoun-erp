// ═══════════════════════════════════════════
//  إعدادات الشركة
// ═══════════════════════════════════════════
export interface CompanySettings {
  id: string
  name: string
  name_en: string
  logo_url: string
  address: string
  phone: string
  email: string
  whatsapp: string
  tax_number: string
  commercial_reg: string
  bank_name: string
  bank_account: string
  bank_iban: string
  currency: string
  invoice_prefix: string
  lpo_prefix: string
  resend_api_key: string
  smtp_from: string
  created_at: string
  updated_at: string
}

// ═══════════════════════════════════════════
//  الموردون والعملاء
// ═══════════════════════════════════════════
export interface Supplier {
  id: string
  name: string
  company_name: string
  email: string
  phone: string
  whatsapp: string
  address: string
  city: string
  country: string
  tax_number: string
  commercial_reg: string
  payment_terms: string
  notes: string
  created_at: string
  updated_at: string
}

export interface Customer {
  id: string
  name: string
  company_name: string
  email: string
  phone: string
  whatsapp: string
  address: string
  city: string
  country: string
  tax_number: string
  commercial_reg: string
  payment_terms: string
  notes: string
  created_at: string
  updated_at: string
}

// ═══════════════════════════════════════════
//  الفواتير
// ═══════════════════════════════════════════
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'

export interface InvoiceItem {
  id?: string
  invoice_id?: string
  description: string
  quantity: number
  unit_price: number
  total: number
  sort_order: number
}

export interface Invoice {
  id: string
  invoice_number: string
  customer_id: string | null
  customer_name: string
  customer_email: string
  customer_address: string
  customer_tax_number: string
  ship_to: string
  project_id: string | null
  milestone_id: string | null
  issue_date: string
  due_date: string | null
  status: InvoiceStatus
  subtotal: number
  tax_rate: number
  tax_amount: number
  discount: number
  total: number
  notes: string
  payment_terms: string
  created_at: string
  updated_at: string
  items?: InvoiceItem[]
}

// ═══════════════════════════════════════════
//  أوامر الشراء LPO
// ═══════════════════════════════════════════
export type LPOStatus = 'draft' | 'sent' | 'approved' | 'received' | 'cancelled'

export interface LPOItem {
  id?: string
  lpo_id?: string
  description: string
  quantity: number
  unit: string
  unit_price: number
  total: number
  sort_order: number
}

export interface LPO {
  id: string
  lpo_number: string
  supplier_id: string | null
  supplier_name: string
  supplier_email: string
  supplier_address: string
  supplier_tax_number: string
  project_id: string | null
  issue_date: string
  delivery_date: string | null
  status: LPOStatus
  subtotal: number
  tax_rate: number
  tax_amount: number
  discount: number
  total: number
  notes: string
  payment_terms: string
  payment_type: string
  check_due_date: string | null
  payment_due_date: string | null
  delivery_address: string
  created_at: string
  updated_at: string
  items?: LPOItem[]
}

export interface LPODelivery {
  id: string
  lpo_id: string
  delivery_number: number
  delivery_date: string
  notes: string
  delivery_note_url: string
  created_at: string
  items?: LPODeliveryItem[]
}

export interface LPODeliveryItem {
  id: string
  delivery_id: string
  lpo_item_id: string
  description: string
  quantity_delivered: number
}

// ═══════════════════════════════════════════
//  المستندات والذكاء الاصطناعي
// ═══════════════════════════════════════════
export interface Document {
  id: string
  name: string
  doc_type: string
  file_url: string
  file_type: string
  extracted_text: string
  extracted_data: Record<string, unknown>
  related_id: string | null
  related_type: string
  notes: string
  created_at: string
}

export interface ExtractedDocumentData {
  name?: string
  company_name?: string
  email?: string
  phone?: string
  whatsapp?: string
  address?: string
  city?: string
  tax_number?: string
  commercial_reg?: string
  invoice_number?: string
  lpo_number?: string
  date?: string
  due_date?: string
  amount?: number
  items?: Array<{ description: string; quantity: number; unit_price: number; total: number }>
  notes?: string
  payment_terms?: string
  bank_name?: string
  bank_account?: string
  bank_iban?: string
  contract_value?: number
  start_date?: string
  end_date?: string
  project_name?: string
  location?: string
  client_name?: string
  client_phone?: string
  client_cpr?: string
  milestones?: Array<{ name: string; amount: number; percentage: number }>
  // حقول العامل (لقراءة الهوية/الجواز تلقائياً)
  cpr?: string
  cpr_expiry?: string
  passport_number?: string
  passport_expiry?: string
  nationality?: string
  iban?: string
}

// ═══════════════════════════════════════════
//  المشاريع
// ═══════════════════════════════════════════
export type ProjectStatus = 'active' | 'completed' | 'on_hold' | 'cancelled'

export interface Project {
  id: string
  project_number: string
  client_id: string | null
  client_name: string
  client_phone: string
  client_cpr: string
  project_name: string
  location: string
  contract_value: number
  estimated_cost: number
  start_date: string | null
  end_date: string | null
  handover_date: string | null
  warranty_months: number
  status: ProjectStatus
  soil_type: string
  building_permit: string
  consultant_name: string
  consultant_phone: string
  notes: string
  created_at: string
  updated_at: string
  milestones?: ProjectMilestone[]
}

export type MilestoneStatus = 'pending' | 'in_progress' | 'completed' | 'invoiced' | 'paid'

export interface ProjectMilestone {
  id: string
  project_id: string
  name: string
  description: string
  percentage: number
  amount: number
  status: MilestoneStatus
  invoice_id: string | null
  sort_order: number
  created_at: string
}

// تكلفة عمالة تاريخية/يدوية لمشروع قديم — تفصيلية (عامل+أيام+أجر) أو إجمالية (مبلغ واحد)
export type LaborEntryType = 'detailed' | 'lump'

export interface ProjectLaborEntry {
  id: string
  project_id: string
  worker_id: string | null      // عامل «سابق» عند الربط، null عند الإدخال الإجمالي
  worker_name: string
  worker_type: WorkerType | null
  entry_type: LaborEntryType
  days: number | null
  rate: number | null
  amount: number                // التكلفة النهائية (مصدر الحقيقة)
  cost_date: string             // تاريخ التحميل في التقارير العامة (YYYY-MM-DD)
  period_label: string
  notes: string
  created_at: string
}

// ═══════════════════════════════════════════
//  الإيصالات
// ═══════════════════════════════════════════
export interface Receipt {
  id: string
  receipt_number: string
  customer_id: string | null
  customer_name: string
  invoice_id: string | null
  invoice_number: string
  invoice_date: string | null
  due_date: string | null
  original_amount: number
  balance: number
  amount: number
  payment_method: string
  reference_no: string
  receipt_date: string
  memo: string
  created_at: string
  updated_at: string
}

// ═══════════════════════════════════════════
//  العمال
// ═══════════════════════════════════════════
export type WorkerType = 'company' | 'lmra'
export type PayType = 'monthly' | 'daily'

export interface Worker {
  id: string
  name: string
  name_en: string
  cpr: string
  cpr_expiry: string | null
  passport_number: string
  passport_expiry: string | null
  nationality: string
  profession: string
  phone: string
  iban: string
  worker_type: WorkerType
  pay_type: PayType
  branch: string
  basic_salary: number
  social_allowance: number
  actual_salary: number
  daily_rate: number
  annual_leave_days: number
  used_leave_days: number
  join_date: string | null
  end_of_service_date: string | null
  visa_expiry: string | null
  status: 'active' | 'inactive' | 'former'
  emergency_name: string
  emergency_phone: string
  emergency_relation: string
  id_photo_url: string
  notes: string
  created_at: string
  updated_at: string
  advances?: WorkerAdvance[]
}

export interface WorkerAdvance {
  id: string
  worker_id: string
  amount: number
  advance_date: string
  notes: string
  deducted: boolean
  created_at: string
}

export type AttendanceStatus = 'present' | 'absent' | 'sick' | 'travel' | 'vacation' | 'leave'

export interface WorkerAttendance {
  id: string
  worker_id: string
  attendance_date: string
  status: AttendanceStatus
  project_id: string | null
  project_name: string
  source: 'manual' | 'auto_log'
  log_id: string | null
  notes: string
  created_at: string
}

export interface WorkerLoan {
  id: string
  worker_id: string
  loan_amount: number
  monthly_installment: number
  remaining_balance: number
  loan_date: string
  status: 'active' | 'completed'
  notes: string
  created_at: string
}

export interface WorkerMedicalRecord {
  id: string
  worker_id: string
  hospital: string
  diagnosis: string
  treatment_cost: number
  visit_date: string
  notes: string
  created_at: string
}

export interface WorkerTravelRecord {
  id: string
  worker_id: string
  departure_date: string | null
  return_date: string | null
  departure_airport: string
  arrival_airport: string
  airline: string
  ticket_cost: number
  notes: string
  created_at: string
}

export type WorkerDocType = 'cpr_photo' | 'passport' | 'iban_cert' | 'contract'

export interface WorkerDocument {
  id: string
  worker_id: string
  doc_type: WorkerDocType
  file_data: string
  file_name: string
  uploaded_at: string
}

export type DisciplinaryType = 'request' | 'violation' | 'warning'

export interface WorkerDisciplinary {
  id: string
  worker_id: string
  record_type: DisciplinaryType
  title: string
  description: string
  record_date: string
  created_at: string
}

export type LeaveType = 'annual' | 'sick' | 'emergency' | 'unpaid' | 'hajj'

export interface LeaveRequest {
  id: string
  worker_id: string
  leave_type: LeaveType
  start_date: string
  end_date: string
  days: number
  status: 'pending' | 'approved' | 'rejected'
  notes: string
  created_at: string
}

// ═══════════════════════════════════════════
//  التقارير اليومية
// ═══════════════════════════════════════════
export interface DailyLog {
  id: string
  project_id: string
  log_date: string
  description: string
  material_requests: string
  inspector_meeting: boolean
  weather: string
  workers_count: number
  converted_to_lpo: boolean
  photos: string[]
  additional_notes: string
  // وقت العمل الاعتيادي (وردية + بداية/نهاية) — نصّي HH:MM
  shift_label: string
  work_start_time: string
  work_end_time: string
  // إجمالي الأوفرتايم المحسوب من جلسات الصب (لقطة) + سببه
  overtime_amount: number
  overtime_notes: string
  created_at: string
  updated_at: string
  workers?: Worker[]
}

// عمل إضافي / صب: عامل بساعات محددة — يُحسب أوفرتايم دون احتساب يوم إضافي
export interface DailyLogOvertime {
  id: string
  log_id: string
  worker_id: string | null
  worker_name: string
  task: string            // مثل «صب»
  start_time: string      // HH:MM
  end_time: string
  hours: number
  hourly_rate: number     // لقطة سعر الساعة (من الراتب الحقيقي)
  amount: number          // لقطة = hours × hourly_rate
  created_at: string
}

// ═══════════════════════════════════════════
//  أوامر التغيير
// ═══════════════════════════════════════════
export interface VariationOrder {
  id: string
  project_id: string
  vo_number: string
  description: string
  amount: number
  status: 'pending' | 'approved' | 'rejected'
  billable: boolean
  request_date: string
  notes: string
  created_at: string
}

// ═══════════════════════════════════════════
//  دفتر الصندوق
// ═══════════════════════════════════════════
export interface AccountsPayableEntry {
  id: string
  entry_date: string
  description: string
  vendor_name: string
  category: string
  amount: number
  payment_method: string
  project_id: string | null
  receipt_url: string
  expense_type: string
  notes: string
  created_at: string
}

// ═══════════════════════════════════════════
//  فواتير المشتريات
// ═══════════════════════════════════════════
export type PurchasePaymentMethod = 'cash' | 'bank_transfer' | 'deferred_cheque'

export interface PurchaseInvoice {
  id: string
  supplier_id: string | null
  supplier_name: string
  project_id: string | null
  project_name: string
  lpo_id: string | null
  lpo_number: string
  vendor_invoice_number: string
  amount: number
  payment_method: PurchasePaymentMethod
  check_due_date: string | null
  check_image_data: string
  invoice_copy_data: string
  payment_proof_data: string
  notes: string
  created_at: string
  updated_at: string
}

export interface PurchaseInvoiceDelivery {
  id?: string
  purchase_invoice_id?: string
  delivery_note_number: string
  delivery_image_data: string
  notes: string
  created_at?: string
}

// ═══════════════════════════════════════════
//  المقاولون من الباطن (جديد)
// ═══════════════════════════════════════════
export type SubcontractorSpecialty = 'excavation' | 'electrical' | 'plumbing' | 'finishing' | 'tiles' | 'other'

export interface Subcontractor {
  id: string
  name: string
  specialty: SubcontractorSpecialty
  phone: string
  whatsapp: string
  cr_number: string
  bank_iban: string
  notes: string
  status: 'active' | 'inactive'
  created_at: string
  updated_at: string
}

export interface SubcontractorAssignment {
  id: string
  subcontractor_id: string
  project_id: string | null
  project_name: string
  scope: string
  agreed_amount: number
  paid_amount: number
  start_date: string | null
  end_date: string | null
  status: 'active' | 'completed' | 'cancelled'
  notes: string
  created_at: string
  updated_at: string
}

export interface SubcontractorPayment {
  id: string
  assignment_id: string
  subcontractor_id: string
  project_id: string | null
  amount: number
  payment_date: string
  payment_method: 'cash' | 'bank_transfer' | 'cheque'
  check_due_date: string | null
  check_number: string
  notes: string
  created_at: string
}

// ═══════════════════════════════════════════
//  الأصول والمعدات (جديد)
// ═══════════════════════════════════════════
export type AssetType = 'vehicle' | 'equipment' | 'scaffolding' | 'tool' | 'other'

export interface Asset {
  id: string
  name: string
  asset_type: AssetType
  plate_number: string
  serial_number: string
  purchase_date: string | null
  purchase_value: number
  current_project_id: string | null
  current_location: string
  status: 'available' | 'in_use' | 'maintenance' | 'retired'
  insurance_expiry: string | null
  registration_expiry: string | null
  notes: string
  created_at: string
  updated_at: string
}

export interface AssetMovement {
  id: string
  asset_id: string
  project_id: string | null
  project_name: string
  from_location: string
  to_location: string
  movement_date: string
  moved_by: string
  notes: string
  created_at: string
}

// ═══════════════════════════════════════════
//  مواد العميل (جديد)
// ═══════════════════════════════════════════
export interface ClientMaterial {
  id: string
  project_id: string
  material_name: string
  quantity: number
  unit: string
  received: boolean
  received_date: string | null
  notes: string
  created_at: string
}

// ═══════════════════════════════════════════
//  قائمة ما قبل التسليم Punch List (جديد)
// ═══════════════════════════════════════════
export interface PunchListItem {
  id: string
  project_id: string
  description: string
  location: string
  raised_by: string
  raised_date: string
  due_date: string | null
  status: 'open' | 'in_progress' | 'resolved'
  resolved_date: string | null
  notes: string
  created_at: string
  updated_at: string
}