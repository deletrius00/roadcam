import { bound, laneGuide, type Compass } from '../lib/facing';

interface Props {
  facing: Compass | null;
  heading: number | null;
}

/**
 * Labels the two sides of a camera picture, when we know which way the camera points.
 * US traffic drives on the right, so traffic moving away from the camera is on the right
 * of the picture and traffic coming toward it is on the left.
 */
export function LaneGuide({ facing, heading }: Props) {
  const guide = laneGuide(facing, heading);
  if (!guide) return null;
  return (
    <div className="lanes" aria-label={`Left side: ${bound(guide.toward)}. Right side: ${bound(guide.away)}.`}>
      <span className={`lane lane-left ${guide.yourSide === 'toward' ? 'yours' : ''}`}>
        ↓ {bound(guide.toward)}
        {guide.yourSide === 'toward' && <b>You</b>}
      </span>
      <span className={`lane lane-right ${guide.yourSide === 'away' ? 'yours' : ''}`}>
        {guide.yourSide === 'away' && <b>You</b>}
        ↑ {bound(guide.away)}
      </span>
    </div>
  );
}
