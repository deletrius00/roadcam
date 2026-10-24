import { useEffect, useState } from 'react';

const QUERY = '(prefers-color-scheme: dark)';

/** True when the device is in dark mode; updates if the user switches. */
export function usePrefersDark(): boolean {
  const [dark, setDark] = useState(() => window.matchMedia?.(QUERY).matches ?? true);
  useEffect(() => {
    const media = window.matchMedia?.(QUERY);
    if (!media) return;
    const onChange = () => setDark(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return dark;
}
