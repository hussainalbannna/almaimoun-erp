
-- Company settings
CREATE TABLE IF NOT EXISTS company_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'شركة الميمون',
  name_en TEXT DEFAULT 'Al-Maimoun Company',
  logo_url TEXT,
  address TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  whatsapp TEXT DEFAULT '',
  tax_number TEXT DEFAULT '',
  commercial_reg TEXT DEFAULT '',
  bank_name TEXT DEFAULT '',
  bank_account TEXT DEFAULT '',
  bank_iban TEXT DEFAULT '',
  currency TEXT DEFAULT 'درهم',
  invoice_prefix TEXT DEFAULT 'INV',
  lpo_prefix TEXT DEFAULT 'LPO',
  resend_api_key TEXT DEFAULT '',
  smtp_from TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default company settings if not exists
INSERT INTO company_settings (id, name, name_en)
VALUES (gen_random_uuid(), 'شركة الميمون', 'Al-Maimoun Company')
ON CONFLICT DO NOTHING;

-- Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  company_name TEXT DEFAULT '',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  whatsapp TEXT DEFAULT '',
  address TEXT DEFAULT '',
  city TEXT DEFAULT '',
  country TEXT DEFAULT 'الإمارات',
  tax_number TEXT DEFAULT '',
  commercial_reg TEXT DEFAULT '',
  payment_terms TEXT DEFAULT 'صافي 30 يوم',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Customers
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  company_name TEXT DEFAULT '',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  whatsapp TEXT DEFAULT '',
  address TEXT DEFAULT '',
  city TEXT DEFAULT '',
  country TEXT DEFAULT 'الإمارات',
  tax_number TEXT DEFAULT '',
  commercial_reg TEXT DEFAULT '',
  payment_terms TEXT DEFAULT 'صافي 30 يوم',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Invoices
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL UNIQUE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL DEFAULT '',
  customer_email TEXT DEFAULT '',
  customer_address TEXT DEFAULT '',
  customer_tax_number TEXT DEFAULT '',
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
  subtotal NUMERIC(12,2) DEFAULT 0,
  tax_rate NUMERIC(5,2) DEFAULT 5,
  tax_amount NUMERIC(12,2) DEFAULT 0,
  discount NUMERIC(12,2) DEFAULT 0,
  total NUMERIC(12,2) DEFAULT 0,
  notes TEXT DEFAULT '',
  payment_terms TEXT DEFAULT 'صافي 30 يوم',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Invoice items
CREATE TABLE IF NOT EXISTS invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL DEFAULT '',
  quantity NUMERIC(10,2) DEFAULT 1,
  unit_price NUMERIC(12,2) DEFAULT 0,
  total NUMERIC(12,2) DEFAULT 0,
  sort_order INTEGER DEFAULT 0
);

-- LPOs (Local Purchase Orders)
CREATE TABLE IF NOT EXISTS lpos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lpo_number TEXT NOT NULL UNIQUE,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT NOT NULL DEFAULT '',
  supplier_email TEXT DEFAULT '',
  supplier_address TEXT DEFAULT '',
  supplier_tax_number TEXT DEFAULT '',
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  delivery_date DATE,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'approved', 'received', 'cancelled')),
  subtotal NUMERIC(12,2) DEFAULT 0,
  tax_rate NUMERIC(5,2) DEFAULT 5,
  tax_amount NUMERIC(12,2) DEFAULT 0,
  discount NUMERIC(12,2) DEFAULT 0,
  total NUMERIC(12,2) DEFAULT 0,
  notes TEXT DEFAULT '',
  payment_terms TEXT DEFAULT 'صافي 30 يوم',
  delivery_address TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- LPO items
CREATE TABLE IF NOT EXISTS lpo_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lpo_id UUID REFERENCES lpos(id) ON DELETE CASCADE,
  description TEXT NOT NULL DEFAULT '',
  quantity NUMERIC(10,2) DEFAULT 1,
  unit TEXT DEFAULT 'قطعة',
  unit_price NUMERIC(12,2) DEFAULT 0,
  total NUMERIC(12,2) DEFAULT 0,
  sort_order INTEGER DEFAULT 0
);

-- Documents (uploaded files with extracted data)
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  doc_type TEXT DEFAULT 'other',
  file_url TEXT DEFAULT '',
  file_type TEXT DEFAULT '',
  extracted_text TEXT DEFAULT '',
  extracted_data JSONB DEFAULT '{}',
  related_id UUID,
  related_type TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on all tables
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE lpos ENABLE ROW LEVEL SECURITY;
ALTER TABLE lpo_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Public policies (internal company tool, no auth required)
CREATE POLICY "public_select_company" ON company_settings FOR SELECT TO anon USING (true);
CREATE POLICY "public_insert_company" ON company_settings FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "public_update_company" ON company_settings FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "public_delete_company" ON company_settings FOR DELETE TO anon USING (true);

CREATE POLICY "public_select_suppliers" ON suppliers FOR SELECT TO anon USING (true);
CREATE POLICY "public_insert_suppliers" ON suppliers FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "public_update_suppliers" ON suppliers FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "public_delete_suppliers" ON suppliers FOR DELETE TO anon USING (true);

CREATE POLICY "public_select_customers" ON customers FOR SELECT TO anon USING (true);
CREATE POLICY "public_insert_customers" ON customers FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "public_update_customers" ON customers FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "public_delete_customers" ON customers FOR DELETE TO anon USING (true);

CREATE POLICY "public_select_invoices" ON invoices FOR SELECT TO anon USING (true);
CREATE POLICY "public_insert_invoices" ON invoices FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "public_update_invoices" ON invoices FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "public_delete_invoices" ON invoices FOR DELETE TO anon USING (true);

CREATE POLICY "public_select_invoice_items" ON invoice_items FOR SELECT TO anon USING (true);
CREATE POLICY "public_insert_invoice_items" ON invoice_items FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "public_update_invoice_items" ON invoice_items FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "public_delete_invoice_items" ON invoice_items FOR DELETE TO anon USING (true);

CREATE POLICY "public_select_lpos" ON lpos FOR SELECT TO anon USING (true);
CREATE POLICY "public_insert_lpos" ON lpos FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "public_update_lpos" ON lpos FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "public_delete_lpos" ON lpos FOR DELETE TO anon USING (true);

CREATE POLICY "public_select_lpo_items" ON lpo_items FOR SELECT TO anon USING (true);
CREATE POLICY "public_insert_lpo_items" ON lpo_items FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "public_update_lpo_items" ON lpo_items FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "public_delete_lpo_items" ON lpo_items FOR DELETE TO anon USING (true);

CREATE POLICY "public_select_documents" ON documents FOR SELECT TO anon USING (true);
CREATE POLICY "public_insert_documents" ON documents FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "public_update_documents" ON documents FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "public_delete_documents" ON documents FOR DELETE TO anon USING (true);
