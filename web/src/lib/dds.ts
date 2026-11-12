export type DecodedDds = { width: number; height: number; data: ImageData };

const MAGIC = "DDS ";
const FOURCC_OFFSET = 84;
const HEADER_BYTES = 128;
const MAX_SIDE = 4096;
const ALPHA_POWERS = Array.from({ length: 16 }, (_, index) => 8 ** index);

const alphaPalette = (first: number, second: number): number[] => {
  if (first > second) {
    return [
      first,
      second,
      ...Array.from({ length: 6 }, (_, index) =>
        Math.floor(((6 - index) * first + (index + 1) * second) / 7),
      ),
    ];
  }
  const palette = [first, second];
  for (let index = 0; index < 4; index += 1) {
    palette.push(Math.floor(((4 - index) * first + (index + 1) * second) / 5));
  }
  palette.push(0, 255);
  return palette;
};

const colorPalette = (first: number, second: number): [number, number, number][] => {
  const one: [number, number, number] = [
    Math.round(((first >> 11) & 31) * (255 / 31)),
    Math.round(((first >> 5) & 63) * (255 / 63)),
    Math.round((first & 31) * (255 / 31)),
  ];
  const two: [number, number, number] = [
    Math.round(((second >> 11) & 31) * (255 / 31)),
    Math.round(((second >> 5) & 63) * (255 / 63)),
    Math.round((second & 31) * (255 / 31)),
  ];
  if (first > second) {
    return [
      one,
      two,
      [
        Math.floor((2 * one[0] + two[0]) / 3),
        Math.floor((2 * one[1] + two[1]) / 3),
        Math.floor((2 * one[2] + two[2]) / 3),
      ],
      [
        Math.floor((one[0] + 2 * two[0]) / 3),
        Math.floor((one[1] + 2 * two[1]) / 3),
        Math.floor((one[2] + 2 * two[2]) / 3),
      ],
    ];
  }
  return [
    one,
    two,
    [
      Math.floor((one[0] + two[0]) / 2),
      Math.floor((one[1] + two[1]) / 2),
      Math.floor((one[2] + two[2]) / 2),
    ],
    [0, 0, 0],
  ];
};

export const decodeDds = (buffer: ArrayBuffer): DecodedDds => {
  const view = new DataView(buffer);
  if (buffer.byteLength < HEADER_BYTES + 16) throw new Error("dds header is truncated");
  const magic = String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3),
  );
  if (magic !== MAGIC) throw new Error("dds magic mismatch");
  const fourcc = String.fromCharCode(
    view.getUint8(FOURCC_OFFSET),
    view.getUint8(FOURCC_OFFSET + 1),
    view.getUint8(FOURCC_OFFSET + 2),
    view.getUint8(FOURCC_OFFSET + 3),
  );
  if (fourcc !== "DXT5") throw new Error(`unsupported dds format ${fourcc}`);
  const height = view.getUint32(12, true);
  const width = view.getUint32(16, true);
  if (!width || !height || width > MAX_SIDE || height > MAX_SIDE) {
    throw new Error(`unsupported dds size ${width}x${height}`);
  }
  const blocksX = Math.ceil(width / 4);
  const blocksY = Math.ceil(height / 4);
  if (buffer.byteLength < HEADER_BYTES + blocksX * blocksY * 16) {
    throw new Error("dds payload is truncated");
  }
  const pixels = new Uint8ClampedArray(width * height * 4);
  let offset = HEADER_BYTES;
  for (let blockY = 0; blockY < blocksY; blockY += 1) {
    for (let blockX = 0; blockX < blocksX; blockX += 1) {
      const alphas = alphaPalette(view.getUint8(offset), view.getUint8(offset + 1));
      let alphaBits = 0;
      for (let index = 5; index >= 0; index -= 1) {
        alphaBits = alphaBits * 256 + view.getUint8(offset + 2 + index);
      }
      const first = view.getUint16(offset + 8, true);
      const second = view.getUint16(offset + 10, true);
      const colors = colorPalette(first, second);
      const colorBits = view.getUint32(offset + 12, true);
      for (let pixel = 0; pixel < 16; pixel += 1) {
        const x = blockX * 4 + (pixel % 4);
        const y = blockY * 4 + Math.floor(pixel / 4);
        if (x >= width || y >= height) continue;
        const alpha = alphas[Math.floor(alphaBits / ALPHA_POWERS[pixel]) % 8];
        const color = colors[(colorBits >>> (pixel * 2)) & 3];
        const target = (y * width + x) * 4;
        pixels[target] = color[0];
        pixels[target + 1] = color[1];
        pixels[target + 2] = color[2];
        pixels[target + 3] = alpha;
      }
      offset += 16;
    }
  }
  return { width, height, data: new ImageData(pixels, width, height) };
};

const cache = new Map<string, Promise<ImageData>>();

export const loadPortrait = (url: string): Promise<ImageData> => {
  const hit = cache.get(url);
  if (hit) return hit;
  const job = fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`portrait request failed: ${response.status}`);
      return response.arrayBuffer();
    })
    .then((buffer) => decodeDds(buffer).data);
  cache.set(url, job);
  job.catch(() => cache.delete(url));
  return job;
};
