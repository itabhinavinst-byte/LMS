import React, { useState } from 'react';
import { BookOpen } from 'lucide-react';

export function AitMLogo({
  logoUrl,
  shortName = 'AITM',
  className = 'h-9 w-9',
}: {
  logoUrl?: string;
  shortName?: string;
  className?: string;
}) {
  const [imgError, setImgError] = useState(false);

  if (logoUrl && !imgError) {
    return (
      <img
        src={logoUrl}
        alt={`${shortName} Official Logo`}
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
        className={`${className} object-contain shrink-0`}
      />
    );
  }

  // Dignified institutional monogram crest fallback when no custom image logo is uploaded
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} shrink-0`}
      aria-label={`${shortName} Crest`}
    >
      <rect x="1" y="1" width="38" height="38" rx="8" fill="#0F172A" stroke="#1E3A8A" strokeWidth="1.5" />
      <path d="M20 8L31 14V23C31 28.5 26.2 32.1 20 33.5C13.8 32.1 9 28.5 9 23V14L20 8Z" fill="#1D4ED8" fillOpacity="0.22" stroke="#93C5FD" strokeWidth="1.5" />
      <path d="M14.5 26L20 13.5L25.5 26M16.5 22.5H23.5" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SafeImage({
  src,
  alt,
  className = '',
  fallbackTitle,
}: {
  src?: string;
  alt: string;
  className?: string;
  fallbackTitle?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={`${className} flex flex-col items-center justify-center bg-gradient-to-br from-slate-100 via-slate-50 to-blue-50 text-slate-500 p-6 text-center`}
      >
        <BookOpen className="w-8 h-8 text-slate-400 mb-2" />
        <span className="text-xs font-medium text-slate-600 max-w-[200px] truncate">
          {fallbackTitle || alt}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
