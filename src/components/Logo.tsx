/** Znak MultiLingua: dwa nachodzące na siebie dymki rozmowy — dwa języki w jednej rozmowie. */
export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <img src={`${import.meta.env.BASE_URL}icons/icon-512.png`} width={size} height={size} alt="" aria-hidden className="logo-mark" />
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
