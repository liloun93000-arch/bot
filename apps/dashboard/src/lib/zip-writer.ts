import { createWriteStream, type WriteStream } from "node:fs";
import { crc32, deflateRawSync } from "node:zlib";

/**
 * Écrivain ZIP minimal et sans dépendance : une entrée à la fois, écrite sur
 * disque (jamais tout le ZIP en mémoire). Les textes sont compressés (deflate),
 * les médias — déjà compressés — sont stockés tels quels. Les noms sont en UTF-8.
 */
interface Central {
  name: Buffer;
  crc: number;
  csize: number;
  size: number;
  method: number;
  offset: number;
  dosTime: number;
  dosDate: number;
}

function dos(date: Date): { time: number; date: number } {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

export class ZipWriter {
  private readonly out: WriteStream;
  private offset = 0;
  private readonly entries: Central[] = [];
  private failure: Error | null = null;

  constructor(path: string) {
    this.out = createWriteStream(path);
    this.out.on("error", (e) => (this.failure = e));
  }

  private write(buf: Buffer): Promise<void> {
    if (this.failure) return Promise.reject(this.failure);
    this.offset += buf.length;
    return new Promise((resolve, reject) => {
      this.out.write(buf, (err) => (err ? reject(err) : resolve()));
    });
  }

  async add(name: string, data: Buffer, opts: { compress?: boolean; date?: Date } = {}): Promise<void> {
    const nameBuf = Buffer.from(name, "utf8");
    const compress = opts.compress ?? true;
    const body = compress && data.length > 64 ? deflateRawSync(data) : data;
    const method = body === data ? 0 : 8;
    const d = dos(opts.date ?? new Date());
    const crc = crc32(data) >>> 0;
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6); // nom UTF-8
    header.writeUInt16LE(method, 8);
    header.writeUInt16LE(d.time, 10);
    header.writeUInt16LE(d.date, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(body.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(nameBuf.length, 26);
    const entry: Central = {
      name: nameBuf, crc, csize: body.length, size: data.length, method,
      offset: this.offset, dosTime: d.time, dosDate: d.date,
    };
    await this.write(Buffer.concat([header, nameBuf]));
    await this.write(body);
    this.entries.push(entry);
  }

  async finish(): Promise<void> {
    const start = this.offset;
    for (const e of this.entries) {
      const c = Buffer.alloc(46);
      c.writeUInt32LE(0x02014b50, 0);
      c.writeUInt16LE(20, 4);
      c.writeUInt16LE(20, 6);
      c.writeUInt16LE(0x0800, 8);
      c.writeUInt16LE(e.method, 10);
      c.writeUInt16LE(e.dosTime, 12);
      c.writeUInt16LE(e.dosDate, 14);
      c.writeUInt32LE(e.crc, 16);
      c.writeUInt32LE(e.csize, 20);
      c.writeUInt32LE(e.size, 24);
      c.writeUInt16LE(e.name.length, 28);
      c.writeUInt32LE(e.offset, 42);
      await this.write(Buffer.concat([c, e.name]));
    }
    const size = this.offset - start;
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(this.entries.length, 8);
    end.writeUInt16LE(this.entries.length, 10);
    end.writeUInt32LE(size, 12);
    end.writeUInt32LE(start, 16);
    await this.write(end);
    await new Promise<void>((resolve, reject) => this.out.end((err?: Error | null) => (err ? reject(err) : resolve())));
  }

  abort(): void {
    this.out.destroy();
  }
}
