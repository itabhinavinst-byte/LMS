import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Award,
  CheckCircle2,
  Clock,
  Mail,
  MapPin,
  Phone,
  Search,
  Send,
} from 'lucide-react';
import { PublicFooter, PublicHeader } from '../components/PublicLayout';
import { SafeImage } from '../components/BrandMark';
import { useSite } from '../context/SiteContext';
import { apiRequest } from '../lib/api';

export function PublicHome() {
  const { settings, courses, loading } = useSite();
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  const [contactForm, setContactForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    subject: '',
    message: '',
  });
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const [contactFeedback, setContactFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const categories = useMemo(() => {
    const unique = Array.from(new Set(courses.map((c) => c.category).filter(Boolean)));
    return ['All', ...unique];
  }, [courses]);

  const filteredCourses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return courses.filter((c) => {
      const catMatch = selectedCategory === 'All' || c.category === selectedCategory;
      const searchMatch =
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.short_description.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q);
      return catMatch && searchMatch;
    });
  }, [courses, selectedCategory, searchQuery]);

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setContactFeedback(null);
    setContactSubmitting(true);
    try {
      const res = await apiRequest<{ message: string }>('/api/public/contact', {
        method: 'POST',
        body: contactForm,
        token: null,
      });
      setContactFeedback({ type: 'success', text: res.message });
      setContactForm({ full_name: '', email: '', phone: '', subject: '', message: '' });
    } catch (err) {
      setContactFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to send inquiry right now.',
      });
    } finally {
      setContactSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900">
      <PublicHeader />

      <main className="flex-1">
        {/* HERO SECTION */}
        <section className="border-b border-slate-200 bg-slate-50/70">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-20">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
              <div className="lg:col-span-6 flex flex-col justify-center">
                <p className="text-xs font-medium text-blue-700 tracking-wide mb-3">
                  {settings?.institute_name || 'Abhinav Institute of Technology & Management'} · ISO 9001:2015 Certified
                </p>
                <h1 className="font-display font-bold text-slate-950 tracking-tight leading-[1.12] text-[clamp(2.15rem,3.6vw,3.4rem)]">
                  {settings?.hero_heading ||
                    'Building Industry-Ready Careers Through Practical Technology & Skill Training'}
                </h1>
                <p className="mt-5 text-base text-slate-600 leading-relaxed max-w-xl">
                  {settings?.hero_description ||
                    'Abhinav Institute of Technology & Management (AITM) is an ISO 9001:2015 certified training institute affiliated with NSDC and Sector Skill Councils.'}
                </p>

                <div className="mt-8 flex flex-wrap items-center gap-4">
                  <Link
                    to="/apply"
                    className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    Apply Now
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                  <a
                    href="#courses"
                    className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-slate-800 bg-white border border-slate-300 hover:border-slate-400 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    Explore Courses
                  </a>
                </div>

                <div className="mt-8 pt-6 border-t border-slate-200 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
                  <span>NSDC & Sector Skill Council Aligned</span>
                  <span aria-hidden="true">·</span>
                  <span>NAPS & NATS Apprenticeship Partner</span>
                  <span aria-hidden="true">·</span>
                  <span>Thane West Headquarters</span>
                </div>
              </div>

              <div className="lg:col-span-6">
                <div className="h-full min-h-[300px] lg:min-h-[420px] rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                  <SafeImage
                    src={settings?.hero_banner_url}
                    alt={settings?.institute_name || 'AITM Training Campus'}
                    fallbackTitle="Abhinav Institute of Technology & Management"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            </div>

            {/* Full-width 4-column institutional proof strip */}
            <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border border-slate-200 rounded-xl bg-white divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
              {(settings?.achievements || []).slice(0, 4).map((item, idx) => (
                <div key={idx} className="p-5">
                  <div className="font-display font-bold text-slate-900 text-base">
                    {item.label}
                  </div>
                  <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* COURSES SECTION (100% DATABASE-DRIVEN) */}
        <section id="courses" className="py-16 lg:py-24 bg-white border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
              <div>
                <p className="text-xs font-medium text-blue-700 mb-2">
                  Academic & Skill Programs
                </p>
                <h2 className="font-display font-bold text-2xl sm:text-3xl text-slate-950 tracking-tight">
                  Available Courses at {settings?.short_name || 'AITM'}
                </h2>
                <p className="mt-2 text-sm text-slate-600 max-w-2xl">
                  All programs listed below are published directly from the institute registry with verified training durations, eligibility criteria, and structured modules.
                </p>
              </div>

              <div className="relative w-full lg:w-72">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search courses or codes..."
                  className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700/20 focus:border-blue-700"
                />
              </div>
            </div>

            {/* Interactive Category Filter Controls */}
            {categories.length > 1 && (
              <div className="mt-6 flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-lg w-fit">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      selectedCategory === cat
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}

            {loading ? (
              <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="border border-slate-200 rounded-xl overflow-hidden animate-pulse">
                    <div className="h-48 bg-slate-100" />
                    <div className="p-6 space-y-3">
                      <div className="h-3 bg-slate-100 rounded w-1/2" />
                      <div className="h-5 bg-slate-200 rounded w-3/4" />
                      <div className="h-12 bg-slate-100 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredCourses.length === 0 ? (
              <div className="mt-10 border border-slate-200 rounded-xl p-12 text-center bg-slate-50">
                <p className="font-display font-semibold text-slate-900">No matching courses found</p>
                <p className="mt-1 text-sm text-slate-600">
                  Try clearing your search filter or check back as new batches are published.
                </p>
                {(searchQuery || selectedCategory !== 'All') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedCategory('All');
                    }}
                    className="mt-4 px-4 py-2 text-xs font-semibold text-blue-700 border border-blue-200 bg-white rounded-lg hover:bg-blue-50"
                  >
                    Reset Filters
                  </button>
                )}
              </div>
            ) : (
              <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
                {filteredCourses.map((course) => (
                  <article
                    key={course.id}
                    className="flex flex-col border border-slate-200 rounded-xl overflow-hidden bg-white hover:border-slate-300 transition-colors"
                  >
                    <div className="aspect-[4/3] bg-slate-100 overflow-hidden border-b border-slate-100">
                      <SafeImage
                        src={course.image_url}
                        alt={course.name}
                        fallbackTitle={course.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="p-6 flex-1 flex flex-col">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                        <span className="font-medium text-blue-700">{course.category}</span>
                        <span aria-hidden="true">·</span>
                        <span>{course.mode}</span>
                        <span aria-hidden="true">·</span>
                        <span>{course.level}</span>
                      </div>

                      <h3 className="mt-2 font-display font-bold text-lg text-slate-950 leading-snug">
                        {course.name}
                      </h3>

                      <p className="mt-2 text-sm text-slate-600 leading-relaxed line-clamp-3">
                        {course.short_description}
                      </p>

                      <dl className="mt-5 pt-4 border-t border-slate-100 space-y-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <dt className="text-slate-500 flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            Duration
                          </dt>
                          <dd className="font-medium text-slate-900 tabular-nums">
                            {course.duration_display}
                            {course.total_training_hours > 0 ? ` (${course.total_training_hours} hrs)` : ''}
                          </dd>
                        </div>
                        <div className="flex items-start justify-between gap-3">
                          <dt className="text-slate-500 shrink-0">Eligibility</dt>
                          <dd className="text-slate-700 text-right line-clamp-2">{course.eligibility}</dd>
                        </div>
                      </dl>

                      <div className="mt-6 pt-4 border-t border-slate-100 flex items-center gap-3">
                        <Link
                          to={`/apply?course=${course.id}`}
                          className="flex-1 text-center px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap"
                        >
                          Apply Now
                        </Link>
                        <Link
                          to={`/courses/${course.id}`}
                          className="flex-1 text-center px-4 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
                        >
                          View Details
                        </Link>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ABOUT AITM, VISION, MISSION, CERTIFICATIONS & AFFILIATIONS */}
        <section id="about" className="py-16 lg:py-24 bg-slate-50/60 border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-stretch">
              <div className="lg:col-span-5">
                <div className="h-full min-h-[280px] rounded-xl overflow-hidden border border-slate-200 bg-white">
                  <SafeImage
                    src={settings?.about_image_url}
                    alt="AITM Vocational and Technology Training Lab"
                    fallbackTitle="AITM Training Facilities"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>

              <div className="lg:col-span-7 flex flex-col justify-center">
                <p className="text-xs font-medium text-blue-700 mb-2">About the Institute</p>
                <h2 className="font-display font-bold text-2xl sm:text-3xl text-slate-950 tracking-tight">
                  {settings?.institute_name || 'Abhinav Institute of Technology & Management'}
                </h2>
                <p className="mt-4 text-sm sm:text-base text-slate-600 leading-relaxed whitespace-pre-line">
                  {settings?.about_us}
                </p>

                <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="p-5 bg-white border border-slate-200 rounded-xl">
                    <h3 className="font-display font-semibold text-base text-slate-950">Our Vision</h3>
                    <p className="mt-2 text-sm text-slate-600 leading-relaxed">{settings?.vision}</p>
                  </div>
                  <div className="p-5 bg-white border border-slate-200 rounded-xl">
                    <h3 className="font-display font-semibold text-base text-slate-950">Our Mission</h3>
                    <p className="mt-2 text-sm text-slate-600 leading-relaxed">{settings?.mission}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Certifications & Affiliations */}
            <div className="mt-16 grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
                <div className="flex items-center gap-2.5 mb-5">
                  <Award className="w-5 h-5 text-blue-700" />
                  <h3 className="font-display font-bold text-lg text-slate-950">
                    ISO & Quality Certifications
                  </h3>
                </div>
                <div className="divide-y divide-slate-100">
                  {(settings?.certifications || []).map((cert, idx) => (
                    <div key={idx} className="py-4 first:pt-0 last:pb-0">
                      <div className="font-semibold text-sm text-slate-900">{cert.title}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{cert.issuer}</div>
                      <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">{cert.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
                <div className="flex items-center gap-2.5 mb-5">
                  <CheckCircle2 className="w-5 h-5 text-blue-700" />
                  <h3 className="font-display font-bold text-lg text-slate-950">
                    NSDC, Sector Skill Councils & Schemes
                  </h3>
                </div>
                <div className="divide-y divide-slate-100">
                  {(settings?.affiliations || []).map((aff, idx) => (
                    <div key={idx} className="py-3.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <span className="font-medium text-sm text-slate-900">{aff.name}</span>
                      <span className="text-xs text-slate-500">{aff.role}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* LEADERSHIP & MANAGEMENT SECTION */}
        <section id="leadership" className="py-16 lg:py-24 bg-white border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <p className="text-xs font-medium text-blue-700 mb-2">Governance & Leadership</p>
              <h2 className="font-display font-bold text-2xl sm:text-3xl text-slate-950 tracking-tight">
                {settings?.chairman_name || 'AITM Leadership & Management'}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {settings?.chairman_designation}
              </p>
            </div>

            {settings?.chairman_message && (
              <div className="mt-8 p-6 sm:p-8 bg-slate-50 border border-slate-200 rounded-xl">
                <p className="text-base text-slate-700 leading-relaxed max-w-4xl">
                  “{settings.chairman_message}”
                </p>
              </div>
            )}

            {(settings?.management || []).length > 0 && (
              <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6">
                {settings!.management.map((member, idx) => (
                  <div
                    key={idx}
                    className="p-6 border border-slate-200 rounded-xl bg-white flex flex-col justify-between"
                  >
                    <div>
                      <h3 className="font-display font-bold text-lg text-slate-950">{member.name}</h3>
                      <p className="text-xs font-medium text-blue-700 mt-1">{member.designation}</p>
                      <p className="mt-3 text-sm text-slate-600 leading-relaxed">{member.bio}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* CONTACT & LOCATION SECTION */}
        <section id="contact" className="py-16 lg:py-24 bg-slate-50/70">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
              <div className="lg:col-span-5 space-y-6">
                <div>
                  <p className="text-xs font-medium text-blue-700 mb-2">Admissions & Counseling</p>
                  <h2 className="font-display font-bold text-2xl sm:text-3xl text-slate-950 tracking-tight">
                    Contact {settings?.short_name || 'AITM'}
                  </h2>
                  <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                    Reach our Thane West headquarters for course counseling, corporate apprenticeship partnerships, or student portal support.
                  </p>
                </div>

                <div className="space-y-4 text-sm">
                  <div className="flex items-start gap-3">
                    <MapPin className="w-4 h-4 text-blue-700 mt-1 shrink-0" />
                    <div>
                      <div className="font-semibold text-slate-900">Head Office Address</div>
                      <p className="text-slate-600 mt-0.5 leading-relaxed">{settings?.address}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Phone className="w-4 h-4 text-blue-700 mt-1 shrink-0" />
                    <div>
                      <div className="font-semibold text-slate-900">Official Phone</div>
                      <p className="text-slate-600 mt-0.5 font-mono">
                        {settings?.phone}
                        {settings?.alt_phone ? ` · ${settings.alt_phone}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Mail className="w-4 h-4 text-blue-700 mt-1 shrink-0" />
                    <div>
                      <div className="font-semibold text-slate-900">Official Email</div>
                      <p className="mt-0.5">
                        <a
                          href={`mailto:${settings?.email}`}
                          className="text-blue-700 hover:underline"
                        >
                          {settings?.email}
                        </a>
                      </p>
                    </div>
                  </div>
                </div>

                {settings?.map_embed_url && (
                  <div className="rounded-xl overflow-hidden border border-slate-200 bg-white h-56">
                    <iframe
                      title="AITM Office Location Map"
                      src={settings.map_embed_url}
                      className="w-full h-full border-0"
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                    />
                  </div>
                )}
              </div>

              <div className="lg:col-span-7">
                <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
                  <h3 className="font-display font-bold text-xl text-slate-950">Send an Inquiry</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Have a question about eligibility, training schedules, or NAPS/NATS programs? Submit the form below.
                  </p>

                  {contactFeedback && (
                    <div
                      className={`mt-5 p-3.5 rounded-lg text-sm border ${
                        contactFeedback.type === 'success'
                          ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                          : 'bg-red-50 text-red-900 border-red-200'
                      }`}
                    >
                      {contactFeedback.text}
                    </div>
                  )}

                  <form onSubmit={handleContactSubmit} className="mt-6 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">
                          Full Name *
                        </label>
                        <input
                          type="text"
                          required
                          value={contactForm.full_name}
                          onChange={(e) => setContactForm({ ...contactForm, full_name: e.target.value })}
                          className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700/20 focus:border-blue-700"
                          placeholder="Your full name"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">
                          Email Address *
                        </label>
                        <input
                          type="email"
                          required
                          value={contactForm.email}
                          onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                          className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700/20 focus:border-blue-700"
                          placeholder="name@example.com"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">
                          Mobile Number
                        </label>
                        <input
                          type="tel"
                          value={contactForm.phone}
                          onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                          className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700/20 focus:border-blue-700"
                          placeholder="+91 98XXXXXXXX"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">
                          Subject
                        </label>
                        <input
                          type="text"
                          value={contactForm.subject}
                          onChange={(e) => setContactForm({ ...contactForm, subject: e.target.value })}
                          className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700/20 focus:border-blue-700"
                          placeholder="Course Admissions / Partnership"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">
                        Message *
                      </label>
                      <textarea
                        rows={4}
                        required
                        value={contactForm.message}
                        onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                        className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700/20 focus:border-blue-700"
                        placeholder="Share your inquiry or preferred program..."
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={contactSubmitting}
                      className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
                    >
                      <Send className="w-4 h-4" />
                      {contactSubmitting ? 'Sending...' : 'Submit Inquiry'}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
