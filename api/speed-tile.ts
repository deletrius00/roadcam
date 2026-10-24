/** Vercel serverless function: /api/speed-tile. Logic lives in server/speedTiles.ts. */
import { handleSpeedTileRequest } from '../server/speedTiles.js';

export function GET(request: Request): Promise<Response> {
  return handleSpeedTileRequest(request);
}
