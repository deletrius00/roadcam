import { useState } from 'react';
import { ageMs, formatAge, freshness } from '../lib/age';
import { formatDistance } from '../lib/geo';
import { friendlyCameraName, sideLabel } from '../lib/names';
import { LaneGuide } from './LaneGuide';
import type { NearbyCamera } from '../lib/types';

interface Props {
  camera: NearbyCamera;
  /** Live distance from you right now (more current than the server's). */
  distanceMeters: number;
  now: number;
  /** Changes on each data refresh so the browser fetches a new image instead of a cached one. */
  refreshKey: number;
  onOpen: (camera: NearbyCamera) => void;
  /** Your direction of travel, to mark which lanes in the picture are yours. */
  heading: number | null;
}

export function withCacheBust(url: string, key: number): string {
  if (url.startsWith('/')) return url; // local demo images never change
  return `${url}${url.includes('?') ? '&' : '?'}t=${key}`;
}

export function CameraCard({ camera, distanceMeters, now, refreshKey, onOpen, heading }: Props) {
  const [failed, setFailed] = useState(false);
  const age = ageMs(camera.imageTakenAt, now);
  const fresh = freshness(age);
  const approximate = camera.imageTimeSource === 'record';

  return (
    <article className={`card ${camera.unavailable ? 'offline' : ''}`}>
      <button
        type="button"
        className="card-media"
        onClick={() => onOpen(camera)}
        aria-label={`Enlarge image from ${friendlyCameraName(camera.name)}`}
      >
        {failed ? (
          <div className="card-missing">Image unavailable</div>
        ) : (
          <img
            src={withCacheBust(camera.imageUrl, refreshKey)}
            alt={`Latest view from ${friendlyCameraName(camera.name)}`}
            loading="lazy"
            onError={() => setFailed(true)}
            onLoad={() => setFailed(false)}
          />
        )}
        {camera.unavailable ? (
          <span className="badge age age-offline" title="Caltrans is showing a 'Temporarily Unavailable' card for this camera">
            <span className="dot" aria-hidden="true" />
            Camera offline
          </span>
        ) : (
          <span className={`badge age age-${fresh}`} title={approximate ? 'Approximate: based on when the camera record last updated' : undefined}>
            <span className="dot" aria-hidden="true" />
            {approximate && Number.isFinite(age) ? '~' : ''}
            {formatAge(age)}
          </span>
        )}
        {!camera.unavailable && !failed && <LaneGuide facing={camera.facing} heading={heading} />}
        <span className="badge distance">{formatDistance(distanceMeters)}</span>
      </button>
      <div className="card-body">
        <h3 className="card-title" title={`Caltrans name: ${camera.name}`}>
          {friendlyCameraName(camera.name)}
        </h3>
        <p className="card-meta">
          {camera.route && <span className="chip">{camera.route}</span>}
          {camera.direction && <span className="chip chip-quiet">{sideLabel(camera.direction)}</span>}
          {camera.facing && <span className="chip chip-quiet">Looks {camera.facing.toLowerCase()}</span>}
          {camera.nearbyPlace && <span className="muted">near {camera.nearbyPlace}</span>}
        </p>
      </div>
    </article>
  );
}
