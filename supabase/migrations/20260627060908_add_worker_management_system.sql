
-- Add cpr_expiry to workers table
ALTER TABLE workers ADD COLUMN IF NOT EXISTS cpr_expiry DATE;

-- Worker Attendance / Movement Ledger (سجل التحركات والحضور)
CREATE TABLE IF NOT EXISTS worker_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'absent', 'sick', 'travel', 'vacation', 'leave')),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  project_name TEXT DEFAULT '',
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'auto_log')),
  log_id UUID REFERENCES daily_logs(id) ON DELETE SET NULL,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(worker_id, attendance_date)
);

-- Worker Installment Loans (القروض المقسطة)
CREATE TABLE IF NOT EXISTS worker_loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  loan_amount NUMERIC(10,3) NOT NULL DEFAULT 0,
  monthly_installment NUMERIC(10,3) NOT NULL DEFAULT 0,
  remaining_balance NUMERIC(10,3) NOT NULL DEFAULT 0,
  loan_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Worker Medical Records (الملف الطبي والعلاجي)
CREATE TABLE IF NOT EXISTS worker_medical_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  hospital TEXT DEFAULT '',
  diagnosis TEXT DEFAULT '',
  treatment_cost NUMERIC(10,3) DEFAULT 0,
  visit_date DATE DEFAULT CURRENT_DATE,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Worker Travel Records (سجل السفر والتذاكر)
CREATE TABLE IF NOT EXISTS worker_travel_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  departure_date DATE,
  return_date DATE,
  departure_airport TEXT DEFAULT '',
  arrival_airport TEXT DEFAULT '',
  airline TEXT DEFAULT '',
  ticket_cost NUMERIC(10,3) DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Worker Documents (أرشيف الوثائق والمرفقات)
CREATE TABLE IF NOT EXISTS worker_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('cpr_photo', 'passport', 'iban_cert', 'contract')),
  file_data TEXT DEFAULT '',
  file_name TEXT DEFAULT '',
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Worker Disciplinary Records (الدفتر الإداري والانضباطي)
CREATE TABLE IF NOT EXISTS worker_disciplinary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL CHECK (record_type IN ('request', 'violation', 'warning')),
  title TEXT NOT NULL DEFAULT '',
  description TEXT DEFAULT '',
  record_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS policies
ALTER TABLE worker_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_medical_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_travel_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_disciplinary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_attendance" ON worker_attendance FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_attendance_insert" ON worker_attendance FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_attendance_update" ON worker_attendance FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_attendance_delete" ON worker_attendance FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY "anon_loans_select" ON worker_loans FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_loans_insert" ON worker_loans FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_loans_update" ON worker_loans FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_loans_delete" ON worker_loans FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY "anon_medical_select" ON worker_medical_records FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_medical_insert" ON worker_medical_records FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_medical_update" ON worker_medical_records FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_medical_delete" ON worker_medical_records FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY "anon_travel_select" ON worker_travel_records FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_travel_insert" ON worker_travel_records FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_travel_update" ON worker_travel_records FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_travel_delete" ON worker_travel_records FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY "anon_docs_select" ON worker_documents FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_docs_insert" ON worker_documents FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_docs_update" ON worker_documents FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_docs_delete" ON worker_documents FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY "anon_disciplinary_select" ON worker_disciplinary FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_disciplinary_insert" ON worker_disciplinary FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_disciplinary_update" ON worker_disciplinary FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_disciplinary_delete" ON worker_disciplinary FOR DELETE TO anon, authenticated USING (true);
