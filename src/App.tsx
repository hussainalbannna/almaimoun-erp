import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './contexts/AuthContext'

// ── هيكل التطبيق (يُحمّل مباشرةً لأنه يُعرض دائماً) ──
import AppLayout from './components/layout/AppLayout'
import ProtectedRoute from './components/layout/ProtectedRoute'

// ── الصفحات تُحمّل كسولياً (code-splitting): كل صفحة في حزمة منفصلة تُجلب عند فتحها فقط،
//    ما يقلّص الحزمة الأولية بشكل كبير (المكتبات الثقيلة مثل pdfjs/tesseract/xlsx لم تعد تُحمّل عند الإقلاع). ──
const LoginPage = lazy(() => import('./pages/auth/LoginPage'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const ReportsPage = lazy(() => import('./pages/reports/ReportsPage'))

const AIAssistant = lazy(() => import('./pages/assistant/AIAssistant'))
const CalendarView = lazy(() => import('./pages/calendar/CalendarView'))
const NotificationsCenter = lazy(() => import('./pages/notifications/NotificationsCenter'))

const QuotationList = lazy(() => import('./pages/quotations/QuotationList'))
const QuotationForm = lazy(() => import('./pages/quotations/QuotationForm'))
const QuotationView = lazy(() => import('./pages/quotations/QuotationView'))

const ProjectList = lazy(() => import('./pages/projects/ProjectList'))
const ProjectForm = lazy(() => import('./pages/projects/ProjectForm'))
const ProjectDetail = lazy(() => import('./pages/projects/ProjectDetail'))
const VOForm = lazy(() => import('./pages/projects/VOForm'))

const AssetList = lazy(() => import('./pages/assets/AssetList'))

const RentalsList = lazy(() => import('./pages/rentals/RentalsList'))
const RentalForm = lazy(() => import('./pages/rentals/RentalForm'))

const InvoiceList = lazy(() => import('./pages/invoices/InvoiceList'))
const InvoiceForm = lazy(() => import('./pages/invoices/InvoiceForm'))
const InvoiceView = lazy(() => import('./pages/invoices/InvoiceView'))

const ReceiptList = lazy(() => import('./pages/receipts/ReceiptList'))
const ReceiptForm = lazy(() => import('./pages/receipts/ReceiptForm'))
const ReceiptView = lazy(() => import('./pages/receipts/ReceiptView'))

const FinanceDashboard = lazy(() => import('./pages/finance/FinanceDashboard'))
const CashBook = lazy(() => import('./pages/cashbook/CashBook'))
const ChequesCenter = lazy(() => import('./pages/cheques/ChequesCenter'))

const LPOList = lazy(() => import('./pages/lpos/LPOList'))
const LPOForm = lazy(() => import('./pages/lpos/LPOForm'))
const LPOView = lazy(() => import('./pages/lpos/LPOView'))
const LPODeliveries = lazy(() => import('./pages/lpos/LPODeliveries'))

const PurchaseInvoiceList = lazy(() => import('./pages/purchases/PurchaseInvoiceList'))
const PurchaseInvoiceForm = lazy(() => import('./pages/purchases/PurchaseInvoiceForm'))

const WorkerList = lazy(() => import('./pages/workers/WorkerList'))
const WorkerForm = lazy(() => import('./pages/workers/WorkerForm'))
const WorkerProfile = lazy(() => import('./pages/workers/WorkerProfile'))
const PayrollDashboard = lazy(() => import('./pages/payroll/PayrollDashboard'))

const TasksBoard = lazy(() => import('./pages/tasks/TasksBoard'))
const DailyLogList = lazy(() => import('./pages/daily-logs/DailyLogList'))

const SubcontractorList = lazy(() => import('./pages/subcontractors/SubcontractorList'))
const SubcontractorDetail = lazy(() => import('./pages/subcontractors/SubcontractorDetail'))

const SupplierList = lazy(() => import('./pages/suppliers/SupplierList'))
const SupplierForm = lazy(() => import('./pages/suppliers/SupplierForm'))
const CustomerList = lazy(() => import('./pages/customers/CustomerList'))
const CustomerDetail = lazy(() => import('./pages/customers/CustomerDetail'))
const CustomerForm = lazy(() => import('./pages/customers/CustomerForm'))
const ClientStatement = lazy(() => import('./pages/statements/ClientStatement'))
const ContactsDirectory = lazy(() => import('./pages/contacts/ContactsDirectory'))

const DocumentsPage = lazy(() => import('./pages/documents/DocumentsPage'))
const Settings = lazy(() => import('./pages/settings/Settings'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false },
  },
})

// مؤشّر تحميل يُعرض أثناء جلب حزمة الصفحة المطلوبة
function RouteFallback() {
  return (
    <div className="flex items-center justify-center py-24" role="status" aria-label="جاري التحميل">
      <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<RouteFallback />}>
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
                <Route path="customers/:id" element={<CustomerDetail />} />
                <Route path="customers/:id/edit" element={<CustomerForm />} />
                <Route path="customers/:customerId/statement" element={<ClientStatement />} />
                <Route path="contacts" element={<ContactsDirectory />} />

                {/* أخرى */}
                <Route path="documents" element={<DocumentsPage />} />
                <Route path="settings" element={<Settings />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </Suspense>
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
