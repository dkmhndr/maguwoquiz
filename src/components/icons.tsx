export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg className={`brand-mark ${className}`} viewBox="0 0 48 48" aria-hidden="true" />
  );
}

export function GiftIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 200 200" fill="none" aria-hidden="true">
      <path d="M38 89h124v85H38z" fill="#e4775f" stroke="#263c31" strokeWidth="5" />
      <path d="M29 68h142v33H29z" fill="#ffcb66" stroke="#263c31" strokeWidth="5" />
      <path d="M87 68h26v106H87z" fill="#fff4dc" stroke="#263c31" strokeWidth="5" />
      <path
        d="M100 68C25 62 42 9 65 24c18 11 28 33 35 44Zm0 0c75-6 58-59 35-44-18 11-28 33-35 44Z"
        fill="#fff4dc"
        stroke="#263c31"
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <path
        d="m18 30 3 8 8 3-8 3-3 8-3-8-8-3 8-3Zm160 81 3 8 8 3-8 3-3 8-3-8-8-3 8-3Z"
        fill="#ffcb66"
      />
      <circle cx="173" cy="40" r="6" fill="#e4775f" />
      <circle cx="16" cy="156" r="5" fill="#7a9869" />
    </svg>
  );
}

export function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 12h16m-6-6 6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
