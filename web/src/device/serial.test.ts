// Exercises the USB client against a simulated board that follows the firmware's serial RPC
// (app/serial_rpc.cpp): '@'-prefixed JSON lines, interleaved log output, arbitrary read splits.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { device, setUsbLink } from './api';
import { CHUNK_BYTES, fromBase64, SerialLink, toBase64 } from './serial';

function fakeBoard(options: { failSave?: boolean; failChunk?: boolean; disconnectChunk?: boolean; queueFull?: boolean } = {}) {
  const files = new Map<string, Uint8Array>();
  let xfer: { kind: string; name: string; size: number; parts: Uint8Array[] } | null = null;
  const live: Uint8Array[] = [];
  let toHost!: ReadableStreamDefaultController<Uint8Array>;
  const enc = new TextEncoder();
  const requests: any[] = [];
  const uploads = new Map<number, { name: string; bytes: Uint8Array; polls: number }>();
  let nextUpload = 0;

  // Board -> host: deliver text in random-sized pieces, with log noise between lines.
  const send = (text: string) => {
    const bytes = enc.encode('[log] heap 123456\n' + text);
    for (let i = 0; i < bytes.length; ) {
      const n = 1 + Math.floor(Math.random() * 40);
      toHost.enqueue(bytes.subarray(i, i + n));
      i += n;
    }
  };
  const reply = (msg: object) => send('@' + JSON.stringify(msg) + '\n');

  const handle = (req: any) => {
    requests.push(req);
    const { id, op } = req;
    if (op === 'ignore') return;
    switch (op) {
      case 'hello':
        return reply({ id, status: 200, body: { proto: 1, version: 'sim' } });
      case 'api':
        if (req.path === '/api/uploads/status') {
          const upload = uploads.get(Number(req.query.id))!;
          if (upload.polls++ === 0) return reply({ id, status: 200, body: { state: 'pending' } });
          if (options.failSave) return reply({ id, status: 200, body: { state: 'failed', error: 'cannot save file' } });
          files.set(upload.name, upload.bytes);
          return reply({ id, status: 200, body: { state: 'saved' } });
        }
        if (req.path === '/api/next') return reply({ id, status: options.queueFull ? 503 : 200,
          body: options.queueFull ? { error: 'command queue full' } : { ok: true } });
        if (req.path === '/api/info') return reply({ id, status: 200, body: { board_name: 'sim', fs: { free: 1000 } } });
        if (req.path === '/api/play') {
          return files.has(req.query?.name)
            ? reply({ id, status: 200, body: { ok: true } })
            : reply({ id, status: 404, body: { error: 'not found' } });
        }
        return reply({ id, status: 404, body: { error: 'not found' } });
      case 'put_begin':
        xfer = { kind: req.kind, name: req.name, size: req.size, parts: [] };
        return reply({ id, status: 200 });
      case 'put_data': {
        if (options.disconnectChunk) { toHost.close(); return; }
        if (options.failChunk) return reply({ id, status: 507, body: { error: 'not enough storage' } });
        const chunk = fromBase64(req.data);
        expect(chunk.length).toBeLessThanOrEqual(CHUNK_BYTES);
        xfer!.parts.push(chunk);
        return reply({ id, status: 200 });
      }
      case 'put_end': {
        const all = new Uint8Array(xfer!.size);
        let o = 0;
        for (const p of xfer!.parts) { all.set(p, o); o += p.length; }
        const uploadId = xfer!.kind === 'file' ? ++nextUpload : undefined;
        if (uploadId) uploads.set(uploadId, { name: xfer!.name, bytes: all, polls: 0 });
        else live.push(all);
        xfer = null;
        return reply({ id, status: 200, body: { ok: true, upload_id: uploadId } });
      }
      case 'put_abort': xfer = null; return reply({ id, status: 200 });
      case 'read': {
        const f = files.get(req.name);
        if (!f) return reply({ id, status: 404, body: { error: 'not found' } });
        const part = f.subarray(req.offset, req.offset + Math.min(req.length, CHUNK_BYTES));
        return reply({ id, status: 200, size: f.length, data: toBase64(part) });
      }
    }
    reply({ id, status: 404, body: { error: 'unknown op' } });
  };

  // Host -> board: reassemble lines.
  let inBuf = '';
  const dec = new TextDecoder();
  const port = {
    readable: new ReadableStream<Uint8Array>({ start: (c) => { toHost = c; } }),
    writable: new WritableStream<Uint8Array>({
      write(chunk) {
        inBuf += dec.decode(chunk, { stream: true });
        let nl: number;
        while ((nl = inBuf.indexOf('\n')) >= 0) {
          const line = inBuf.slice(0, nl);
          inBuf = inBuf.slice(nl + 1);
          if (line.startsWith('@')) setTimeout(() => handle(JSON.parse(line.slice(1))), 0);
        }
      },
    }),
    async close() {
      expect(port.readable.locked).toBe(false);
      expect(port.writable.locked).toBe(false);
    },
  };
  return { port, files, live, requests };
}

let link: SerialLink | null = null;
afterEach(async () => {
  setUsbLink(null);
  await link?.close();
  link = null;
});

async function connect(options: Parameters<typeof fakeBoard>[0] = {}) {
  const board = fakeBoard(options);
  link = new SerialLink(board.port);
  link.start();
  await link.waitReady(2000);
  setUsbLink(link);
  return board;
}

describe('USB transport', () => {
  it('handshakes and calls JSON endpoints, ignoring log lines', async () => {
    await connect();
    const info = await device.info('');
    expect(info.board_name).toBe('sim');
  });

  it('maps error responses to messages', async () => {
    await connect();
    await expect(device.play('', 'missing')).rejects.toThrow('ไม่พบไฟล์');
  });

  it('uploads in chunks and reads files back', async () => {
    const board = await connect();
    const bytes = Uint8Array.from({ length: CHUNK_BYTES * 3 + 123 }, (_, i) => (i * 7) & 255);
    const progress: number[] = [];
    await device.upload('', 'ตา ดีใจ', bytes, true, (sent) => progress.push(sent));
    expect(board.files.get('ตา ดีใจ')).toEqual(bytes);
    expect(progress.at(-1)).toBe(bytes.length);
    expect(board.requests.filter((r) => r.op === 'put_data')).toHaveLength(4);

    expect(await device.fileHead('', 'ตา ดีใจ', 5000)).toEqual(bytes.subarray(0, 5000));
    expect(await device.fileHead('', 'ตา ดีใจ', 1e9)).toEqual(bytes);
  });

  it('sends live frames', async () => {
    const board = await connect();
    await device.live('', Uint8Array.of(1, 2, 3));
    expect(board.live).toEqual([Uint8Array.of(1, 2, 3)]);
  });

  it('serializes concurrent requests', async () => {
    const board = await connect();
    await Promise.all([device.info(''), device.info(''), device.live('', Uint8Array.of(9))]);
    const ops = board.requests.map((r) => r.op).filter((op) => op !== 'hello');
    expect(ops).toEqual(['api', 'api', 'put_begin', 'put_data', 'put_end']);
  });

  it('keeps simultaneous uploads and live transfers intact', async () => {
    const board = await connect();
    const a = new Uint8Array(CHUNK_BYTES * 2 + 7).fill(1);
    const b = new Uint8Array(CHUNK_BYTES + 11).fill(2);
    const c = new Uint8Array(CHUNK_BYTES + 3).fill(3);
    await Promise.all([device.upload('', 'a', a), device.live('', c), device.upload('', 'b', b)]);
    expect(board.files.get('a')).toEqual(a);
    expect(board.files.get('b')).toEqual(b);
    expect(board.live).toEqual([c]);
  });

  it('does not report a successful upload when the final save fails', async () => {
    const board = await connect({ failSave: true });
    const old = Uint8Array.of(9);
    board.files.set('a', old);
    await expect(device.upload('', 'a', Uint8Array.of(1, 2))).rejects.toThrow('บันทึกไฟล์ไม่ได้');
    expect(board.files.get('a')).toBe(old);
  });

  it('reports queue-full errors', async () => {
    await connect({ queueFull: true });
    await expect(device.next('')).rejects.toThrow('เต็มคิว');
  });

  it('aborts a failed transfer to release board resources', async () => {
    const board = await connect({ failChunk: true });
    await expect(device.upload('', 'a', Uint8Array.of(1))).rejects.toThrow('พื้นที่บนบอร์ดไม่พอ');
    expect(board.requests.at(-1).op).toBe('put_abort');
  });

  it('rejects an upload immediately when the USB cable disconnects', async () => {
    await connect({ disconnectChunk: true });
    const closed = vi.fn();
    link!.onClose = closed;
    await expect(device.upload('', 'a', Uint8Array.of(1))).rejects.toThrow('สาย USB หลุด');
    expect(link!.isOpen).toBe(false);
    expect(closed).toHaveBeenCalledOnce();
  });

  it('closing rejects an unanswered request and releases the port', async () => {
    const board = fakeBoard();
    link = new SerialLink({ ...board.port, writable: new WritableStream({ write() {} }) });
    link.start();
    const request = link.request({ op: 'hello' });
    const rejection = expect(request).rejects.toThrow('สาย USB หลุด');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await link.close();
    await rejection;
  });

  it('recovers the request queue after a timeout', async () => {
    await connect();
    await expect(link!.request({ op: 'ignore' }, 20)).rejects.toThrow('บอร์ดไม่ตอบผ่าน USB');
    expect((await device.info('')).board_name).toBe('sim');
  });
});
