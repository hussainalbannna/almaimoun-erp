/*
# Create Purchase Invoices & Delivery Notes System

1. New Tables
  - `purchase_invoices`
    - `id` (uuid, primary key)
    - `supplier_id` (uuid, FK to suppliers)
    - `supplier_name` (text) - denormalized for display
    - `project_id` (uuid, FK to projects)
    - `project_name` (text) - denormalized for display
    - `lpo_id` (uuid, FK to lpos, optional)
    - `lpo_number` (text) - denormalized
    - `vendor_invoice_number` (text)
    - `amount` (numeric, BHD 3 decimals)
    - `payment_method` (text: cash, bank_transfer, deferred_cheque)
    - `check_due_date` (date, nullable - only for deferred cheques)
    - `check_image_data` (text - base64 image for check photo)
    - `invoice_copy_data` (text - base64 for invoice attachment)
    - `payment_proof_data` (text - base64 for payment proof attachment)
    - `notes` (text)
    - `created_at` (timestamptz)
    - `updated_at` (timestamptz)

  - `purchase_invoice_deliveries`
    - `id` (uuid, primary key)
    - `purchase_invoice_id` (uuid, FK to purchase_invoices)
    - `delivery_note_number` (text)
    - `delivery_image_data` (text - base64 for delivery note image)
    - `notes` (text)
    - `created_at` (timestamptz)

2. Security
  - Enable RLS on both tables.
  - Allow anon + authenticated full CRUD (single-tenant, no auth).

3. Indexes
  - purchase_invoices: supplier_id, project_id, lpo_id, check_due_date
  - purchase_invoice_deliveries: purchase_invoice_id
*/

CREATE TABLE IF NOT EXISTS purchase_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name text NOT NULL DEFAULT '',
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  project_name text NOT NULL DEFAULT '',
  lpo_id uuid REFERENCES lpos(id) ON DELETE SET NULL,
  lpo_number text NOT NULL DEFAULT '',
  vendor_invoice_number text NOT NULL DEFAULT '',
  amount numeric NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'cash',
  check_due_date date,
  check_image_data text NOT NULL DEFAULT '',
  invoice_copy_data text NOT NULL DEFAULT '',
  payment_proof_data text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_invoice_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_invoice_id uuid NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
  delivery_note_number text NOT NULL DEFAULT '',
  delivery_image_data text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_supplier ON purchase_invoices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_project ON purchase_invoices(project_id);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_lpo ON purchase_invoices(lpo_id);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_check_due ON purchase_invoices(check_due_date);
CREATE INDEX IF NOT EXISTS idx_purchase_invoice_deliveries_invoice ON purchase_invoice_deliveries(purchase_invoice_id);

-- RLS
ALTER TABLE purchase_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_invoice_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_purchase_invoices" ON purchase_invoices;
CREATE POLICY "anon_select_purchase_invoices" ON purchase_invoices FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_purchase_invoices" ON purchase_invoices;
CREATE POLICY "anon_insert_purchase_invoices" ON purchase_invoices FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_purchase_invoices" ON purchase_invoices;
CREATE POLICY "anon_update_purchase_invoices" ON purchase_invoices FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_purchase_invoices" ON purchase_invoices;
CREATE POLICY "anon_delete_purchase_invoices" ON purchase_invoices FOR DELETE
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_purchase_invoice_deliveries" ON purchase_invoice_deliveries;
CREATE POLICY "anon_select_purchase_invoice_deliveries" ON purchase_invoice_deliveries FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_purchase_invoice_deliveries" ON purchase_invoice_deliveries;
CREATE POLICY "anon_insert_purchase_invoice_deliveries" ON purchase_invoice_deliveries FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_purchase_invoice_deliveries" ON purchase_invoice_deliveries;
CREATE POLICY "anon_update_purchase_invoice_deliveries" ON purchase_invoice_deliveries FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_purchase_invoice_deliveries" ON purchase_invoice_deliveries;
CREATE POLICY "anon_delete_purchase_invoice_deliveries" ON purchase_invoice_deliveries FOR DELETE
  TO anon, authenticated USING (true);
