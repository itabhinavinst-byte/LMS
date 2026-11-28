import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';
import type { Course, InstituteSettings } from '../types';
import { useRealtime } from './RealtimeContext';

interface SiteContextValue {
  settings: InstituteSettings | null;
  courses: Course[];
  loading: boolean;
  refreshSite: () => Promise<void>;
  refreshCourses: () => Promise<void>;
}

const SiteContext = createContext<SiteContextValue | null>(null);

export function SiteProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<InstituteSettings | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshSite = useCallback(async () => {
    try {
      const data = await apiRequest<{ settings: InstituteSettings }>('/api/public/settings', { token: null });
      setSettings(data.settings);
      if (data.settings.website_title) {
        document.title = data.settings.website_title;
      }
      if (data.settings.favicon_url) {
        let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
        if (!link) {
          link = document.createElement('link');
          link.rel = 'icon';
          document.head.appendChild(link);
        }
        link.href = data.settings.favicon_url;
      }
    } catch {
      // Keep previous settings on transient error
    }
  }, []);

  const refreshCourses = useCallback(async () => {
    try {
      const data = await apiRequest<{ courses: Course[] }>('/api/public/courses', { token: null });
      setCourses(data.courses);
    } catch {
      // Keep previous list on transient error
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      await Promise.all([refreshSite(), refreshCourses()]);
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [refreshSite, refreshCourses]);

  useRealtime(['settings:updated'], () => {
    refreshSite();
  });

  useRealtime(['courses:changed'], () => {
    refreshCourses();
  });

  return (
    <SiteContext.Provider value={{ settings, courses, loading, refreshSite, refreshCourses }}>
      {children}
    </SiteContext.Provider>
  );
}

export function useSite(): SiteContextValue {
  const ctx = useContext(SiteContext);
  if (!ctx) throw new Error('useSite must be used inside SiteProvider');
  return ctx;
}
