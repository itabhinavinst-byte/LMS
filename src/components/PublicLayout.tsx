import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useSite } from '../context/SiteContext';
import { AitMLogo } from './BrandMark';

export function PublicHeader() {
  const { settings } = useSite();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const handleAnchor = (hash: string) => {
    setMobileOpen(false);
    if (location.pathname !== '/') {
      navigate(`/${hash}`);
      setTimeout(() => {
        const el = document.querySelector(hash);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 120);
      return;
    }
    const el = document.querySelector(hash);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single-line Brand Identity */}
        <Link
          to="/"
          className="flex items-center gap-3 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 rounded"
        >
          <AitMLogo
            logoUrl={settings?.logo_url}
            shortName={settings?.short_name || 'AITM'}
            className="h-9 w-9"
          />
          <span className="font-display font-bold text-base sm:text-lg tracking-tight text-slate-900 whitespace-nowrap">
            {settings?.short_name || 'AITM'}
          </span>
        </Link>

        {/* Zone 2: Clean Single-Line Navigation Links */}
        <nav className="hidden lg:flex items-center gap-7 text-sm font-medium text-slate-600">
          <Link
            to="/"
            className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
          >
            Home
          </Link>
          <button
            type="button"
            onClick={() => handleAnchor('#about')}
            className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            About Us
          </button>
          <button
            type="button"
            onClick={() => handleAnchor('#courses')}
            className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Courses
          </button>
          <button
            type="button"
            onClick={() => handleAnchor('#leadership')}
            className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Management
          </button>
          <button
            type="button"
            onClick={() => handleAnchor('#contact')}
            className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Contact Us
          </button>
          <Link
            to="/login"
            className="hover:text-blue-700 text-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            Student Login
          </Link>
        </nav>

        {/* Zone 3: Single Primary Action */}
        <div className="hidden lg:flex items-center shrink-0">
          <Link
            to="/apply"
            className="px-4 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            Apply Now
          </Link>
        </div>

        {/* Mobile menu trigger */}
        <button
          type="button"
          aria-label="Toggle navigation menu"
          onClick={() => setMobileOpen((v) => !v)}
          className="lg:hidden p-2 rounded-lg text-slate-700 hover:bg-slate-100"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="lg:hidden bg-white border-b border-slate-200 px-4 py-4 space-y-1">
          <Link
            to="/"
            onClick={() => setMobileOpen(false)}
            className="block px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 rounded-lg"
          >
            Home
          </Link>
          <button
            type="button"
            onClick={() => handleAnchor('#about')}
            className="block w-full text-left px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 rounded-lg"
          >
            About Us
          </button>
          <button
            type="button"
            onClick={() => handleAnchor('#courses')}
            className="block w-full text-left px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 rounded-lg"
          >
            Courses
          </button>
          <button
            type="button"
            onClick={() => handleAnchor('#leadership')}
            className="block w-full text-left px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 rounded-lg"
          >
            Management
          </button>
          <button
            type="button"
            onClick={() => handleAnchor('#contact')}
            className="block w-full text-left px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 rounded-lg"
          >
            Contact Us
          </button>
          <Link
            to="/login"
            onClick={() => setMobileOpen(false)}
            className="block px-3 py-2.5 text-sm font-medium text-slate-900 hover:bg-slate-50 rounded-lg"
          >
            Student Login
          </Link>
          <div className="pt-2">
            <Link
              to="/apply"
              onClick={() => setMobileOpen(false)}
              className="block w-full text-center px-4 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
            >
              Apply Now
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

export function PublicFooter() {
  const { settings, courses } = useSite();

  return (
    <footer className="bg-slate-950 text-slate-300 border-t border-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <AitMLogo
                logoUrl={settings?.logo_url}
                shortName={settings?.short_name || 'AITM'}
                className="h-9 w-9"
              />
              <span className="font-display font-bold text-white text-base leading-snug">
                {settings?.institute_name || 'Abhinav Institute of Technology & Management'}
              </span>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed">
              {settings?.footer_text ||
                'ISO 9001:2015 Certified Training & Skill Development Institute.'}
            </p>
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 pt-1">
              {settings?.social_links?.website && (
                <a
                  href={settings.social_links.website}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-white transition-colors"
                >
                  Official Site
                </a>
              )}
              {settings?.social_links?.linkedin && (
                <a
                  href={settings.social_links.linkedin}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-white transition-colors"
                >
                  LinkedIn
                </a>
              )}
              {settings?.social_links?.facebook && (
                <a
                  href={settings.social_links.facebook}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-white transition-colors"
                >
                  Facebook
                </a>
              )}
              {settings?.social_links?.instagram && (
                <a
                  href={settings.social_links.instagram}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-white transition-colors"
                >
                  Instagram
                </a>
              )}
              {settings?.social_links?.youtube && (
                <a
                  href={settings.social_links.youtube}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-white transition-colors"
                >
                  YouTube
                </a>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white mb-4">Quick Links</h3>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link to="/" className="hover:text-white transition-colors">
                  Home
                </Link>
              </li>
              <li>
                <Link to="/apply" className="hover:text-white transition-colors">
                  Online Application
                </Link>
              </li>
              <li>
                <Link to="/login" className="hover:text-white transition-colors">
                  Student Portal Login
                </Link>
              </li>
              <li>
                <Link to="/forgot-password" className="hover:text-white transition-colors">
                  Reset Student Password
                </Link>
              </li>
              <li>
                <Link to="/admin/login" className="hover:text-white transition-colors">
                  Administrator Login
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white mb-4">Published Programs</h3>
            <ul className="space-y-2.5 text-sm">
              {courses.slice(0, 6).map((course) => (
                <li key={course.id}>
                  <Link
                    to={`/courses/${course.id}`}
                    className="hover:text-white transition-colors line-clamp-1"
                  >
                    {course.name}
                  </Link>
                </li>
              ))}
              {courses.length === 0 && (
                <li className="text-slate-500">Programs updated dynamically by administration.</li>
              )}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white mb-4">Official Contact</h3>
            <div className="space-y-2.5 text-sm text-slate-400">
              <p className="leading-relaxed">{settings?.address}</p>
              <p className="font-mono text-slate-300">{settings?.phone}</p>
              {settings?.alt_phone && <p className="font-mono text-slate-400">{settings.alt_phone}</p>}
              <p>
                <a
                  href={`mailto:${settings?.email || 'aitm.connect@abhinavinst.com'}`}
                  className="text-blue-400 hover:text-blue-300 transition-colors"
                >
                  {settings?.email || 'aitm.connect@abhinavinst.com'}
                </a>
              </p>
            </div>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <p>{settings?.copyright_text || '© 2026 Abhinav Institute of Technology & Management (AITM). All rights reserved.'}</p>
          <p>ISO 9001:2015 Certified · NSDC & Sector Skill Council Aligned</p>
        </div>
      </div>
    </footer>
  );
}
