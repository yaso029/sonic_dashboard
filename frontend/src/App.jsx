import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import LoginPage from './pages/LoginPage';
import Landing from './pages/Landing';
import Layout from './components/Layout';
import PartnershipsLayout from './components/PartnershipsLayout';
import AgentsLayout from './components/AgentsLayout';
import CRMPage from './pages/CRMPage';
import LeadDetailPage from './pages/LeadDetailPage';
import UsersPage from './pages/UsersPage';
import CustomersPage from './pages/CustomersPage';
import PartnershipsDashboard from './pages/partnerships/Dashboard';
import Partners from './pages/partnerships/Partners';
import Outreach from './pages/partnerships/Outreach';
import Templates from './pages/partnerships/Templates';
import Replies from './pages/partnerships/Replies';
import Commissions from './pages/partnerships/Commissions';
import AgentsDashboard from './pages/agents/Dashboard';
import HRLayout from './components/HRLayout';
import Employees from './pages/hr/Employees';
import ECards from './pages/hr/ECards';
import CalendarLayout from './components/CalendarLayout';
import CalendarPage from './pages/calendar/CalendarPage';
import PublicReferralPage from './pages/PublicReferralPage';
import PublicCardPage from './pages/PublicCardPage';
import ECardsPage from './pages/ECardsPage';
import SettingsPage from './pages/SettingsPage';
import ReferralPartners from './pages/agents/ReferralPartners';
import ReferralApplications from './pages/partnerships/ReferralApplications';
import ClientsPage from './pages/clients/ClientsPage';
import ClientDetailPage from './pages/clients/ClientDetailPage';
import ServicesPage from './pages/services/ServicesPage';
import DocumentsPage from './pages/DocumentsPage';
import InvoicesPage from './pages/billing/InvoicesPage';
import InvoiceDetailPage from './pages/billing/InvoiceDetailPage';
import PortalApp from './pages/portal/PortalApp';
import AuditLogPage from './pages/security/AuditLogPage';
import TeamTasksPage from './pages/teamtasks/TeamTasksPage';
import KlingStudioPage from './pages/kling/KlingStudioPage';

function PrivateRoute({ children, roles }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { user } = useAuth();

  return (
    <Routes>
      {/* Public — no auth required */}
      <Route path="/referral" element={<PublicReferralPage />} />
      <Route path="/card/:slug" element={<PublicCardPage />} />

      {/* Client Portal — separate auth domain (portal-scoped tokens) */}
      <Route path="/portal/*" element={<PortalApp />} />

      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />

      {/* Landing — module selector */}
      <Route path="/" element={<PrivateRoute><Landing /></PrivateRoute>} />

      {/* CRM module — tabbed single page */}
      <Route path="/crm" element={<PrivateRoute roles={['admin', 'marketing_manager', 'marketing_specialist', 'analyst', 'social_media_specialist', 'seo_specialist', 'wordpress_developer', 'graphic_designer', 'video_editor']}><CRMPage /></PrivateRoute>} />

      {/* Lead detail — uses sidebar layout */}
      <Route path="/crm/leads" element={<PrivateRoute roles={['admin', 'marketing_manager', 'marketing_specialist', 'analyst', 'social_media_specialist', 'seo_specialist', 'wordpress_developer', 'graphic_designer', 'video_editor']}><Layout /></PrivateRoute>}>
        <Route path=":id" element={<LeadDetailPage />} />
      </Route>

      {/* Partnerships module — admin only */}
      <Route path="/partnerships" element={
        <PrivateRoute roles={['admin']}>
          <PartnershipsLayout />
        </PrivateRoute>
      }>
        <Route index element={<PartnershipsDashboard />} />
        <Route path="referral-applications" element={<ReferralApplications />} />
        <Route path="partners" element={<Partners />} />
        <Route path="outreach" element={<Outreach />} />
        <Route path="templates" element={<Templates />} />
        <Route path="replies" element={<Replies />} />
        <Route path="commissions" element={<Commissions />} />
      </Route>

      {/* Marketing Specialists module — all marketing staff */}
      <Route path="/agents" element={<PrivateRoute roles={['admin', 'marketing_manager', 'marketing_specialist', 'analyst', 'social_media_specialist', 'seo_specialist', 'wordpress_developer', 'graphic_designer', 'video_editor']}><AgentsLayout /></PrivateRoute>}>
        <Route index element={<AgentsDashboard />} />
      </Route>

      {/* Clients module — all marketing staff */}
      <Route path="/clients" element={<PrivateRoute roles={['admin', 'marketing_manager', 'marketing_specialist', 'analyst', 'social_media_specialist', 'seo_specialist', 'wordpress_developer', 'graphic_designer', 'video_editor']}><ClientsPage /></PrivateRoute>} />
      <Route path="/clients/:id" element={<PrivateRoute roles={['admin', 'marketing_manager', 'marketing_specialist', 'analyst', 'social_media_specialist', 'seo_specialist', 'wordpress_developer', 'graphic_designer', 'video_editor']}><ClientDetailPage /></PrivateRoute>} />

      {/* Client Services — practice-wide engagements view */}
      <Route path="/services" element={<PrivateRoute roles={['admin', 'marketing_manager', 'marketing_specialist', 'analyst', 'social_media_specialist', 'seo_specialist', 'wordpress_developer', 'graphic_designer', 'video_editor']}><ServicesPage /></PrivateRoute>} />

      {/* Documents — practice-wide secure client document vault */}
      <Route path="/documents" element={<PrivateRoute roles={['admin', 'marketing_manager', 'marketing_specialist', 'analyst', 'social_media_specialist', 'seo_specialist', 'wordpress_developer', 'graphic_designer', 'video_editor']}><DocumentsPage /></PrivateRoute>} />

      {/* Billing module — marketing staff (read+); analyst/content_creation/tax are read-only */}
      <Route path="/billing" element={<PrivateRoute roles={['admin', 'marketing_manager', 'marketing_specialist', 'analyst', 'social_media_specialist', 'seo_specialist', 'wordpress_developer', 'graphic_designer', 'video_editor']}><InvoicesPage /></PrivateRoute>} />
      <Route path="/billing/:id" element={<PrivateRoute roles={['admin', 'marketing_manager', 'marketing_specialist', 'analyst', 'social_media_specialist', 'seo_specialist', 'wordpress_developer', 'graphic_designer', 'video_editor']}><InvoiceDetailPage /></PrivateRoute>} />

      {/* Calendar module — all authenticated users */}
      <Route path="/calendar" element={<PrivateRoute><CalendarLayout /></PrivateRoute>}>
        <Route index element={<CalendarPage />} />
      </Route>

      {/* HR module — admin + hr_admin */}
      <Route path="/hr" element={
        <PrivateRoute roles={['admin', 'hr_admin']}>
          <HRLayout />
        </PrivateRoute>
      }>
        <Route index element={<Employees />} />
        <Route path="ecards" element={<ECards />} />
      </Route>

      {/* E-Business Cards — all authenticated users */}
      <Route path="/ecards" element={<PrivateRoute><ECardsPage /></PrivateRoute>} />

      {/* Settings — all authenticated users */}
      {/* Team Task Management — any authenticated user (page adapts to role) */}
      <Route path="/team-tasks" element={<PrivateRoute><TeamTasksPage /></PrivateRoute>} />

      {/* Video Studio — Kling AI video generation (any authenticated user) */}
      <Route path="/video-studio" element={<PrivateRoute><KlingStudioPage /></PrivateRoute>} />

      <Route path="/settings" element={<PrivateRoute><SettingsPage /></PrivateRoute>} />

      {/* Security audit log — admin only */}
      <Route path="/audit-log" element={<PrivateRoute roles={['admin']}><AuditLogPage /></PrivateRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
