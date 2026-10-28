import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DAY = 86_400_000;
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']);
export function allowedImageSource(source: string) {
  try {
    const url = new URL(source);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      ['cdninstagram.com', 'fbcdn.net'].some(host => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch { return false; }
}

type CachedImage = { data: Buffer; type: string; hit: boolean };
export class ImageCache {
  private pending = new Map<string, Promise<CachedImage>>();
  private active = 0;
  private waiters: Array<() => void> = [];
  private lastCleanup = 0;
  private storedBytes = 0;
  constructor(private directory: string, private fetcher: typeof fetch = fetch, private maxBytes = 512 * 1024 * 1024) {}
  private file(key: string, extension: string) {
    if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('Invalid image key');
    // Runtime cache files are created after deployment, never bundled.
    return path.join(/* turbopackIgnore: true */ this.directory, `${key}.${extension}`);
  }
  private async atomic(file: string, data: string | Buffer) {
    await mkdir(this.directory, { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    try { await writeFile(temporary, data); await rename(temporary, file); }
    finally { await unlink(temporary).catch(() => {}); }
  }
  async register(account: string, id: string, source: string): Promise<string> {
    if (!allowedImageSource(source)) throw new Error('Invalid image source');
    // URL signatures rotate; the account and media identity do not.
    const key = createHash('sha256').update(JSON.stringify([account.toLowerCase(), id])).digest('hex');
    const file = this.file(key, 'json');
    const value = JSON.stringify({ source });
    if (await readFile(file, 'utf8').catch(() => '') !== value) await this.atomic(file, value);
    return key;
  }
  get(key: string): Promise<CachedImage> {
    this.file(key, 'bin');
    const existing = this.pending.get(key);
    if (existing) return existing;
    const result = this.load(key);
    this.pending.set(key, result);
    result.then(() => this.pending.delete(key), () => this.pending.delete(key));
    return result;
  }
  private async load(key: string): Promise<CachedImage> {
    const file = this.file(key, 'bin');
    try {
      const [stored, info] = await Promise.all([readFile(file), stat(file)]);
      const separator = stored.indexOf(10), type = stored.subarray(0, separator).toString();
      if (Date.now() - info.mtimeMs < 30 * DAY && TYPES.has(type) && separator > 0) {
        return { type, data: stored.subarray(separator + 1), hit: true };
      }
    } catch { /* first visit, expired cache, or an evicted original */ }
    const { source } = JSON.parse(await readFile(this.file(key, 'json'), 'utf8'));
    if (typeof source !== 'string' || !allowedImageSource(source)) throw new Error('Invalid image source');
    if (this.active < 4) this.active++;
    else await new Promise<void>(resolve => this.waiters.push(resolve));
    try {
      const response = await this.fetcher(source, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(12_000) });
      const type = response.headers.get('content-type')?.split(';')[0].trim() || '';
      if (!response.ok || !TYPES.has(type) || !response.body) throw new Error('Image unavailable');
      const reader = response.body.getReader(), chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 20 * 1024 * 1024) throw new Error('Image too large');
          chunks.push(value);
        }
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      if (!bytes) throw new Error('Empty image');
      const data = Buffer.concat(chunks);
      // Disk pressure must not turn an already downloaded image into an error.
      await this.atomic(file, Buffer.concat([Buffer.from(`${type}\n`), data])).catch(() => {});
      await this.cleanup(bytes).catch(() => {});
      return { data, type, hit: false };
    } catch {
      // Never include signed CDN addresses in browser responses or logs.
      throw new Error('Image unavailable');
    } finally {
      const next = this.waiters.shift();
      if (next) next(); else this.active--;
    }
  }
  private async cleanup(addedBytes: number) {
    this.storedBytes += addedBytes;
    if (Date.now() - this.lastCleanup < 3_600_000 && this.storedBytes < this.maxBytes) return;
    this.lastCleanup = Date.now();
    const names = (await readdir(this.directory)).filter(name => /^[a-f0-9]{64}\.bin$/.test(name));
    const files = (await Promise.all(names.map(async name => {
      const file = path.join(this.directory, name);
      const info = await stat(file).catch(() => null);
      return info && { file, size: info.size, time: info.mtimeMs };
    }))).filter(item => item !== null).sort((a, b) => a.time - b.time);
    let total = files.reduce((sum, file) => sum + file.size, 0);
    for (const file of files) {
      if (total <= this.maxBytes && Date.now() - file.time < 30 * DAY) break;
      await unlink(file.file).catch(() => {});
      total -= file.size;
    }
    this.storedBytes = total;
  }
}
