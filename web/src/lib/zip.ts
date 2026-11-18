export type ZipTextFile = { name: string; content: string };

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_RECORD = 0x06054b50;
const FLAG_UTF8 = 0x0800;
const VERSION = 20;
const MAX_ENTRIES = 0xffff;
const MAX_OFFSET = 0xffffffff;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const deflate = async (
  bytes: Uint8Array<ArrayBuffer>,
): Promise<{ data: Uint8Array<ArrayBuffer>; method: number }> => {
  if (typeof CompressionStream === "undefined") return { data: bytes, method: 0 };
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    const buffer = await new Response(stream).arrayBuffer();
    return { data: new Uint8Array(buffer), method: 8 };
  } catch {
    return { data: bytes, method: 0 };
  }
};

const dosDateTime = (date: Date): { time: number; day: number } => ({
  time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
  day: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
});

const localHeader = (
  name: Uint8Array,
  method: number,
  crc: number,
  compressed: number,
  size: number,
  time: number,
  day: number,
): Uint8Array<ArrayBuffer> => {
  const header = new Uint8Array(30 + name.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, LOCAL_HEADER, true);
  view.setUint16(4, VERSION, true);
  view.setUint16(6, FLAG_UTF8, true);
  view.setUint16(8, method, true);
  view.setUint16(10, time, true);
  view.setUint16(12, day, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, compressed, true);
  view.setUint32(22, size, true);
  view.setUint16(26, name.length, true);
  view.setUint16(28, 0, true);
  header.set(name, 30);
  return header;
};

const centralHeader = (
  name: Uint8Array,
  method: number,
  crc: number,
  compressed: number,
  size: number,
  time: number,
  day: number,
  offset: number,
): Uint8Array<ArrayBuffer> => {
  const header = new Uint8Array(46 + name.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, CENTRAL_HEADER, true);
  view.setUint16(4, VERSION, true);
  view.setUint16(6, VERSION, true);
  view.setUint16(8, FLAG_UTF8, true);
  view.setUint16(10, method, true);
  view.setUint16(12, time, true);
  view.setUint16(14, day, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, compressed, true);
  view.setUint32(24, size, true);
  view.setUint16(28, name.length, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, offset, true);
  header.set(name, 46);
  return header;
};

const endRecord = (count: number, size: number, offset: number): Uint8Array<ArrayBuffer> => {
  const record = new Uint8Array(22);
  const view = new DataView(record.buffer);
  view.setUint32(0, END_RECORD, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, count, true);
  view.setUint16(10, count, true);
  view.setUint32(12, size, true);
  view.setUint32(16, offset, true);
  view.setUint16(20, 0, true);
  return record;
};

export const zipTextFiles = async (files: ZipTextFile[]): Promise<Blob> => {
  if (files.length > MAX_ENTRIES) throw new Error("too many zip entries");
  const encoder = new TextEncoder();
  const stamp = dosDateTime(new Date());
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  const directory: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;
  let directorySize = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const raw = encoder.encode(file.content);
    const crc = crc32(raw);
    const { data, method } = await deflate(raw);
    const local = localHeader(name, method, crc, data.length, raw.length, stamp.time, stamp.day);
    const entry = centralHeader(
      name,
      method,
      crc,
      data.length,
      raw.length,
      stamp.time,
      stamp.day,
      offset,
    );
    chunks.push(local, data);
    directory.push(entry);
    offset += local.length + data.length;
    directorySize += entry.length;
    if (offset > MAX_OFFSET || directorySize > MAX_OFFSET) {
      throw new Error("zip is too large");
    }
  }
  const end = endRecord(files.length, directorySize, offset);
  return new Blob([...chunks, ...directory, end], { type: "application/zip" });
};
