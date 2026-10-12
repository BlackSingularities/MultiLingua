/** Znak MultiLingua: dwa nachodzące na siebie dymki rozmowy — dwa języki w jednej rozmowie. */
export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden className="logo-mark">
      <path d="M6 10a6 6 0 0 1 6-6h16a6 6 0 0 1 6 6v10a6 6 0 0 1-6 6h-9l-7 6v-6h0a6 6 0 0 1-6-6V10z" className="logo-a" />
      <path d="M18 22a6 6 0 0 1 6-6h12a6 6 0 0 1 6 6v9a6 6 0 0 1-6 6v6l-7-6h-5a6 6 0 0 1-6-6v-9z" className="logo-b" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="logo">
      <LogoMark />
      <span className="logo-word">MultiLingua</span>
    </span>
  );
}
