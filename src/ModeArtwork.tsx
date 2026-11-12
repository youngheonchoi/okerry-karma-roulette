import type { Mode } from './domain';

/** Decorative vectors scale with each card and never receive taps or focus. */
export function ModeArtwork({ mode }: { mode: Mode }) {
  return <span className="mode-artwork" aria-hidden="true">
    <svg viewBox="0 0 160 160" fill="none" focusable="false">
      {mode === 'solo' ? <>
        <circle cx="80" cy="88" r="60" fill="currentColor" fillOpacity=".08" />
        {Array.from({ length: 8 }, (_, index) => {
          const start = (index * 45 - 90) * Math.PI / 180;
          const end = start + Math.PI / 4;
          const point = (angle: number) => `${80 + 53 * Math.cos(angle)} ${88 + 53 * Math.sin(angle)}`;
          return <path key={index} d={`M80 88 L${point(start)} A53 53 0 0 1 ${point(end)} Z`}
            fill="currentColor" fillOpacity={index % 2 ? '.12' : '.4'}
            stroke="currentColor" strokeOpacity=".35" strokeWidth="1.5" />;
        })}
        <circle cx="80" cy="88" r="54" stroke="currentColor" strokeWidth="3" />
        <circle cx="80" cy="88" r="12" fill="currentColor" fillOpacity=".7" />
        <circle cx="80" cy="88" r="5" fill="var(--surface)" />
        <path d="M69 14 H91 L80 37 Z" fill="currentColor" />
      </> : <g transform="rotate(-10 80 80)" stroke="currentColor" strokeWidth="9"
        strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 61 L40 45 V113 M23 113 H56" />
        <path d="M65 125 L91 39" strokeOpacity=".7" />
        <path d="M105 113 V45 L145 113 V45" />
      </g>}
    </svg>
  </span>;
}
