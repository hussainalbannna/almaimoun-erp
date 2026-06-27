
-- Projects
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_number TEXT UNIQUE,
  client_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL DEFAULT '',
  client_phone TEXT DEFAULT '',
  client_cpr TEXT DEFAULT '',
  project_name TEXT NOT NULL DEFAULT '',
  location TEXT DEFAULT '',
  contract_value NUMERIC(14,3) DEFAULT 0,
  start_date DATE,
  end_date DATE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'on_hold', 'cancelled')),
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Project Milestones
CREATE TABLE IF NOT EXISTS project_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  description TEXT DEFAULT '',
  percentage NUMERIC(5,2) DEFAULT 0,
  amount NUMERIC(14,3) DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'invoiced', 'paid')),
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Receipts (payment receipts issued to clients)
CREATE TABLE IF NOT EXISTS receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number TEXT UNIQUE NOT NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL DEFAULT '',
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  invoice_number TEXT DEFAULT '',
  invoice_date DATE,
  due_date DATE,
  original_amount NUMERIC(14,3) DEFAULT 0,
  balance NUMERIC(14,3) DEFAULT 0,
  amount NUMERIC(14,3) DEFAULT 0,
  payment_method TEXT DEFAULT 'cash',
  reference_no TEXT DEFAULT '',
  receipt_date DATE NOT NULL DEFAULT CURRENT_DATE,
  memo TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Workers
CREATE TABLE IF NOT EXISTS workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_en TEXT DEFAULT '',
  cpr TEXT DEFAULT '',
  nationality TEXT DEFAULT 'بحريني',
  phone TEXT DEFAULT '',
  iban TEXT DEFAULT '',
  worker_type TEXT DEFAULT 'company' CHECK (worker_type IN ('company', 'lmra')),
  pay_type TEXT DEFAULT 'monthly' CHECK (pay_type IN ('monthly', 'daily')),
  branch TEXT DEFAULT '',
  basic_salary NUMERIC(10,3) DEFAULT 0,
  social_allowance NUMERIC(10,3) DEFAULT 0,
  actual_salary NUMERIC(10,3) DEFAULT 0,
  daily_rate NUMERIC(10,3) DEFAULT 0,
  join_date DATE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  id_photo_url TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Worker Advances (salary advances)
CREATE TABLE IF NOT EXISTS worker_advances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID REFERENCES workers(id) ON DELETE CASCADE,
  amount NUMERIC(10,3) DEFAULT 0,
  advance_date DATE DEFAULT CURRENT_DATE,
  notes TEXT DEFAULT '',
  deducted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Daily Site Logs
CREATE TABLE IF NOT EXISTS daily_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  log_date DATE DEFAULT CURRENT_DATE,
  description TEXT DEFAULT '',
  material_requests TEXT DEFAULT '',
  inspector_meeting BOOLEAN DEFAULT false,
  photos TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Daily Log Workers (which workers were on site that day)
CREATE TABLE IF NOT EXISTS daily_log_workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  log_id UUID REFERENCES daily_logs(id) ON DELETE CASCADE,
  worker_id UUID REFERENCES workers(id) ON DELETE CASCADE
);

-- Variation Orders
CREATE TABLE IF NOT EXISTS variation_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  vo_number TEXT DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  amount NUMERIC(14,3) DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  billable BOOLEAN DEFAULT true,
  request_date DATE DEFAULT CURRENT_DATE,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- LPO Deliveries (partial deliveries tracking)
CREATE TABLE IF NOT EXISTS lpo_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lpo_id UUID REFERENCES lpos(id) ON DELETE CASCADE,
  delivery_number INTEGER DEFAULT 1,
  delivery_date DATE DEFAULT CURRENT_DATE,
  notes TEXT DEFAULT '',
  delivery_note_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- LPO Delivery Items
CREATE TABLE IF NOT EXISTS lpo_delivery_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID REFERENCES lpo_deliveries(id) ON DELETE CASCADE,
  lpo_item_id UUID REFERENCES lpo_items(id) ON DELETE CASCADE,
  description TEXT DEFAULT '',
  quantity_delivered NUMERIC(10,2) DEFAULT 0
);

-- Accounts Payable / Cash Book
CREATE TABLE IF NOT EXISTS accounts_payable (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date DATE DEFAULT CURRENT_DATE,
  description TEXT NOT NULL DEFAULT '',
  vendor_name TEXT DEFAULT '',
  category TEXT DEFAULT 'other',
  amount NUMERIC(14,3) DEFAULT 0,
  payment_method TEXT DEFAULT 'cash',
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  receipt_url TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add project_id to lpos
ALTER TABLE lpos ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE lpos ADD COLUMN IF NOT EXISTS payment_type TEXT DEFAULT 'bank_transfer';

-- Add project_id to invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS milestone_id UUID REFERENCES project_milestones(id) ON DELETE SET NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS ship_to TEXT DEFAULT '';

-- Enable RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_log_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE variation_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE lpo_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE lpo_delivery_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts_payable ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "anon_projects" ON projects FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_milestones" ON project_milestones FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_receipts" ON receipts FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_workers" ON workers FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_advances" ON worker_advances FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_daily_logs" ON daily_logs FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_log_workers" ON daily_log_workers FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_vos" ON variation_orders FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_deliveries" ON lpo_deliveries FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_delivery_items" ON lpo_delivery_items FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_ap" ON accounts_payable FOR ALL TO anon USING (true) WITH CHECK (true);
