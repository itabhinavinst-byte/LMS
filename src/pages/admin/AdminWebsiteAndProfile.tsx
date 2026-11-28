import React, { useEffect, useState } from 'react';
import { ExternalLink, Plus, Save, Trash2, Upload } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSite } from '../../context/SiteContext';
import { apiRequest } from '../../lib/api';
import { AitMLogo, SafeImage } from '../../components/BrandMark';
import type { InstituteSettings } from '../../types';

export function AdminWebsiteAndProfile({ mode }: { mode: 'website' | 'profile' }) {
  const { settings, refreshSite } = useSite();
  const [form, setForm] = useState<InstituteSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (settings) {
      setForm(JSON.parse(JSON.stringify(settings)));
    }
  }, [settings]);

  if (!form) {
    return <div className="p-8 text-sm text-slate-500">Loading institute configuration...</div>;
  }

  const handleImageUpload = async (field: keyof InstituteSettings, file: File) => {
    setUploadingField(String(field));
    setFeedback(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiRequest<{ url: string }>('/api/admin/upload/public', {
        method: 'POST',
        formData: fd,
      });
      setForm((prev) => (prev ? { ...prev, [field]: res.url } : prev));
      setFeedback({ type: 'success', text: 'Image uploaded. Click "Save & Publish Changes" to push live.' });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Upload failed.' });
    } finally {
      setUploadingField(null);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      await apiRequest('/api/admin/settings', {
        method: 'PUT',
        body: form,
      });
      await refreshSite();
      setFeedback({
        type: 'success',
        text: 'Changes saved to database and published immediately across the public website.',
      });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Unable to save changes.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display font-bold text-xl text-slate-950">
            {mode === 'website' ? 'Website Management (Live CMS)' : 'Institute Profile & Accreditations'}
          </h2>
          <p className="text-sm text-slate-600">
            {mode === 'website'
              ? 'Edit website branding, hero section, About Us, logo, banners, footer, and social links. All updates sync instantly.'
              : 'Manage official AITM contact details, leadership roster, ISO certifications, and NSDC/SSC affiliations.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Preview Public Site
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Publishing...' : 'Save & Publish Changes'}
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-lg text-sm border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : 'bg-red-50 text-red-900 border-red-200'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {mode === 'website' ? (
        <div className="space-y-6">
          {/* Branding & Logos */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <h3 className="font-display font-semibold text-base text-slate-950">
              Branding, Title & Visual Assets
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Website Title</label>
                <input
                  type="text"
                  value={form.website_title}
                  onChange={(e) => setForm({ ...form, website_title: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Institute Short Name</label>
                <input
                  type="text"
                  value={form.short_name}
                  onChange={(e) => setForm({ ...form, short_name: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Full Institute Name</label>
                <input
                  type="text"
                  value={form.institute_name}
                  onChange={(e) => setForm({ ...form, institute_name: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Tagline</label>
                <input
                  type="text"
                  value={form.tagline}
                  onChange={(e) => setForm({ ...form, tagline: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-2">
              {/* Logo Upload */}
              <div className="p-4 border border-slate-200 rounded-lg space-y-3">
                <div className="text-xs font-semibold text-slate-700">Institute Logo</div>
                <div className="flex items-center gap-3">
                  <AitMLogo logoUrl={form.logo_url} shortName={form.short_name} className="h-12 w-12" />
                  <div className="space-y-1.5">
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      {uploadingField === 'logo_url' ? 'Uploading...' : 'Upload Logo'}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleImageUpload('logo_url', f);
                        }}
                      />
                    </label>
                    {form.logo_url && (
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, logo_url: '' })}
                        className="block text-xs text-red-600 hover:underline cursor-pointer"
                      >
                        Reset to Default Crest
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Favicon Upload */}
              <div className="p-4 border border-slate-200 rounded-lg space-y-3">
                <div className="text-xs font-semibold text-slate-700">Browser Favicon</div>
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-lg border border-slate-200 flex items-center justify-center bg-slate-50 overflow-hidden">
                    {form.favicon_url ? (
                      <img src={form.favicon_url} alt="Favicon" className="w-8 h-8 object-contain" />
                    ) : (
                      <span className="text-xs text-slate-400">Default</span>
                    )}
                  </div>
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    {uploadingField === 'favicon_url' ? 'Uploading...' : 'Upload Favicon'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleImageUpload('favicon_url', f);
                      }}
                    />
                  </label>
                </div>
              </div>

              {/* Hero Banner Upload */}
              <div className="p-4 border border-slate-200 rounded-lg space-y-3">
                <div className="text-xs font-semibold text-slate-700">Hero Banner Image</div>
                <div className="flex items-center gap-3">
                  <div className="h-12 w-20 rounded border border-slate-200 overflow-hidden bg-slate-50 shrink-0">
                    <SafeImage src={form.hero_banner_url} alt="Hero Banner" className="w-full h-full object-cover" />
                  </div>
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    {uploadingField === 'hero_banner_url' ? 'Uploading...' : 'Change Banner'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleImageUpload('hero_banner_url', f);
                      }}
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Hero & About Content */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h3 className="font-display font-semibold text-base text-slate-950">
              Hero Section, About Us, Vision & Mission
            </h3>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Hero Heading</label>
              <input
                type="text"
                value={form.hero_heading}
                onChange={(e) => setForm({ ...form, hero_heading: e.target.value })}
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Hero Description</label>
              <textarea
                rows={2}
                value={form.hero_description}
                onChange={(e) => setForm({ ...form, hero_description: e.target.value })}
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">About Us Content</label>
              <textarea
                rows={4}
                value={form.about_us}
                onChange={(e) => setForm({ ...form, about_us: e.target.value })}
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Vision</label>
                <textarea
                  rows={3}
                  value={form.vision}
                  onChange={(e) => setForm({ ...form, vision: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Mission</label>
                <textarea
                  rows={3}
                  value={form.mission}
                  onChange={(e) => setForm({ ...form, mission: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>
          </div>

          {/* Footer & Social Links */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h3 className="font-display font-semibold text-base text-slate-950">
              Footer & Social Media Links
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Footer Description</label>
                <input
                  type="text"
                  value={form.footer_text}
                  onChange={(e) => setForm({ ...form, footer_text: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Copyright Text</label>
                <input
                  type="text"
                  value={form.copyright_text}
                  onChange={(e) => setForm({ ...form, copyright_text: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              {(['website', 'linkedin', 'facebook', 'instagram', 'youtube'] as const).map((net) => (
                <div key={net}>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5 capitalize">
                    {net} URL
                  </label>
                  <input
                    type="url"
                    value={form.social_links?.[net] || ''}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        social_links: { ...form.social_links, [net]: e.target.value },
                      })
                    }
                    placeholder="https://..."
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Official Contact Details */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h3 className="font-display font-semibold text-base text-slate-950">
              Official Contact Information & Map
            </h3>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Office Address</label>
              <textarea
                rows={2}
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Primary Phone</label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Alternate Phone</label>
                <input
                  type="text"
                  value={form.alt_phone}
                  onChange={(e) => setForm({ ...form, alt_phone: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Official Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Embedded Map URL (Google Maps / OpenStreetMap iframe src)
              </label>
              <input
                type="url"
                value={form.map_embed_url}
                onChange={(e) => setForm({ ...form, map_embed_url: e.target.value })}
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          {/* Chairman & Management */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h3 className="font-display font-semibold text-base text-slate-950">
              Chairman & Management Leadership
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Chairman / Leadership Heading
                </label>
                <input
                  type="text"
                  value={form.chairman_name}
                  onChange={(e) => setForm({ ...form, chairman_name: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Designation</label>
                <input
                  type="text"
                  value={form.chairman_designation}
                  onChange={(e) => setForm({ ...form, chairman_designation: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Leadership Message</label>
              <textarea
                rows={3}
                value={form.chairman_message}
                onChange={(e) => setForm({ ...form, chairman_message: e.target.value })}
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div className="pt-2 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">Management / Board Members</span>
                <button
                  type="button"
                  onClick={() =>
                    setForm({
                      ...form,
                      management: [...form.management, { name: '', designation: '', bio: '' }],
                    })
                  }
                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Member
                </button>
              </div>
              {form.management.map((m, idx) => (
                <div key={idx} className="p-4 border border-slate-200 rounded-lg space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      type="text"
                      placeholder="Full Name"
                      value={m.name}
                      onChange={(e) => {
                        const next = [...form.management];
                        next[idx] = { ...next[idx], name: e.target.value };
                        setForm({ ...form, management: next });
                      }}
                      className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Designation"
                        value={m.designation}
                        onChange={(e) => {
                          const next = [...form.management];
                          next[idx] = { ...next[idx], designation: e.target.value };
                          setForm({ ...form, management: next });
                        }}
                        className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setForm({
                            ...form,
                            management: form.management.filter((_, i) => i !== idx),
                          })
                        }
                        className="p-2 text-slate-400 hover:text-red-600 cursor-pointer"
                        aria-label="Remove member"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <textarea
                    rows={2}
                    placeholder="Short leadership bio"
                    value={m.bio}
                    onChange={(e) => {
                      const next = [...form.management];
                      next[idx] = { ...next[idx], bio: e.target.value };
                      setForm({ ...form, management: next });
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Certifications & Affiliations */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display font-semibold text-base text-slate-950">Certifications</h3>
                <button
                  type="button"
                  onClick={() =>
                    setForm({
                      ...form,
                      certifications: [...form.certifications, { title: '', issuer: '', description: '' }],
                    })
                  }
                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </div>
              {form.certifications.map((cert, idx) => (
                <div key={idx} className="p-3.5 border border-slate-200 rounded-lg space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Certification Title"
                      value={cert.title}
                      onChange={(e) => {
                        const next = [...form.certifications];
                        next[idx] = { ...next[idx], title: e.target.value };
                        setForm({ ...form, certifications: next });
                      }}
                      className="flex-1 px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setForm({
                          ...form,
                          certifications: form.certifications.filter((_, i) => i !== idx),
                        })
                      }
                      className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Issuing Body"
                    value={cert.issuer}
                    onChange={(e) => {
                      const next = [...form.certifications];
                      next[idx] = { ...next[idx], issuer: e.target.value };
                      setForm({ ...form, certifications: next });
                    }}
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                  />
                  <textarea
                    rows={2}
                    placeholder="Description"
                    value={cert.description}
                    onChange={(e) => {
                      const next = [...form.certifications];
                      next[idx] = { ...next[idx], description: e.target.value };
                      setForm({ ...form, certifications: next });
                    }}
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
              ))}
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display font-semibold text-base text-slate-950">Affiliations</h3>
                <button
                  type="button"
                  onClick={() =>
                    setForm({
                      ...form,
                      affiliations: [...form.affiliations, { name: '', role: '' }],
                    })
                  }
                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </div>
              {form.affiliations.map((aff, idx) => (
                <div key={idx} className="p-3.5 border border-slate-200 rounded-lg space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Organization / Scheme Name"
                      value={aff.name}
                      onChange={(e) => {
                        const next = [...form.affiliations];
                        next[idx] = { ...next[idx], name: e.target.value };
                        setForm({ ...form, affiliations: next });
                      }}
                      className="flex-1 px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setForm({
                          ...form,
                          affiliations: form.affiliations.filter((_, i) => i !== idx),
                        })
                      }
                      className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Affiliation Role"
                    value={aff.role}
                    onChange={(e) => {
                      const next = [...form.affiliations];
                      next[idx] = { ...next[idx], role: e.target.value };
                      setForm({ ...form, affiliations: next });
                    }}
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
