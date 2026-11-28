import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Award, BookOpen, Calendar, Clock, GraduationCap, Monitor } from 'lucide-react';
import { PublicFooter, PublicHeader } from '../components/PublicLayout';
import { SafeImage } from '../components/BrandMark';
import { apiRequest, formatDateShort } from '../lib/api';
import { useRealtime } from '../context/RealtimeContext';
import type { Course, CourseModule } from '../types';

export function CourseDetailPage() {
  const { id } = useParams();
  const [course, setCourse] = useState<Course | null>(null);
  const [modules, setModules] = useState<CourseModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadCourse = async () => {
    if (!id) return;
    try {
      const data = await apiRequest<{ course: Course; modules: CourseModule[] }>(
        `/api/public/courses/${id}`,
        { token: null }
      );
      setCourse(data.course);
      setModules(data.modules);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Course not found.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCourse();
  }, [id]);

  useRealtime(['courses:changed', 'modules:changed'], () => {
    loadCourse();
  });

  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900">
      <PublicHeader />
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-14">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to All Courses
        </Link>

        {loading ? (
          <div className="border border-slate-200 rounded-xl p-10 animate-pulse space-y-4">
            <div className="h-7 bg-slate-200 rounded w-1/2" />
            <div className="h-4 bg-slate-100 rounded w-3/4" />
            <div className="h-64 bg-slate-100 rounded" />
          </div>
        ) : error || !course ? (
          <div className="border border-slate-200 rounded-xl p-12 text-center">
            <h1 className="font-display font-bold text-xl text-slate-900">Course Unavailable</h1>
            <p className="mt-2 text-sm text-slate-600">{error || 'This course is no longer available.'}</p>
            <Link
              to="/"
              className="mt-5 inline-block px-4 py-2 text-sm font-semibold text-white bg-blue-700 rounded-lg"
            >
              Return Home
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            <div className="lg:col-span-8 space-y-8">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-mono text-slate-700">{course.code}</span>
                  <span>·</span>
                  <span className="text-blue-700 font-medium">{course.category}</span>
                  <span>·</span>
                  <span>{course.level}</span>
                  <span>·</span>
                  <span>{course.mode}</span>
                </div>
                <h1 className="mt-2 font-display font-bold text-3xl sm:text-4xl text-slate-950 tracking-tight">
                  {course.name}
                </h1>
                <p className="mt-4 text-base text-slate-600 leading-relaxed">
                  {course.short_description}
                </p>
              </div>

              <div className="aspect-[16/9] rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                <SafeImage
                  src={course.image_url}
                  alt={course.name}
                  fallbackTitle={course.name}
                  className="w-full h-full object-cover"
                />
              </div>

              <div>
                <h2 className="font-display font-bold text-xl text-slate-950">Program Overview</h2>
                <p className="mt-3 text-sm sm:text-base text-slate-600 leading-relaxed whitespace-pre-line">
                  {course.detailed_description}
                </p>
              </div>

              {/* Syllabus & Modules */}
              <div>
                <h2 className="font-display font-bold text-xl text-slate-950">
                  Curriculum & Learning Modules
                </h2>
                {modules.length > 0 ? (
                  <div className="mt-4 border border-slate-200 rounded-xl divide-y divide-slate-200">
                    {modules.map((mod, idx) => (
                      <div key={mod.id} className="p-4 sm:p-5">
                        <div className="font-semibold text-sm text-slate-900">
                          {String(idx + 1).padStart(2, '0')}. {mod.title}
                        </div>
                        {mod.description && (
                          <p className="mt-1 text-xs text-slate-600">{mod.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : course.syllabus.length > 0 ? (
                  <ul className="mt-4 border border-slate-200 rounded-xl divide-y divide-slate-200">
                    {course.syllabus.map((item, idx) => (
                      <li key={idx} className="p-4 text-sm text-slate-800 flex items-start gap-3">
                        <BookOpen className="w-4 h-4 text-blue-700 mt-0.5 shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-slate-500">
                    Detailed syllabus documents are provided inside the Student Portal upon enrollment.
                  </p>
                )}
              </div>
            </div>

            {/* Right Program Summary Sidebar */}
            <aside className="lg:col-span-4">
              <div className="sticky top-24 border border-slate-200 rounded-xl p-6 bg-slate-50/70 space-y-5">
                <h3 className="font-display font-bold text-lg text-slate-950">Program Details</h3>

                <dl className="space-y-3.5 text-sm">
                  <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200">
                    <dt className="text-slate-500 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-slate-400" />
                      Total Duration
                    </dt>
                    <dd className="font-semibold text-slate-900 tabular-nums">{course.duration_display}</dd>
                  </div>

                  {course.total_training_hours > 0 && (
                    <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200">
                      <dt className="text-slate-500">Training Hours</dt>
                      <dd className="font-semibold text-slate-900 tabular-nums">
                        {course.total_training_hours} Hours
                      </dd>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200">
                    <dt className="text-slate-500 flex items-center gap-2">
                      <Monitor className="w-4 h-4 text-slate-400" />
                      Delivery Mode
                    </dt>
                    <dd className="font-semibold text-slate-900">{course.mode}</dd>
                  </div>

                  <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200">
                    <dt className="text-slate-500 flex items-center gap-2">
                      <GraduationCap className="w-4 h-4 text-slate-400" />
                      Level
                    </dt>
                    <dd className="font-semibold text-slate-900">{course.level}</dd>
                  </div>

                  {course.fees && (
                    <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200">
                      <dt className="text-slate-500">Program Fees</dt>
                      <dd className="font-semibold text-slate-900 tabular-nums">{course.fees}</dd>
                    </div>
                  )}

                  {course.start_date && (
                    <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200">
                      <dt className="text-slate-500 flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        Start Date
                      </dt>
                      <dd className="font-semibold text-slate-900 tabular-nums">
                        {formatDateShort(course.start_date)}
                      </dd>
                    </div>
                  )}

                  <div className="pb-3 border-b border-slate-200">
                    <dt className="text-slate-500 mb-1">Eligibility Criteria</dt>
                    <dd className="text-slate-800 leading-relaxed">{course.eligibility}</dd>
                  </div>

                  {course.certificate_info && (
                    <div>
                      <dt className="text-slate-500 flex items-center gap-1.5 mb-1">
                        <Award className="w-4 h-4 text-blue-700" />
                        Certification
                      </dt>
                      <dd className="text-slate-800 leading-relaxed">{course.certificate_info}</dd>
                    </div>
                  )}
                </dl>

                <Link
                  to={`/apply?course=${course.id}`}
                  className="block w-full text-center px-5 py-3 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors"
                >
                  Apply for This Course
                </Link>
              </div>
            </aside>
          </div>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}
