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
}

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
  start_date: string | null
  end_date: string | null
  status: ProjectStatus
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

export type WorkerType = 'company' | 'lmra'
export type PayType = 'monthly' | 'daily'

export interface Worker {
  id: string
  name: string
  name_en: string
  cpr: string
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
  join_date: string | null
  visa_expiry: string | null
  cpr_expiry: string | null
  status: 'active' | 'inactive'
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

export interface DailyLog {
  id: string
  project_id: string
  log_date: string
  description: string
  material_requests: string
  inspector_meeting: boolean
  photos: string[]
  additional_notes: string
  created_at: string
  updated_at: string
  workers?: Worker[]
}

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
