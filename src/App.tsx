import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { RealtimeProvider } from './context/RealtimeContext';
import { SiteProvider } from './context/SiteContext';
import { PublicHome } from './pages/PublicHome';
import { CourseDetailPage } from './pages/CourseDetailPage';
import { ApplyPage } from './pages/ApplyPage';
import { StudentLoginPage } from './pages/StudentLoginPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { AdminLoginPage } from './pages/AdminLoginPage';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { StudentDashboard } from './pages/student/StudentDashboard';

export default function App() {
  return (
    <BrowserRouter>
      <RealtimeProvider>
        <AuthProvider>
          <SiteProvider>
            <Routes>
              <Route path="/" element={<PublicHome />} />
              <Route path="/courses/:id" element={<CourseDetailPage />} />
              <Route path="/apply" element={<ApplyPage />} />
              <Route path="/login" element={<StudentLoginPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/student/dashboard" element={<StudentDashboard />} />
              <Route path="/admin/login" element={<AdminLoginPage />} />
              <Route path="/admin/dashboard" element={<AdminDashboard />} />
              <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </SiteProvider>
        </AuthProvider>
      </RealtimeProvider>
    </BrowserRouter>
  );
}
