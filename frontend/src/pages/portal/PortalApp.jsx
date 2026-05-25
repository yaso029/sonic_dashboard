import { Routes, Route, Navigate } from 'react-router-dom';
import { PortalAuthProvider, usePortalAuth } from '../../PortalAuthContext';
import PortalLogin from './PortalLogin';
import PortalLayout from './PortalLayout';
import PortalDashboard from './PortalDashboard';
import PortalInvoices from './PortalInvoices';
import PortalInvoiceDetail from './PortalInvoiceDetail';
import PortalDocuments from './PortalDocuments';
import PortalServices from './PortalServices';
import PortalProfile from './PortalProfile';

function PortalPrivate({ children }) {
  const { portalUser } = usePortalAuth();
  if (!portalUser) return <Navigate to="/portal/login" replace />;
  return children;
}

function PortalRoutes() {
  const { portalUser } = usePortalAuth();
  return (
    <Routes>
      <Route path="login" element={portalUser ? <Navigate to="/portal" replace /> : <PortalLogin />} />
      <Route path="/" element={<PortalPrivate><PortalLayout /></PortalPrivate>}>
        <Route index element={<PortalDashboard />} />
        <Route path="invoices" element={<PortalInvoices />} />
        <Route path="invoices/:id" element={<PortalInvoiceDetail />} />
        <Route path="documents" element={<PortalDocuments />} />
        <Route path="services" element={<PortalServices />} />
        <Route path="profile" element={<PortalProfile />} />
      </Route>
      <Route path="*" element={<Navigate to="/portal" replace />} />
    </Routes>
  );
}

export default function PortalApp() {
  return (
    <PortalAuthProvider>
      <PortalRoutes />
    </PortalAuthProvider>
  );
}
