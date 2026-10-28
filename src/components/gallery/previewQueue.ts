// Share repeated tiles and bound both image downloads and decoding work.
type Job = { source: string; preview: string; resolve: (url: string) => void; reject: () => void };
const pending: Job[] = [];
const cache = new Map<string, Promise<string>>();
let active = 0;
const LIMIT = 4;
function pump() {
  while (active < LIMIT && pending.length) {
    const job = pending.shift()!;
    active++;
    const image = new window.Image();
    image.decoding = 'async';
    let original = false;
    const finish = (ok: boolean) => {
      image.onload = image.onerror = null;
      active--;
      if (ok) job.resolve(image.src);
      else { cache.delete(job.preview); job.reject(); }
      pump();
    };
    image.onload = async () => {
      // Keep decoding inside the bounded queue, before publishing to React.
      try { await image.decode(); finish(true); }
      catch { finish(false); }
    };
    image.onerror = () => {
      if (!original) { original = true; image.src = job.source; }
      else finish(false);
    };
    image.src = job.preview;
  }
}
export function loadPreview(source: string, preview: string): Promise<string> {
  const existing = cache.get(preview);
  if (existing) return existing;
  const result = new Promise<string>((resolve, reject) => {
    pending.push({ source, preview, resolve, reject: () => reject(new Error('Image unavailable')) });
  });
  cache.set(preview, result);
  // Bound references retained after exploring a large archive.
  if (cache.size > 256) cache.delete(cache.keys().next().value!);
  pump();
  return result;
}
