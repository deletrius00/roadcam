/**
 * Vercel serverless function: deployed automatically at /api/cameras.
 * All the logic lives in server/handler.ts so it can be tested and reused by the dev server.
 */
import { handleCamerasRequest } from '../server/handler.js';

export function GET(request: Request): Promise<Response> {
  return handleCamerasRequest(request);
}
