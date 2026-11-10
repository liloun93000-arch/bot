import type { CSSProperties, ReactElement } from "react";

/**
 * Une seule famille d'icônes pour tout le back-office : traits fins (1,75 px),
 * extrémités arrondies, grille 24×24, couleur héritée (`currentColor`).
 */
const PATHS: Record<string, ReactElement> = {
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  bell: (
    <>
      <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="9" r="3.6" />
      <path d="M5 20c.6-3.6 3.4-5.6 7-5.6s6.4 2 7 5.6" />
    </>
  ),
  "user-clock": (
    <>
      <circle cx="9.5" cy="8.5" r="3.3" />
      <path d="M3.5 19.5c.5-3.3 2.8-5.2 6-5.2 1 0 1.9.2 2.7.5" />
      <circle cx="17" cy="16.5" r="3.7" />
      <path d="M17 14.6v2.1l1.4.9" />
    </>
  ),
  whatsapp: (
    <>
      <path d="M4 20l1.2-4.1A8 8 0 1 1 8.2 19L4 20Z" />
      <path d="M9.2 8.6c.2 2.6 3.4 5.7 6 6l1-1.2-1.8-1-.9.6c-.9-.4-1.9-1.3-2.2-2.2l.6-.9-1-1.8-1.7.5Z" />
    </>
  ),
  chat: <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 4v-4h0A2.5 2.5 0 0 1 4 13.5v-8Z" />,
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.2M12 18.8V21M4.2 7.5l1.9 1.1M17.9 15.4l1.9 1.1M4.2 16.5l1.9-1.1M17.9 8.6l1.9-1.1" />
      <circle cx="12" cy="12" r="6.6" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M4 17.5l4.6-4.4a1.5 1.5 0 0 1 2 0l2.2 2.1 2.6-2.8a1.5 1.5 0 0 1 2.2 0l2.4 2.6" />
    </>
  ),
  home: (
    <>
      <path d="M4 11.2 12 4l8 7.2" />
      <path d="M6 10v9.5h4.5v-5h3v5H18V10" />
    </>
  ),
  headset: (
    <>
      <path d="M5 14v-2a7 7 0 0 1 14 0v2" />
      <rect x="3.5" y="13.5" width="4" height="6" rx="1.6" />
      <rect x="16.5" y="13.5" width="4" height="6" rx="1.6" />
      <path d="M18.5 19.5c0 1.4-1.6 2-4 2h-2" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3.5 21 8l-9 4.5L3 8l9-4.5Z" />
      <path d="M3 12.2l9 4.5 9-4.5M3 16.4l9 4.5 9-4.5" />
    </>
  ),
  box: (
    <>
      <path d="M12 3.2 20 7.4v9.2l-8 4.2-8-4.2V7.4l8-4.2Z" />
      <path d="M4.2 7.6 12 11.8l7.8-4.2M12 11.8v9" />
    </>
  ),
  cap: (
    <>
      <path d="M2.5 9.5 12 5l9.5 4.5L12 14 2.5 9.5Z" />
      <path d="M6.5 11.8V16c0 1.2 2.5 2.6 5.5 2.6s5.5-1.4 5.5-2.6v-4.2" />
      <path d="M21.5 9.5V15" />
    </>
  ),
  card: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="M3 10h18M6.5 15h4" />
    </>
  ),
  tag: (
    <>
      <path d="M3.5 12.2V5.5a2 2 0 0 1 2-2h6.7L20.5 11.8a2 2 0 0 1 0 2.8l-5.9 5.9a2 2 0 0 1-2.8 0L3.5 12.2Z" />
      <circle cx="8" cy="8" r="1.3" />
    </>
  ),
  chevron: <path d="M9 5.5 15.5 12 9 18.5" />,
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.4 9.6a2.7 2.7 0 1 1 3.9 2.4c-.9.5-1.3 1-1.3 2" />
      <path d="M12 17.2h.01" />
    </>
  ),
  brain: (
    <>
      <path d="M9 4.5a3 3 0 0 0-3 3v.3A3.2 3.2 0 0 0 4 10.8c0 1 .5 1.9 1.2 2.4A3.2 3.2 0 0 0 6 18a3 3 0 0 0 5.2 1.5V5.8A2.3 2.3 0 0 0 9 4.5Z" />
      <path d="M15 4.5a3 3 0 0 1 3 3v.3a3.2 3.2 0 0 1 2 3c0 1-.5 1.9-1.2 2.4A3.2 3.2 0 0 1 18 18a3 3 0 0 1-5.2 1.5V5.8A2.3 2.3 0 0 1 15 4.5Z" />
    </>
  ),
  folder: <path d="M3.5 7a2 2 0 0 1 2-2h4l2 2.2h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V7Z" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="8.8" />
      <path d="M3.4 12h17.2M12 3.2c2.6 2.4 3.8 5.4 3.8 8.8s-1.2 6.4-3.8 8.8c-2.6-2.4-3.8-5.4-3.8-8.8s1.2-6.4 3.8-8.8Z" />
    </>
  ),
  clip: <path d="M20 11.5l-7.6 7.6a4.6 4.6 0 0 1-6.5-6.5l8-8a3 3 0 0 1 4.2 4.2l-8 8a1.4 1.4 0 0 1-2-2l7-7" />,
  external: <path d="M14 4.5h5.5V10M19.5 4.5 11 13M17 14.5V18a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 5 18V9a1.5 1.5 0 0 1 1.5-1.5H10" />,
  logout: <path d="M10 4.5H6.5A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5H10M14.5 8l4 4-4 4M18.5 12H9.5" />,
  chart: <path d="M4 20V4M4 20h16M8 16v-4M12.5 16V8M17 16v-6" />,
  camera: (
    <>
      <path d="M4 8.5A2 2 0 0 1 6 6.5h1.6l1.2-2h6.4l1.2 2H18a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8.5Z" />
      <circle cx="12" cy="12.6" r="3.3" />
    </>
  ),
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 22, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {PATHS[name]}
    </svg>
  );
}

/** Rang d'apparition (animation en cascade) : variable CSS `--i` lue par `.aj-rise`. */
export function idx(i: number): CSSProperties {
  return { "--i": i } as CSSProperties;
}
