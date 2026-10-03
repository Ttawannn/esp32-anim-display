interface Entry { promise: Promise<string | null>; url?: string; users: number; invalid: boolean; }
export interface ThumbnailLease { promise: Promise<string | null>; release: () => void; }

// URLs are released on replacement/eviction, including results arriving after invalidation.
export class ThumbnailCache {
  private entries = new Map<string, Entry>();
  constructor(private limit = 64, private revoke = (url: string) => URL.revokeObjectURL(url)) {}
  get(key: string, render: () => Promise<string | null>): Promise<string | null> {
    return this.entry(key, render).promise;
  }
  acquire(key: string, render: () => Promise<string | null>): ThumbnailLease {
    const entry = this.entry(key, render);
    entry.users++;
    let released = false;
    return { promise: entry.promise, release: () => {
      if (released) return;
      released = true;
      entry.users--;
      if (!entry.users && this.entries.get(key) !== entry) this.dispose(entry);
    } };
  }
  private entry(key: string, render: () => Promise<string | null>): Entry {
    let entry = this.entries.get(key);
    if (entry) {
      this.entries.delete(key);
      this.entries.set(key, entry);
      return entry;
    }
    const current: Entry = { users: 0, invalid: false, promise: Promise.resolve().then(render).catch(() => null).then((url) => {
      if (current.invalid || (this.entries.get(key) !== current && !current.users)) {
        if (url) this.revoke(url);
        return null;
      }
      if (!url) this.entries.delete(key); // failed reads can retry
      else current.url = url;
      return url;
    }) };
    this.entries.set(key, current);
    while (this.entries.size > this.limit) this.remove(this.entries.keys().next().value!);
    return current;
  }
  private dispose(entry: Entry) {
    if (entry.url) { this.revoke(entry.url); entry.url = undefined; }
  }
  private remove(key: string, invalid = false) {
    const entry = this.entries.get(key);
    this.entries.delete(key);
    if (entry) {
      entry.invalid ||= invalid;
      if (invalid || !entry.users) this.dispose(entry);
    }
  }
  invalidate(prefix: string) {
    for (const key of this.entries.keys()) if (key.startsWith(prefix)) this.remove(key, true);
  }
}

export const thumbnails = new ThumbnailCache();
let revision = 0;
export const thumbnailRevision = () => revision;
export function invalidateThumbnails(connection: string, name: string) {
  thumbnails.invalidate(JSON.stringify([connection, name]).slice(0, -1) + ',');
  revision++;
}
