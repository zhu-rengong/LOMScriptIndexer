import struct

MAGIC = b"DDS "
FOURCC = b"DXT5"
HEADER_SIZE = 124
PIXEL_FORMAT_SIZE = 32
HEADER_FLAGS = 0x1 | 0x2 | 0x4 | 0x1000 | 0x80000
PIXEL_FORMAT_FOURCC = 0x4
CAPS_TEXTURE = 0x1000
BLOCK_BYTES = 16

EXPAND_5 = tuple(round(value * 255 / 31) for value in range(32))
EXPAND_6 = tuple(round(value * 255 / 63) for value in range(64))


def _to565(red: int, green: int, blue: int) -> int:
    return ((red >> 3) << 11) | ((green >> 2) << 5) | (blue >> 3)


def _expand(color: int) -> tuple[int, int, int]:
    return EXPAND_5[(color >> 11) & 31], EXPAND_6[(color >> 5) & 63], EXPAND_5[color & 31]


def _alpha_block(values: list[int]) -> bytes:
    low = min(values)
    high = max(values)
    if low == high:
        return bytes((high, high)) + bytes(6)
    palette = [high, low] + [((7 - step) * high + step * low) // 7 for step in range(1, 7)]
    bits = 0
    for index, value in enumerate(values):
        best = 0
        distance = 1 << 16
        for slot, alpha in enumerate(palette):
            delta = abs(alpha - value)
            if delta < distance:
                distance = delta
                best = slot
        bits |= best << (3 * index)
    return bytes((high, low)) + bits.to_bytes(6, "little")


def _color_block(block: list[tuple[int, int, int, int]]) -> bytes:
    red = [pixel[0] for pixel in block]
    green = [pixel[1] for pixel in block]
    blue = [pixel[2] for pixel in block]
    high = _to565(max(red), max(green), max(blue))
    low = _to565(min(red), min(green), min(blue))
    if high < low:
        high, low = low, high
    if high == low:
        return struct.pack("<HHI", high, low, 0)
    first = _expand(high)
    second = _expand(low)
    palette = (
        first,
        second,
        tuple((2 * first[channel] + second[channel]) // 3 for channel in range(3)),
        tuple((first[channel] + 2 * second[channel]) // 3 for channel in range(3)),
    )
    bits = 0
    for index, pixel in enumerate(block):
        best = 0
        distance = 1 << 30
        for slot, color in enumerate(palette):
            delta = ((pixel[0] - color[0]) ** 2 + (pixel[1] - color[1]) ** 2
                     + (pixel[2] - color[2]) ** 2)
            if delta < distance:
                distance = delta
                best = slot
        bits |= best << (2 * index)
    return struct.pack("<HHI", high, low, bits)


def encode_bc3(rgba: bytes, width: int, height: int) -> bytes:
    blocks: list[bytes] = []
    for top in range(0, height, 4):
        for left in range(0, width, 4):
            pixels: list[tuple[int, int, int, int]] = []
            for row in range(4):
                y = min(top + row, height - 1)
                base = y * width
                for column in range(4):
                    x = min(left + column, width - 1)
                    offset = (base + x) * 4
                    pixels.append((rgba[offset], rgba[offset + 1], rgba[offset + 2],
                                   rgba[offset + 3]))
            blocks.append(_alpha_block([pixel[3] for pixel in pixels])
                          + _color_block(pixels))
    return b"".join(blocks)


def to_dds(rgba: bytes, width: int, height: int) -> bytes:
    blocks = encode_bc3(rgba, width, height)
    header = struct.pack(
        "<7I", HEADER_SIZE, HEADER_FLAGS, height, width, len(blocks), 0, 0)
    header += bytes(44)
    header += struct.pack(
        "<2I4s5I", PIXEL_FORMAT_SIZE, PIXEL_FORMAT_FOURCC, FOURCC, 0, 0, 0, 0, 0)
    header += struct.pack("<5I", CAPS_TEXTURE, 0, 0, 0, 0)
    return MAGIC + header + blocks
