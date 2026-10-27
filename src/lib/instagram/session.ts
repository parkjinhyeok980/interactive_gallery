import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { InstagramError } from './api';

export function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new InstagramError('configuration', 503);
  return value;
}
export function sameSecret(a: string, b: string) {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
function key() {
  const value = required('INSTAGRAM_SESSION_KEY');
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new InstagramError('configuration', 503);
  return Buffer.from(value, 'hex');
}
export function seal(value: unknown) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(), iv);
  const content = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), content]).toString('base64url');
}
export function unseal<T>(value: string): T {
  try {
    const bytes = Buffer.from(value, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', key(), bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'));
  } catch { throw new InstagramError('authentication', 401); }
}
type Session = { accessToken: string; expiresAt: number; username: string };
const sessionPath = path.join(process.cwd(), '.instagram', 'session.enc');
export function localOAuthEnabled() { return process.env.INSTAGRAM_LOCAL_OAUTH === 'true' && !process.env.VERCEL; }
export async function saveSession(session: Session) {
  if (!localOAuthEnabled()) throw new InstagramError('configuration', 503);
  const encrypted = seal(session);
  await mkdir(path.dirname(sessionPath), { recursive: true });
  const temporary = `${sessionPath}.${randomBytes(8).toString('hex')}.tmp`;
  await writeFile(temporary, encrypted, { mode: 0o600 });
  await rename(temporary, sessionPath);
}
export async function accessToken(): Promise<string> {
  if (process.env.INSTAGRAM_ACCESS_TOKEN) return required('INSTAGRAM_ACCESS_TOKEN');
  if (!localOAuthEnabled()) throw new InstagramError('configuration', 503);
  let encrypted: string;
  try { encrypted = await readFile(sessionPath, 'utf8'); }
  catch { throw new InstagramError('configuration', 503); }
  const session = unseal<Session>(encrypted);
  if (!session.accessToken || !Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now() || session.username?.toLowerCase() !== required('INSTAGRAM_USERNAME').toLowerCase()) throw new InstagramError('authentication', 401);
  return session.accessToken;
}
