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
import ChequesCenter from './pages/cheques/ChequesCenter'
import PurchaseInvoiceList from './pages/purchases/PurchaseInvoiceList'
import PurchaseInvoiceForm from './pages/purchases/PurchaseInvoiceForm'
// الأقسام المضافة
import SubcontractorList from './pages/subcontractors/SubcontractorList'
import SubcontractorDetail from './pages/subcontractors/SubcontractorDetail'
import AssetList from './pages/assets/AssetList'
import ClientStatement from './pages/statements/ClientStatement'
// الصفحات الجديدة الجاهزة فقط
import AIAssistant from './pages/assistant/AIAssistant'
import QuotationList from './pages/quotations/QuotationList'
import QuotationForm from './pages/quotations/QuotationForm'
import QuotationView from './pages/quotations/QuotationView'
import CalendarView from './pages/calendar/CalendarView'
import TasksBoard from './pages/tasks/TasksBoard'
import FinanceDashboard from './pages/finance/FinanceDashboard'
import NotificationsCenter from './pages/notifications/NotificationsCenter'
// الإيجارات والمصاريف الثابتة
import RentalsList from './pages/rentals/RentalsList'
import RentalForm from './pages/rentals/RentalForm'

// ⚠️ مؤقّت — أداة نقل المرفقات (احذف هذا السطر بعد اكتمال النقل)
import MigrateAttachments from './pages/admin/MigrateAttachments'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false },
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

              {/* المساعد الذكي والتقويم والإشعارات */}
              <Route path="assistant" element={<AIAssistant />} />
              <Route path="calendar" element={<CalendarView />} />
              <Route path="notifications" element={<NotificationsCenter />} />

              {/* عروض الأسعار */}
              <Route path="quotations" element={<QuotationList />} />
              <Route path="quotations/new" element={<QuotationForm />} />
              <Route path="quotations/:id" element={<QuotationView />} />
              <Route path="quotations/:id/edit" element={<QuotationForm />} />

              {/* المشاريع */}
              <Route path="projects" element={<ProjectList />} />
              <Route path="projects/new" element={<ProjectForm />} />
              <Route path="projects/:id" element={<ProjectDetail />} />
              <Route path="projects/:id/edit" element={<ProjectForm />} />
              <Route path="projects/:projectId/vos/new" element={<VOForm />} />

              {/* الأصول */}
              <Route path="assets" element={<AssetList />} />

              {/* الإيجارات والمصاريف الثابتة */}
              <Route path="rentals" element={<RentalsList />} />
              <Route path="rentals/new" element={<RentalForm />} />
              <Route path="rentals/:id/edit" element={<RentalForm />} />

              {/* الفواتير */}
              <Route path="invoices" element={<InvoiceList />} />
              <Route path="invoices/new" element={<InvoiceForm />} />
              <Route path="invoices/:id/edit" element={<InvoiceForm />} />
              <Route path="invoices/:id/view" element={<InvoiceView />} />

              {/* الإيصالات */}
              <Route path="receipts" element={<ReceiptList />} />
              <Route path="receipts/new" element={<ReceiptForm />} />
              <Route path="receipts/:id/view" element={<ReceiptView />} />

              {/* اللوحة المالية ودفتر الصندوق */}
              <Route path="finance" element={<FinanceDashboard />} />
              <Route path="cashbook" element={<CashBook />} />
              <Route path="cheques" element={<ChequesCenter />} />

              {/* أوامر الشراء */}
              <Route path="lpos" element={<LPOList />} />
              <Route path="lpos/new" element={<LPOForm />} />
              <Route path="lpos/:id/edit" element={<LPOForm />} />
              <Route path="lpos/:id/view" element={<LPOView />} />
              <Route path="lpos/:id/deliveries" element={<LPODeliveries />} />

              {/* فواتير الشراء */}
              <Route path="purchases" element={<PurchaseInvoiceList />} />
              <Route path="purchases/new" element={<PurchaseInvoiceForm />} />
              <Route path="purchases/:id/edit" element={<PurchaseInvoiceForm />} />

              {/* العمالة */}
              <Route path="workers" element={<WorkerList />} />
              <Route path="workers/new" element={<WorkerForm />} />
              <Route path="workers/:id/edit" element={<WorkerForm />} />
              <Route path="workers/:id/profile" element={<WorkerProfile />} />
              <Route path="payroll" element={<PayrollDashboard />} />

              {/* المهام */}
              <Route path="tasks" element={<TasksBoard />} />

              {/* التقارير اليومية */}
              <Route path="daily-logs" element={<DailyLogList />} />

              {/* مقاولو الباطن */}
              <Route path="subcontractors" element={<SubcontractorList />} />
              <Route path="subcontractors/new" element={<SubcontractorDetail />} />
              <Route path="subcontractors/:id" element={<SubcontractorDetail />} />

              {/* الموردون والعملاء وجهات الاتصال */}
              <Route path="suppliers" element={<SupplierList />} />
              <Route path="suppliers/new" element={<SupplierForm />} />
              <Route path="suppliers/:id/edit" element={<SupplierForm />} />
              <Route path="customers" element={<CustomerList />} />
              <Route path="customers/new" element={<CustomerForm />} />
              <Route path="customers/:id/edit" element={<CustomerForm />} />
              <Route path="customers/:customerId/statement" element={<ClientStatement />} />
              <Route path="contacts" element={<ContactsDirectory />} />

              {/* ⚠️ مؤقّت — صفحة نقل المرفقات (احذفها بعد اكتمال النقل) */}
              <Route path="migrate" element={<MigrateAttachments />} />

              {/* أخرى */}
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
