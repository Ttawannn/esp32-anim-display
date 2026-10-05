import { t } from '../i18n';
// USB link to the board over Web Serial (firmware: app/serial_rpc.cpp, docs/usb-protocol.md).
// Requests and responses are single lines: '@' + JSON. Other lines are firmware logs and are
// ignored. One request is in flight at a time, which keeps the firmware side trivial.

export interface RpcResponse {
  id: number;
  status: number;
  body?: any;
  data?: string;
  size?: number;
}

export interface PortLike {
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  close?(): Promise<void>;
}

const ESPRESSIF_VID = 0x303a; // native USB of ESP32-C3/C6 (USB-Serial-JTAG)
export const CHUNK_BYTES = 3072; // must not exceed the firmware's kMaxReadChunk

export class SerialLink {
  private pending: { id: number; resolve: (r: RpcResponse) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> } | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private operations: Promise<unknown> = Promise.resolve();
  private nextId = 1;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private reading: Promise<void> | null = null;
  private closed = false;
  onClose: (() => void) | null = null;

  constructor(private port: PortLike) {}

  static supported(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.serial;
  }

  // Asks the user to pick the board (or reuses a port they granted before).
  static async connect(reuseGranted = false): Promise<SerialLink> {
    if (!SerialLink.supported()) throw new Error(t("This browser can't connect over USB. Use Chrome or Edge on a computer."));
    const serial = navigator.serial!;
    let port: SerialPort | undefined;
    if (reuseGranted) {
      port = (await serial.getPorts()).find((p) => p.getInfo().usbVendorId === ESPRESSIF_VID);
      if (!port) throw new Error('no granted port');
    } else {
      port = await serial.requestPort({ filters: [{ usbVendorId: ESPRESSIF_VID }] });
    }
    await port.open({ baudRate: 115200 });
    // Keep EN/BOOT released: on the USB-Serial-JTAG these lines can reset the chip into the bootloader.
    await port.setSignals({ dataTerminalReady: false, requestToSend: false }).catch(() => {});
    const link = new SerialLink(port);
    port.addEventListener('disconnect', () => link.handleClose());
    link.start();
    try {
      await link.waitReady();
    } catch (e) {
      await link.close();
      throw e;
    }
    return link;
  }

  start() {
    this.reader = this.port.readable!.getReader();
    this.reading = this.readLoop();
  }

  private async readLoop() {
    let buf = '';
    const decoder = new TextDecoder();
    try {
      for (;;) {
        const { value, done } = await this.reader!.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).replace(/\r$/, '');
          buf = buf.slice(nl + 1);
          this.handleLine(line);
        }
        if (buf.length > 16384) throw new Error('serial line too long');
      }
    } catch {
      /* port went away */
    } finally {
      this.reader?.releaseLock();
      this.reader = null;
      this.handleClose();
    }
  }

  private handleLine(line: string) {
    if (!line.startsWith('@')) return; // firmware log output
    let msg: RpcResponse;
    try {
      msg = JSON.parse(line.slice(1));
    } catch {
      return;
    }
    if (this.pending && msg.id === this.pending.id) {
      const p = this.pending;
      this.pending = null;
      clearTimeout(p.timer);
      p.resolve(msg);
    }
  }

  private handleClose() {
    if (this.closed) return;
    this.closed = true;
    this.rejectPending(new Error(t('The USB cable was disconnected')));
    this.onClose?.();
  }

  get isOpen() {
    return !this.closed;
  }

  private rejectPending(error: Error) {
    const p = this.pending;
    this.pending = null;
    if (p) { clearTimeout(p.timer); p.reject(error); }
  }

  // All chunks and the final save acknowledgement belong to one operation.
  exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.operations.then(fn, fn);
    this.operations = next.catch(() => {});
    return next;
  }

  // Sends one request and waits for its response (requests are queued).
  request(msg: Record<string, unknown>, timeoutMs = 8000): Promise<RpcResponse> {
    const run = async () => {
      if (this.closed) throw new Error(t('Not connected over USB'));
      const id = this.nextId++;
      const line = '@' + JSON.stringify({ ...msg, id }) + '\n';
      const writer = this.port.writable!.getWriter();
      this.writer = writer;
      const result = new Promise<RpcResponse>((resolve, reject) => {
        const timer = setTimeout(() => {
          if (this.pending?.id === id) {
            this.rejectPending(new Error(t('The board is not answering over USB')));
          }
        }, timeoutMs);
        this.pending = { id, resolve, reject, timer };
      });
      // The reader can reject while write() is still pending.
      result.catch(() => {});
      try {
        await writer.write(new TextEncoder().encode(line));
      } catch {
        this.rejectPending(new Error(t("Couldn't send data over USB")));
      } finally {
        writer.releaseLock();
        if (this.writer === writer) this.writer = null;
      }
      return result;
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => {});
    return next;
  }

  // The board may be rebooting (opening the port can reset it) or still joining Wi-Fi.
  async waitReady(totalMs = 30000) {
    const start = Date.now();
    while (Date.now() - start < totalMs) {
      try {
        const r = await this.request({ op: 'hello' }, 1500);
        if (r.status === 200) return r.body;
      } catch {
        if (this.closed) throw new Error(t('The USB cable was disconnected'));
      }
    }
    throw new Error(t('The board is not answering over USB. Check that it runs the latest firmware.'));
  }

  async close() {
    this.handleClose();
    try { await this.writer?.abort(); } catch { /* disconnected */ }
    try {
      await this.reader?.cancel();
    } catch { /* already closed */ }
    await this.reading;
    await this.queue;
    try {
      await this.port.close?.();
    } catch { /* already closed */ }
  }
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
