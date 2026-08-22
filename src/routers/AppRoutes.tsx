import { Routes, Route, Navigate } from 'react-router';
import Mainlayout from '../layouts/Mainlayout';
import DashboardLayout from '../layouts/DashboardLayout';
import Login from '../pages/auth/Login';
import OtpVerification from '../pages/auth/OtpVerification';
import Home from '../pages/Home';
import About from '../pages/About';
import Service from '../pages/Services';
import Contact from '../pages/Contact';
import DashboardHome from '../pages/dashboard/DashboardHome';
import Datasets from '../pages/dashboard/Datasets';
import DataCleaning from '../pages/dashboard/DataCleaning';
import Reports from '../pages/dashboard/Reports';
import ProtectedRoute from './ProtectedRoute';

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/verificar-otp" element={<OtpVerification />} />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardHome />} />
        <Route path="datasets" element={<Datasets />} />
        <Route path="limpieza" element={<DataCleaning />} />
        <Route path="reportes" element={<Reports />} />
      </Route>

      <Route element={<Mainlayout />}>
        <Route path="/inicio" element={<Home />} />
        <Route path="/nosotros" element={<About />} />
        <Route path="/servicios" element={<Service />} />
        <Route path="/contacto" element={<Contact />} />
      </Route>

      {/* Redirige la raíz y cualquier ruta desconocida al login */}
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
