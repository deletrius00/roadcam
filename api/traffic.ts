/** Vercel serverless function: /api/traffic. Logic lives in server/traffic.ts. */
import { handleTrafficRequest } from '../server/traffic.js';

export function GET(request: Request): Promise<Response> {
  return handleTrafficRequest(request);
}
