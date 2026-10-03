import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { device } from './api';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
beforeEach(() => vi.stubGlobal('location', { protocol: 'http:', hostname: 'localhost', host: 'localhost' }));
afterEach(() => vi.unstubAllGlobals());

describe('HTTP transport', () => {
  it('waits for the commit receipt before resolving upload', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json({ upload_id: 7 }, 202))
      .mockResolvedValueOnce(json({ state: 'pending' })).mockResolvedValueOnce(json({ state: 'saved' }));
    vi.stubGlobal('fetch', fetch);
    await device.upload('localhost:8787', 'a', Uint8Array.of(1));
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls[1][0]).toBe('http://localhost:8787/api/uploads/status?id=7');
  });

  it('rejects upload if the loop task could not save the file', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json({ upload_id: 7 }, 202))
      .mockResolvedValueOnce(json({ state: 'failed', error: 'cannot save file' })));
    await expect(device.upload('', 'a', Uint8Array.of(1))).rejects.toThrow('บันทึกไฟล์ไม่ได้');
  });

  it('reports queue-full and invalid-host responses clearly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json({ error: 'command queue full' }, 503))
      .mockResolvedValueOnce(new Response('<html>editor</html>')));
    await expect(device.next('')).rejects.toThrow('เต็มคิว');
    await expect(device.info('')).rejects.toThrow('ไม่ใช่ API ของบอร์ด');
  });

  it('remains compatible with uploads from older firmware', async () => {
    const fetch = vi.fn().mockResolvedValue(json({ ok: true }));
    vi.stubGlobal('fetch', fetch);
    await device.upload('', 'a', Uint8Array.of(1));
    expect(fetch).toHaveBeenCalledOnce();
  });
});
