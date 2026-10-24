import { useEffect } from 'react';
import { ageMs, formatAge } from '../lib/age';
import type { NearbyCamera } from '../lib/types';
import { withCacheBust } from './CameraCard';

interface Props {
  camera: NearbyCamera;
  now: number;
  refreshKey: number;
  onClose: () => void;
}

export function Lightbox({ camera, now, refreshKey, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={camera.name} onClick={onClose}>
      <figure onClick={(e) => e.stopPropagation()}>
        <img src={withCacheBust(camera.imageUrl, refreshKey)} alt={`Latest view from ${camera.name}`} />
        <figcaption>
          <strong>{camera.name}</strong>
          <span>{formatAge(ageMs(camera.imageTakenAt, now))}</span>
        </figcaption>
        <button type="button" className="close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </figure>
    </div>
  );
}
