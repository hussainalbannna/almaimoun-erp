ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS anthropic_api_key TEXT DEFAULT '';

CREATE TABLE IF NOT EXISTS subcontractors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  specialty TEXT NOT NULL DEFAULT 'other',
  phone TEXT DEFAULT '', whatsapp TEXT DEFAULT '', cr_number TEXT DEFAULT '',
  bank_iban TEXT DEFAULT '', notes TEXT DEFAULT '',
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subcontractor_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subcontractor_id UUID NOT NULL REFERENCES subcontractors(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  project_name TEXT DEFAULT '', scope TEXT DEFAULT '',
  agreed_amount NUMERIC(14,3) DEFAULT 0, paid_amount NUMERIC(14,3) DEFAULT 0,
  start_date DATE, end_date DATE, status TEXT DEFAULT 'active',
  notes TEXT DEFAULT '', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subcontractor_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES subcontractor_assignments(id) ON DELETE CASCADE,
  subcontractor_id UUID NOT NULL REFERENCES subcontractors(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  amount NUMERIC(14,3) NOT NULL DEFAULT 0, payment_date DATE DEFAULT CURRENT_DATE,
  payment_method TEXT DEFAULT 'cash', check_due_date DATE, check_number TEXT DEFAULT '',
  notes TEXT DEFAULT '', created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, asset_type TEXT DEFAULT 'equipment',
  plate_number TEXT DEFAULT '', serial_number TEXT DEFAULT '',
  purchase_date DATE, purchase_value NUMERIC(14,3) DEFAULT 0,
  current_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  current_location TEXT DEFAULT '', status TEXT DEFAULT 'available',
  insurance_expiry DATE, registration_expiry DATE, notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS asset_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  project_name TEXT DEFAULT '', from_location TEXT DEFAULT '', to_location TEXT DEFAULT '',
  movement_date DATE DEFAULT CURRENT_DATE, moved_by TEXT DEFAULT '', notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS client_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  material_name TEXT NOT NULL, quantity NUMERIC(10,3) DEFAULT 0, unit TEXT DEFAULT 'piece',
  received BOOLEAN DEFAULT false, received_date DATE, notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE projects ADD COLUMN IF NOT EXISTS estimated_cost NUMERIC(14,3) DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS handover_date DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS warranty_months INTEGER DEFAULT 12;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS soil_type TEXT DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS building_permit TEXT DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS consultant_name TEXT DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS consultant_phone TEXT DEFAULT '';
ALTER TABLE lpos ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS weather TEXT DEFAULT '';
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS workers_count INTEGER DEFAULT 0;
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS converted_to_lpo BOOLEAN DEFAULT false;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS passport_number TEXT DEFAULT '';
ALTER TABLE workers ADD COLUMN IF NOT EXISTS passport_expiry DATE;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS emergency_name TEXT DEFAULT '';
ALTER TABLE workers ADD COLUMN IF NOT EXISTS emergency_phone TEXT DEFAULT '';
ALTER TABLE workers ADD COLUMN IF NOT EXISTS emergency_relation TEXT DEFAULT '';
ALTER TABLE workers ADD COLUMN IF NOT EXISTS annual_leave_days INTEGER DEFAULT 30;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS used_leave_days NUMERIC(5,1) DEFAULT 0;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS end_of_service_date DATE;

ALTER TABLE subcontractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE subcontractor_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE subcontractor_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_subs" ON subcontractors FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_sub_assign" ON subcontractor_assignments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_sub_pay" ON subcontractor_payments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_assets" ON assets FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_asset_mov" ON asset_movements FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_client_mat" ON client_materials FOR ALL TO authenticated USING (true) WITH CHECK (true);