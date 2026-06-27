import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './contexts/AuthContext'
import AppLayout from './components/layout/AppLayout'
import ProtectedRoute from './components/layout/ProtectedRoute'
import LoginPage from './pages/auth/LoginPage'
import Dashboard from './pages/Dashboard'
import ReportsPage from './pages/reports/ReportsPage'
import InvoiceList from './pages/invoices/InvoiceList'
import InvoiceForm from './pages/invoices/InvoiceForm'
import InvoiceView from './pages/invoices/InvoiceView'
import LPOList from './pages/lpos/LPOList'
import LPOForm from './pages/lpos/LPOForm'
import LPOView from './pages/lpos/LPOView'
import LPODeliveries from './pages/lpos/LPODeliveries'
import SupplierList from './pages/suppliers/SupplierList'
import SupplierForm from './pages/suppliers/SupplierForm'
import CustomerList from './pages/customers/CustomerList'
import CustomerForm from './pages/customers/CustomerForm'
import ContactsDirectory from './pages/contacts/ContactsDirectory'
import DocumentsPage from './pages/documents/DocumentsPage'
import Settings from './pages/settings/Settings'
import ProjectList from './pages/projects/ProjectList'
import ProjectForm from './pages/projects/ProjectForm'
import ProjectDetail from './pages/projects/ProjectDetail'
import VOForm from './pages/projects/VOForm'
import ReceiptList from './pages/receipts/ReceiptList'
import ReceiptForm from './pages/receipts/ReceiptForm'
import ReceiptView from './pages/receipts/ReceiptView'
import WorkerList from './pages/workers/WorkerList'
import WorkerForm from './pages/workers/WorkerForm'
import WorkerProfile from './pages/workers/WorkerProfile'
import PayrollDashboard from './pages/payroll/PayrollDashboard'
import DailyLogList from './pages/daily-logs/DailyLogList'
import CashBook from './pages/cashbook/CashBook'
import PurchaseInvoiceList from './pages/purchases/PurchaseInvoiceList'
import PurchaseInvoiceForm from './pages/purchases/PurchaseInvoiceForm'
// ✦ الأقسام الجديدة
import SubcontractorList from './pages/subcontractors/SubcontractorList'
import SubcontractorDetail from './pages/subcontractors/SubcontractorDetail'
import ClientStatement from './pages/statements/ClientStatement'
import AssetList from './pages/assets/AssetList'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }>
              <Route index element={<Dashboard />} />
              <Route path="reports" element={<ReportsPage />} />
              {/* Projects */}
              <Route path="projects" element={<ProjectList />} />
              <Route path="projects/new" element={<ProjectForm />} />
              <Route path="projects/:id" element={<ProjectDetail />} />
              <Route path="projects/:id/edit" element={<ProjectForm />} />
              <Route path="projects/:projectId/vos/new" element={<VOForm />} />
              {/* Invoices */}
              <Route path="invoices" element={<InvoiceList />} />
              <Route path="invoices/new" element={<InvoiceForm />} />
              <Route path="invoices/:id/edit" element={<InvoiceForm />} />
              <Route path="invoices/:id/view" element={<InvoiceView />} />
              {/* Receipts */}
              <Route path="receipts" element={<ReceiptList />} />
              <Route path="receipts/new" element={<ReceiptForm />} />
              <Route path="receipts/:id/view" element={<ReceiptView />} />
              {/* LPOs */}
              <Route path="lpos" element={<LPOList />} />
              <Route path="lpos/new" element={<LPOForm />} />
              <Route path="lpos/:id/edit" element={<LPOForm />} />
              <Route path="lpos/:id/view" element={<LPOView />} />
              <Route path="lpos/:id/deliveries" element={<LPODeliveries />} />
              {/* Purchase Invoices */}
              <Route path="purchases" element={<PurchaseInvoiceList />} />
              <Route path="purchases/new" element={<PurchaseInvoiceForm />} />
              <Route path="purchases/:id/edit" element={<PurchaseInvoiceForm />} />
              {/* Workers */}
              <Route path="workers" element={<WorkerList />} />
              <Route path="workers/new" element={<WorkerForm />} />
              <Route path="workers/:id/edit" element={<WorkerForm />} />
              <Route path="workers/:id/profile" element={<WorkerProfile />} />
              <Route path="payroll" element={<PayrollDashboard />} />
              {/* Daily Logs */}
              <Route path="daily-logs" element={<DailyLogList />} />
              {/* Cash Book */}
              <Route path="cashbook" element={<CashBook />} />
              {/* ✦ المقاولون من الباطن */}
              <Route path="subcontractors" element={<SubcontractorList />} />
              <Route path="subcontractors/new" element={<SubcontractorDetail />} />
              <Route path="subcontractors/:id" element={<SubcontractorDetail />} />
              {/* ✦ الأصول والمعدات */}
              <Route path="assets" element={<AssetList />} />
              {/* Contacts */}
              <Route path="suppliers" element={<SupplierList />} />
              <Route path="suppliers/new" element={<SupplierForm />} />
              <Route path="suppliers/:id/edit" element={<SupplierForm />} />
              <Route path="customers" element={<CustomerList />} />
              <Route path="customers/new" element={<CustomerForm />} />
              <Route path="customers/:id/edit" element={<CustomerForm />} />
              {/* ✦ كشف حساب العميل */}
              <Route path="customers/:customerId/statement" element={<ClientStatement />} />
              <Route path="contacts" element={<ContactsDirectory />} />
              {/* Misc */}
              <Route path="documents" element={<DocumentsPage />} />
              <Route path="settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
      <Toaster
        position="top-center"
        toastOptions={{
          className: 'font-sans text-sm',
          style: { fontFamily: 'Noto Sans Arabic, Cairo, sans-serif' },
          duration: 3000,
        }}
      />
    </QueryClientProvider>
  )
}