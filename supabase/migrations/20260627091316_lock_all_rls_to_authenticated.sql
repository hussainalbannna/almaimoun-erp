/*
# Lock all RLS policies to authenticated users only

Now that the app requires login, all table policies are upgraded from
`TO anon` / `TO anon, authenticated` to `TO authenticated` only.
This means the Supabase anon key alone (without a valid session) can
no longer read or write any business data — full server-side enforcement.

All existing per-table policies are dropped and recreated with the
`authenticated` role. Tables covered:
  company_settings, suppliers, customers, invoices, invoice_items,
  lpos, lpo_items, documents, projects, project_milestones, receipts,
  workers, worker_advances, daily_logs, daily_log_workers,
  variation_orders, lpo_deliveries, lpo_delivery_items, accounts_payable,
  worker_attendance, worker_loans, worker_medical_records,
  worker_travel_records, worker_documents, worker_disciplinary,
  purchase_invoices, purchase_invoice_deliveries
*/

-- company_settings
DROP POLICY IF EXISTS "public_select_company" ON company_settings;
DROP POLICY IF EXISTS "public_insert_company" ON company_settings;
DROP POLICY IF EXISTS "public_update_company" ON company_settings;
DROP POLICY IF EXISTS "public_delete_company" ON company_settings;
CREATE POLICY "auth_select_company" ON company_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_company" ON company_settings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_company" ON company_settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_company" ON company_settings FOR DELETE TO authenticated USING (true);

-- suppliers
DROP POLICY IF EXISTS "public_select_suppliers" ON suppliers;
DROP POLICY IF EXISTS "public_insert_suppliers" ON suppliers;
DROP POLICY IF EXISTS "public_update_suppliers" ON suppliers;
DROP POLICY IF EXISTS "public_delete_suppliers" ON suppliers;
CREATE POLICY "auth_select_suppliers" ON suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_suppliers" ON suppliers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_suppliers" ON suppliers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_suppliers" ON suppliers FOR DELETE TO authenticated USING (true);

-- customers
DROP POLICY IF EXISTS "public_select_customers" ON customers;
DROP POLICY IF EXISTS "public_insert_customers" ON customers;
DROP POLICY IF EXISTS "public_update_customers" ON customers;
DROP POLICY IF EXISTS "public_delete_customers" ON customers;
CREATE POLICY "auth_select_customers" ON customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_customers" ON customers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_customers" ON customers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_customers" ON customers FOR DELETE TO authenticated USING (true);

-- invoices
DROP POLICY IF EXISTS "public_select_invoices" ON invoices;
DROP POLICY IF EXISTS "public_insert_invoices" ON invoices;
DROP POLICY IF EXISTS "public_update_invoices" ON invoices;
DROP POLICY IF EXISTS "public_delete_invoices" ON invoices;
CREATE POLICY "auth_select_invoices" ON invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_invoices" ON invoices FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_invoices" ON invoices FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_invoices" ON invoices FOR DELETE TO authenticated USING (true);

-- invoice_items
DROP POLICY IF EXISTS "public_select_invoice_items" ON invoice_items;
DROP POLICY IF EXISTS "public_insert_invoice_items" ON invoice_items;
DROP POLICY IF EXISTS "public_update_invoice_items" ON invoice_items;
DROP POLICY IF EXISTS "public_delete_invoice_items" ON invoice_items;
CREATE POLICY "auth_select_invoice_items" ON invoice_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_invoice_items" ON invoice_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_invoice_items" ON invoice_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_invoice_items" ON invoice_items FOR DELETE TO authenticated USING (true);

-- lpos
DROP POLICY IF EXISTS "public_select_lpos" ON lpos;
DROP POLICY IF EXISTS "public_insert_lpos" ON lpos;
DROP POLICY IF EXISTS "public_update_lpos" ON lpos;
DROP POLICY IF EXISTS "public_delete_lpos" ON lpos;
CREATE POLICY "auth_select_lpos" ON lpos FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_lpos" ON lpos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_lpos" ON lpos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_lpos" ON lpos FOR DELETE TO authenticated USING (true);

-- lpo_items
DROP POLICY IF EXISTS "public_select_lpo_items" ON lpo_items;
DROP POLICY IF EXISTS "public_insert_lpo_items" ON lpo_items;
DROP POLICY IF EXISTS "public_update_lpo_items" ON lpo_items;
DROP POLICY IF EXISTS "public_delete_lpo_items" ON lpo_items;
CREATE POLICY "auth_select_lpo_items" ON lpo_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_lpo_items" ON lpo_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_lpo_items" ON lpo_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_lpo_items" ON lpo_items FOR DELETE TO authenticated USING (true);

-- documents
DROP POLICY IF EXISTS "public_select_documents" ON documents;
DROP POLICY IF EXISTS "public_insert_documents" ON documents;
DROP POLICY IF EXISTS "public_update_documents" ON documents;
DROP POLICY IF EXISTS "public_delete_documents" ON documents;
CREATE POLICY "auth_select_documents" ON documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_documents" ON documents FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_documents" ON documents FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_documents" ON documents FOR DELETE TO authenticated USING (true);

-- projects
DROP POLICY IF EXISTS "anon_projects" ON projects;
CREATE POLICY "auth_select_projects" ON projects FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_projects" ON projects FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_projects" ON projects FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_projects" ON projects FOR DELETE TO authenticated USING (true);

-- project_milestones
DROP POLICY IF EXISTS "anon_milestones" ON project_milestones;
CREATE POLICY "auth_select_milestones" ON project_milestones FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_milestones" ON project_milestones FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_milestones" ON project_milestones FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_milestones" ON project_milestones FOR DELETE TO authenticated USING (true);

-- receipts
DROP POLICY IF EXISTS "anon_receipts" ON receipts;
CREATE POLICY "auth_select_receipts" ON receipts FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_receipts" ON receipts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_receipts" ON receipts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_receipts" ON receipts FOR DELETE TO authenticated USING (true);

-- workers
DROP POLICY IF EXISTS "anon_workers" ON workers;
CREATE POLICY "auth_select_workers" ON workers FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_workers" ON workers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_workers" ON workers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_workers" ON workers FOR DELETE TO authenticated USING (true);

-- worker_advances
DROP POLICY IF EXISTS "anon_advances" ON worker_advances;
CREATE POLICY "auth_select_advances" ON worker_advances FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_advances" ON worker_advances FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_advances" ON worker_advances FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_advances" ON worker_advances FOR DELETE TO authenticated USING (true);

-- daily_logs
DROP POLICY IF EXISTS "anon_daily_logs" ON daily_logs;
CREATE POLICY "auth_select_daily_logs" ON daily_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_daily_logs" ON daily_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_daily_logs" ON daily_logs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_daily_logs" ON daily_logs FOR DELETE TO authenticated USING (true);

-- daily_log_workers
DROP POLICY IF EXISTS "anon_log_workers" ON daily_log_workers;
CREATE POLICY "auth_select_log_workers" ON daily_log_workers FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_log_workers" ON daily_log_workers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_log_workers" ON daily_log_workers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_log_workers" ON daily_log_workers FOR DELETE TO authenticated USING (true);

-- variation_orders
DROP POLICY IF EXISTS "anon_vos" ON variation_orders;
CREATE POLICY "auth_select_vos" ON variation_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_vos" ON variation_orders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_vos" ON variation_orders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_vos" ON variation_orders FOR DELETE TO authenticated USING (true);

-- lpo_deliveries
DROP POLICY IF EXISTS "anon_deliveries" ON lpo_deliveries;
CREATE POLICY "auth_select_deliveries" ON lpo_deliveries FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_deliveries" ON lpo_deliveries FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_deliveries" ON lpo_deliveries FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_deliveries" ON lpo_deliveries FOR DELETE TO authenticated USING (true);

-- lpo_delivery_items
DROP POLICY IF EXISTS "anon_delivery_items" ON lpo_delivery_items;
CREATE POLICY "auth_select_delivery_items" ON lpo_delivery_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_delivery_items" ON lpo_delivery_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_delivery_items" ON lpo_delivery_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_delivery_items" ON lpo_delivery_items FOR DELETE TO authenticated USING (true);

-- accounts_payable
DROP POLICY IF EXISTS "anon_ap" ON accounts_payable;
CREATE POLICY "auth_select_ap" ON accounts_payable FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_ap" ON accounts_payable FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_ap" ON accounts_payable FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_ap" ON accounts_payable FOR DELETE TO authenticated USING (true);

-- worker_attendance
DROP POLICY IF EXISTS "anon_attendance" ON worker_attendance;
DROP POLICY IF EXISTS "anon_attendance_insert" ON worker_attendance;
DROP POLICY IF EXISTS "anon_attendance_update" ON worker_attendance;
DROP POLICY IF EXISTS "anon_attendance_delete" ON worker_attendance;
CREATE POLICY "auth_select_attendance" ON worker_attendance FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_attendance" ON worker_attendance FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_attendance" ON worker_attendance FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_attendance" ON worker_attendance FOR DELETE TO authenticated USING (true);

-- worker_loans
DROP POLICY IF EXISTS "anon_loans_select" ON worker_loans;
DROP POLICY IF EXISTS "anon_loans_insert" ON worker_loans;
DROP POLICY IF EXISTS "anon_loans_update" ON worker_loans;
DROP POLICY IF EXISTS "anon_loans_delete" ON worker_loans;
CREATE POLICY "auth_select_loans" ON worker_loans FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_loans" ON worker_loans FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_loans" ON worker_loans FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_loans" ON worker_loans FOR DELETE TO authenticated USING (true);

-- worker_medical_records
DROP POLICY IF EXISTS "anon_medical_select" ON worker_medical_records;
DROP POLICY IF EXISTS "anon_medical_insert" ON worker_medical_records;
DROP POLICY IF EXISTS "anon_medical_update" ON worker_medical_records;
DROP POLICY IF EXISTS "anon_medical_delete" ON worker_medical_records;
CREATE POLICY "auth_select_medical" ON worker_medical_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_medical" ON worker_medical_records FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_medical" ON worker_medical_records FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_medical" ON worker_medical_records FOR DELETE TO authenticated USING (true);

-- worker_travel_records
DROP POLICY IF EXISTS "anon_travel_select" ON worker_travel_records;
DROP POLICY IF EXISTS "anon_travel_insert" ON worker_travel_records;
DROP POLICY IF EXISTS "anon_travel_update" ON worker_travel_records;
DROP POLICY IF EXISTS "anon_travel_delete" ON worker_travel_records;
CREATE POLICY "auth_select_travel" ON worker_travel_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_travel" ON worker_travel_records FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_travel" ON worker_travel_records FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_travel" ON worker_travel_records FOR DELETE TO authenticated USING (true);

-- worker_documents
DROP POLICY IF EXISTS "anon_docs_select" ON worker_documents;
DROP POLICY IF EXISTS "anon_docs_insert" ON worker_documents;
DROP POLICY IF EXISTS "anon_docs_update" ON worker_documents;
DROP POLICY IF EXISTS "anon_docs_delete" ON worker_documents;
CREATE POLICY "auth_select_worker_docs" ON worker_documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_worker_docs" ON worker_documents FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_worker_docs" ON worker_documents FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_worker_docs" ON worker_documents FOR DELETE TO authenticated USING (true);

-- worker_disciplinary
DROP POLICY IF EXISTS "anon_disciplinary_select" ON worker_disciplinary;
DROP POLICY IF EXISTS "anon_disciplinary_insert" ON worker_disciplinary;
DROP POLICY IF EXISTS "anon_disciplinary_update" ON worker_disciplinary;
DROP POLICY IF EXISTS "anon_disciplinary_delete" ON worker_disciplinary;
CREATE POLICY "auth_select_disciplinary" ON worker_disciplinary FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_disciplinary" ON worker_disciplinary FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_disciplinary" ON worker_disciplinary FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_disciplinary" ON worker_disciplinary FOR DELETE TO authenticated USING (true);

-- purchase_invoices (drop old anon policies, create auth only)
DROP POLICY IF EXISTS "anon_select_purchase_invoices" ON purchase_invoices;
DROP POLICY IF EXISTS "anon_insert_purchase_invoices" ON purchase_invoices;
DROP POLICY IF EXISTS "anon_update_purchase_invoices" ON purchase_invoices;
DROP POLICY IF EXISTS "anon_delete_purchase_invoices" ON purchase_invoices;
CREATE POLICY "auth_select_purchase_invoices" ON purchase_invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_purchase_invoices" ON purchase_invoices FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_purchase_invoices" ON purchase_invoices FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_purchase_invoices" ON purchase_invoices FOR DELETE TO authenticated USING (true);

-- purchase_invoice_deliveries
DROP POLICY IF EXISTS "anon_select_purchase_invoice_deliveries" ON purchase_invoice_deliveries;
DROP POLICY IF EXISTS "anon_insert_purchase_invoice_deliveries" ON purchase_invoice_deliveries;
DROP POLICY IF EXISTS "anon_update_purchase_invoice_deliveries" ON purchase_invoice_deliveries;
DROP POLICY IF EXISTS "anon_delete_purchase_invoice_deliveries" ON purchase_invoice_deliveries;
CREATE POLICY "auth_select_pi_deliveries" ON purchase_invoice_deliveries FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_pi_deliveries" ON purchase_invoice_deliveries FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_pi_deliveries" ON purchase_invoice_deliveries FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_pi_deliveries" ON purchase_invoice_deliveries FOR DELETE TO authenticated USING (true);
