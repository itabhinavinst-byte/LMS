import React, { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  BookOpen,
  Building2,
  Calendar,
  ClipboardCheck,
  FileSpreadsheet,
  FileText,
  Globe,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Mail,
  Megaphone,
  Menu,
  Settings,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSite } from '../../context/SiteContext';
import { AitMLogo } from '../../components/BrandMark';
import { AdminOverview } from './AdminOverview';
import { AdminWebsiteAndProfile } from './AdminWebsiteAndProfile';
import { AdminCourses } from './AdminCourses';
import { AdminApplicationsAndEnrollments } from './AdminApplicationsAndEnrollments';
import { AdminExcelImport } from './AdminExcelImport';
import { AdminMaterials } from './AdminMaterials';
import { AdminOperations } from './AdminOperations';

const ADMIN_NAV = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'website', label: 'Website Management', icon: Globe },
  { id: 'profile', label: 'Institute Profile', icon: Building2 },
  { id: 'courses', label: 'Course Management', icon: BookOpen },
  { id: 'students', label: 'Student Management', icon: Users },
  { id: 'enrollments', label: 'Enrollment Management', icon: GraduationCap },
  { id: 'excel-import', label: 'Excel Student Import', icon: FileSpreadsheet },
  { id: 'materials', label: 'Learning Materials', icon: FileText },
  { id: 'applications', label: 'Applications', icon: ClipboardCheck },
  { id: 'announcements', label: 'Announcements', icon: Megaphone },
  { id: 'meetings', label: 'Meetings', icon: Calendar },
  { id: 'emails', label: 'Email Management', icon: Mail },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'settings', label: 'Admin Settings', icon: Settings },
] as const;

export function AdminDashboard() {
  const { user, logout } = useAuth();
  const { settings } = useSite();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<string>('overview');
  const [materialsCourseId, setMaterialsCourseId] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (!user || (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) {
    return <Navigate to="/admin/login" replace />;
  }

  const currentNav = ADMIN_NAV.find((n) => n.id === activeTab) || ADMIN_NAV[0];

  const handleLogout = async () => {
    await logout();
    navigate('/admin/login');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex text-slate-900">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar (14 items including Logout) */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-950 text-slate-300 flex flex-col transform transition-transform duration-200 lg:translate-x-0 lg:static ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-16 px-5 flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <AitMLogo
              logoUrl={settings?.logo_url}
              shortName={settings?.short_name || 'AITM'}
              className="h-8 w-8"
            />
            <span className="font-display font-bold text-white text-sm truncate">
              {settings?.short_name || 'AITM'} Admin
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {ADMIN_NAV.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  setSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  active
                    ? 'bg-blue-700 text-white'
                    : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-800 shrink-0">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-900 hover:text-white transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Viewport */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 h-16 bg-white border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-sm font-medium text-slate-500 truncate">
              <span>Admin Console</span>
              <span className="mx-2 text-slate-300">/</span>
              <span className="font-semibold text-slate-950">{currentNav.label}</span>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <Link
              to="/"
              className="text-xs font-medium text-slate-600 hover:text-blue-700 whitespace-nowrap"
            >
              View Public Website
            </Link>
            <div className="hidden sm:block text-right">
              <div className="text-xs font-semibold text-slate-900">{user.full_name}</div>
              <div className="text-[11px] font-mono text-slate-500">{user.role}</div>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-8 max-w-[1400px] w-full mx-auto">
          {activeTab === 'overview' && <AdminOverview onNavigate={setActiveTab} />}
          {activeTab === 'website' && <AdminWebsiteAndProfile mode="website" />}
          {activeTab === 'profile' && <AdminWebsiteAndProfile mode="profile" />}
          {activeTab === 'courses' && (
            <AdminCourses
              onOpenMaterials={(courseId) => {
                setMaterialsCourseId(courseId);
                setActiveTab('materials');
              }}
            />
          )}
          {activeTab === 'students' && <AdminApplicationsAndEnrollments section="students" />}
          {activeTab === 'enrollments' && <AdminApplicationsAndEnrollments section="enrollments" />}
          {activeTab === 'excel-import' && (
            <AdminExcelImport onGoToCourses={() => setActiveTab('courses')} />
          )}
          {activeTab === 'materials' && <AdminMaterials initialCourseId={materialsCourseId} />}
          {activeTab === 'applications' && <AdminApplicationsAndEnrollments section="applications" />}
          {activeTab === 'announcements' && <AdminOperations section="announcements" />}
          {activeTab === 'meetings' && <AdminOperations section="meetings" />}
          {activeTab === 'emails' && <AdminOperations section="emails" />}
          {activeTab === 'reports' && <AdminOperations section="reports" />}
          {activeTab === 'settings' && <AdminOperations section="settings" />}
        </main>
      </div>
    </div>
  );
}
