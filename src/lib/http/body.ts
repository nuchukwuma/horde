/**
 * Read a JSON body with a hard size cap, BEFORE parsing it.
 *
 * request.json() would happily parse a 50 MB body into memory first and let
 * validation reject it afterwards. For endpoints that accept large structured
 * documents (store designs), the cap has to come first.
 */

import { ValidationError } from '../errors';

export async function readJsonCapped(request: Request, maxBytes: number): Promise<unknown> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > maxBytes) throw new ValidationError(`Request is too large (limit ${Math.floor(maxBytes / 1024)} KB)`);

  const text = await request.text();
  if (Buffer.byteLength(text, 'utf8') > maxBytes) {
    throw new ValidationError(`Request is too large (limit ${Math.floor(maxBytes / 1024)} KB)`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ValidationError('Request body is not valid JSON');
  }
}
