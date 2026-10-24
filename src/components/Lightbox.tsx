import { useEffect } from 'react';
import { ageMs, formatAge } from '../lib/age';
import { friendlyCameraName } from '../lib/names';
import { LaneGuide } from './LaneGuide';
import { axisDirections, axisLabel } from '../lib/roadAxis';
import type { NearbyCamera } from '../lib/types';
import { withCacheBust } from './CameraCard';

interface Props {
  heading: number | null;
  camera: NearbyCamera;
  now: number;
  refreshKey: number;
  onClose: () => void;
}

export function Lightbox({ camera, now, refreshKey, onClose, heading }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={friendlyCameraName(camera.name)} onClick={onClose}>
      <figure onClick={(e) => e.stopPropagation()}>
        <div className="lightbox-media">
          <img src={withCacheBust(camera.imageUrl, refreshKey)} alt={`Latest view from ${friendlyCameraName(camera.name)}`} />
          {!camera.unavailable && <LaneGuide facing={camera.facing} heading={heading} />}
        </div>
        <figcaption>
          <strong>
            {friendlyCameraName(camera.name)}
            {camera.route ? ` · ${camera.route}` : ''}
          </strong>
          <span>{camera.unavailable ? 'Camera offline' : formatAge(ageMs(camera.imageTakenAt, now))}</span>
        </figcaption>
        <p className="lightbox-tip">
          {camera.unavailable
            ? 'Caltrans is showing a “Temporarily Unavailable” card for this camera right now.'
            : camera.facing
              ? `This camera looks ${camera.facing.toLowerCase()}. Traffic on the right is moving away from it; traffic on the left is coming toward it.`
              : camera.roadAxisDeg !== null
                ? `Caltrans doesn’t say which way this camera points, but ${camera.route || 'the highway'} runs ${axisLabel(camera.roadAxisDeg)} here, so it’s looking either ${axisDirections(camera.roadAxisDeg).join(' or ')}. Red taillights are moving away from the camera, white headlights are coming toward it.`
                : 'Caltrans doesn’t say which way this camera points. Tip: red taillights are moving away from the camera, white headlights are coming toward it.'}
        </p>
        <button type="button" className="close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </figure>
    </div>
  );
}
