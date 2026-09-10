import { Routes, Route, Navigate } from 'react-router';
import Mainlayout from '../layouts/Mainlayout';
import DashboardLayout from '../layouts/DashboardLayout';
import Login from '../pages/auth/Login';
import OtpVerification from '../pages/auth/OtpVerification';
import AnalystLogin from '../pages/auth/AnalystLogin';
import Home from '../pages/Home';
import About from '../pages/About';
import Service from '../pages/Services';
import Contact from '../pages/Contact';
import DashboardHome from '../pages/dashboard/DashboardHome';
import Datasets from '../pages/dashboard/Datasets';
import DataCleaning from '../pages/dashboard/DataCleaning';
import Reports from '../pages/dashboard/Reports';
import Sales from '../pages/dashboard/Sales';
import Offers from '../pages/dashboard/Offers';
import Administration from '../pages/dashboard/Administration';
import ProtectedRoute from './ProtectedRoute';

export default function AppRoutes() {
  return (
    <Routes>
      {/* Auth */}
      <Route path="/login" element={<Login />} />
      <Route path="/verificar-otp" element={<OtpVerification />} />
      <Route path="/acceso-analista" element={<AnalystLogin />} />

      {/* Dashboard protegido */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        {/* Inicio — requiere módulo 'dashboard' */}
        <Route index element={
          <ProtectedRoute requiredModule="dashboard">
            <DashboardHome />
          </ProtectedRoute>
        } />

        {/* Datasets — solo admins */}
        <Route path="datasets" element={
          <ProtectedRoute requiredModule="datasets">
            <Datasets />
          </ProtectedRoute>
        } />

        {/* Limpieza — solo admins */}
        <Route path="limpieza" element={
          <ProtectedRoute requiredModule="limpieza">
            <DataCleaning />
          </ProtectedRoute>
        } />

        {/* Ventas */}
        <Route path="ventas" element={
          <ProtectedRoute requiredModule="ventas">
            <Sales />
          </ProtectedRoute>
        } />

        {/* Ofertas */}
        <Route path="ofertas" element={
          <ProtectedRoute requiredModule="ofertas">
            <Offers />
          </ProtectedRoute>
        } />

        {/* Reportes */}
        <Route path="reportes" element={
          <ProtectedRoute requiredModule="reportes">
            <Reports />
          </ProtectedRoute>
        } />

        {/* Administración — solo admins */}
        <Route path="administracion" element={
          <ProtectedRoute adminOnly>
            <Administration />
          </ProtectedRoute>
        } />
      </Route>

      {/* Público */}
      <Route element={<Mainlayout />}>
        <Route path="/inicio" element={<Home />} />
        <Route path="/nosotros" element={<About />} />
        <Route path="/servicios" element={<Service />} />
        <Route path="/contacto" element={<Contact />} />
      </Route>

      {/* Raíz y no encontradas */}
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
