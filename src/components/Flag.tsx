// Okrągłe flagi w SVG — emoji flag nie działają na Windowsie.
const FLAGS: Record<string, React.ReactNode> = {
  it: (
    <>
      <rect width="12" height="36" fill="#009246" />
      <rect x="12" width="12" height="36" fill="#f4f5f0" />
      <rect x="24" width="12" height="36" fill="#ce2b37" />
    </>
  ),
  es: (
    <>
      <rect width="36" height="36" fill="#c60b1e" />
      <rect y="9" width="36" height="18" fill="#ffc400" />
    </>
  ),
  fr: (
    <>
      <rect width="12" height="36" fill="#0055a4" />
      <rect x="12" width="12" height="36" fill="#f4f5f0" />
      <rect x="24" width="12" height="36" fill="#ef4135" />
    </>
  ),
  de: (
    <>
      <rect width="36" height="12" fill="#1a1a1a" />
      <rect y="12" width="36" height="12" fill="#dd0000" />
      <rect y="24" width="36" height="12" fill="#ffce00" />
    </>
  ),
  pl: (
    <>
      <rect width="36" height="18" fill="#f4f5f0" />
      <rect y="18" width="36" height="18" fill="#dc143c" />
    </>
  ),
  en: (
    <>
      <rect width="36" height="36" fill="#012169" />
      <path d="M0 0 36 36M36 0 0 36" stroke="#f4f5f0" strokeWidth="7" />
      <path d="M0 0 36 36M36 0 0 36" stroke="#c8102e" strokeWidth="2.6" />
      <path d="M18 0v36M0 18h36" stroke="#f4f5f0" strokeWidth="11" />
      <path d="M18 0v36M0 18h36" stroke="#c8102e" strokeWidth="6.5" />
    </>
  ),
  pt: (
    <>
      <rect width="36" height="36" fill="#ff0000" />
      <rect width="14" height="36" fill="#006600" />
      <circle cx="14" cy="18" r="5.5" fill="#ffcc00" />
    </>
  ),
};

export function Flag({ code, size = 28, label }: { code: string; size?: number; label?: string }) {
  const art = FLAGS[code];
  const id = `flag-clip-${code}`;
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" className="flag" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <defs>
        <clipPath id={id}>
          <circle cx="18" cy="18" r="18" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>{art ?? <rect width="36" height="36" fill="#8891b5" />}</g>
      <circle cx="18" cy="18" r="17.25" fill="none" stroke="rgb(0 0 0 / 0.12)" strokeWidth="1.5" />
    </svg>
  );
}
