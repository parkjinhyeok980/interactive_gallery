// Bounded process cache. Share in-flight work, but never cache a failed request.
export class PageCache<T> {
  private entries = new Map<string, { expiresAt: number; value: Promise<T> }>();
  constructor(private ttlMs = 300_000, private capacity = 80, private now = Date.now) {}
  get(key: string, load: () => Promise<T>): Promise<T> {
    const existing = this.entries.get(key);
    if (existing && existing.expiresAt > this.now()) return existing.value;
    this.entries.delete(key);
    if (this.entries.size >= this.capacity) this.entries.delete(this.entries.keys().next().value!);
    const entry = { expiresAt: Infinity, value: Promise.resolve().then(load) };
    this.entries.set(key, entry);
    entry.value.then(() => { entry.expiresAt = this.now() + this.ttlMs; }, () => {
      if (this.entries.get(key) === entry) this.entries.delete(key);
    });
    return entry.value;
  }
}
