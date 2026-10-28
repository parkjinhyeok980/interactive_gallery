// Shared, cancellable subscriptions: offscreen work never blocks newly visible tiles.
type Job = { preview: string; fallback: string; users: number; started: boolean; promise: Promise<string>; resolve: (url: string) => void; reject: (error: Error) => void };
const pending: Job[] = [];
const jobs = new Map<string, Job>();
const completed = new Map<string, string>();
let active = 0;
const LIMIT = 4;
function pump() {
  while (active < LIMIT && pending.length) {
    const job = pending.shift()!;
    job.started = true;
    active++;
    const image = new window.Image();
    image.decoding = 'async';
    let fallback = false;
    const finish = (ok: boolean) => {
      image.onload = image.onerror = null;
      active--;
      jobs.delete(job.preview);
      if (ok) {
        completed.set(job.preview, image.src);
        if (completed.size > 256) completed.delete(completed.keys().next().value!);
        job.resolve(image.src);
      } else job.reject(new Error('Image unavailable'));
      pump();
    };
    image.onload = async () => {
      try { await image.decode(); finish(true); } catch { finish(false); }
    };
    image.onerror = () => {
      // Retry the fresh CDN URL through the optimizer, never download a full
      // original into a thumbnail when optimization fails.
      if (!fallback && job.fallback !== job.preview) { fallback = true; image.src = job.fallback; }
      else finish(false);
    };
    image.src = job.preview;
  }
}
export function loadPreview(preview: string, fallback: string) {
  const cached = completed.get(preview);
  if (cached) {
    completed.delete(preview); completed.set(preview, cached);
    return { promise: Promise.resolve(cached), release: () => {} };
  }
  let job = jobs.get(preview);
  if (!job) {
    let resolve!: Job['resolve'], reject!: Job['reject'];
    const promise = new Promise<string>((yes, no) => { resolve = yes; reject = no; });
    job = { preview, fallback, users: 0, started: false, promise, resolve, reject };
    jobs.set(preview, job); pending.push(job);
  }
  job.users++;
  const subscription = job;
  let released = false;
  pump();
  return { promise: job.promise, release: () => {
    if (released) return;
    released = true;
    subscription.users--;
    if (!subscription.users && !subscription.started) {
      const index = pending.indexOf(subscription);
      if (index !== -1) pending.splice(index, 1);
      jobs.delete(preview);
      subscription.reject(new Error('Preview no longer visible'));
    }
  } };
}
