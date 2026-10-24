interface Props {
  onStartLive: () => void;
  onStartDemo: () => void;
  error: string | null;
}

export function StartScreen({ onStartLive, onStartDemo, error }: Props) {
  return (
    <main className="start">
      <div className="start-art" aria-hidden="true">
        <svg viewBox="0 0 200 120">
          <path d="M70 120 L95 10 h10 L130 120 Z" fill="var(--road)" />
          <path d="M98.6 20h2.8l1 18h-4.8zM97.6 50h4.8l1.4 24h-7.6zM96.2 88h7.6l1.8 32h-11.2z" fill="var(--lane)" />
          <rect x="18" y="22" width="44" height="30" rx="5" fill="var(--surface-2)" stroke="var(--line)" />
          <circle cx="53" cy="29" r="3" fill="var(--fresh)" />
          <rect x="138" y="58" width="44" height="30" rx="5" fill="var(--surface-2)" stroke="var(--line)" />
          <circle cx="173" cy="65" r="3" fill="var(--aging)" />
        </svg>
      </div>
      <h1>See the road ahead</h1>
      <p className="lede">
        RoadCam finds the highway cameras ahead of you and behind you and shows their latest
        pictures, with how old each one is.
      </p>
      <div className="start-actions">
        <button type="button" className="primary" onClick={onStartLive}>
          Use my location
        </button>
        <button type="button" className="secondary" onClick={onStartDemo}>
          Try a demo drive
        </button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <p className="fine">
        Covers California (Caltrans) and Washington (WSDOT) state highways. Your location stays in your browser
        and is only used to find nearby cameras. <strong>Passengers only — never use while driving.</strong>
      </p>
    </main>
  );
}
