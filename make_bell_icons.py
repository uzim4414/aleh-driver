#!/usr/bin/env python3
"""
Generate monochrome white-on-transparent bell notification icons.
Creates:
  icons/notif-bell.png   — 192x192, used as 'icon' in showNotification()
  icons/notif-badge.png  — 96x96,   used as 'badge' in showNotification()
No external dependencies — pure stdlib (struct + zlib).
"""

import struct
import zlib
import os
import math


def in_bell(bx, by):
    """Returns True if pixel (bx, by) in 96-unit space is part of the bell."""
    bcx = 48.0

    # Handle: narrow vertical rectangle at top center
    if 44.5 <= bx <= 51.5 and 6.0 <= by <= 20.0:
        return True

    # Bell dome: filled upper semicircle, center at (48, 48), radius 30
    dome_r = 30.0
    dome_cy = 48.0
    dx, dy = bx - bcx, by - dome_cy
    if dx * dx + dy * dy <= dome_r * dome_r and by <= dome_cy:
        return True

    # Bell body: trapezoid from dome midpoint down to rim
    rim_y = 74.0
    if dome_cy < by <= rim_y:
        t = (by - dome_cy) / (rim_y - dome_cy)
        hw = dome_r + t * 8.0  # 30 → 38 half-width
        if abs(bx - bcx) <= hw:
            return True

    # Bell rim: solid ellipse at the open bottom of the bell
    rim_cy_v = 75.0
    rim_rx, rim_ry = 38.0, 5.5
    if ((bx - bcx) / rim_rx) ** 2 + ((by - rim_cy_v) / rim_ry) ** 2 <= 1.0:
        return True

    # Clapper: small filled circle below the rim
    clapper_cy = 86.0
    if (bx - bcx) ** 2 + (by - clapper_cy) ** 2 <= 5.5 ** 2:
        return True

    return False


def make_rows(size):
    """Render bell at given pixel size. Returns list of rows of RGBA bytes."""
    s = size / 96.0
    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            # Map pixel to 96-unit space
            bx = x / s
            by = y / s
            if in_bell(bx, by):
                row += b'\xff\xff\xff\xff'  # white opaque
            else:
                row += b'\x00\x00\x00\x00'  # fully transparent
        rows.append(bytes(row))
    return rows


def png_chunk(tag, data):
    tag_b = tag.encode('ascii') if isinstance(tag, str) else tag
    crc = zlib.crc32(tag_b + data) & 0xffffffff
    return struct.pack('>I', len(data)) + tag_b + data + struct.pack('>I', crc)


def build_png(rows):
    h = len(rows)
    w = len(rows[0]) // 4  # 4 bytes per pixel (RGBA)

    # IHDR: width, height, bit_depth=8, color_type=6 (RGBA),
    #       compression=0, filter=0, interlace=0
    ihdr = struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)

    # IDAT: raw scanlines (filter byte 0 + RGBA row), zlib-compressed
    raw = bytearray()
    for row in rows:
        raw.append(0)  # filter type = None
        raw.extend(row)

    idat = zlib.compress(bytes(raw), 9)

    sig = b'\x89PNG\r\n\x1a\n'
    return (
        sig
        + png_chunk('IHDR', ihdr)
        + png_chunk('IDAT', idat)
        + png_chunk('IEND', b'')
    )


if __name__ == '__main__':
    script_dir = os.path.dirname(os.path.abspath(__file__))
    icons_dir = os.path.join(script_dir, 'icons')
    os.makedirs(icons_dir, exist_ok=True)

    targets = [
        (192, 'notif-bell.png'),
        (96,  'notif-badge.png'),
    ]

    for size, name in targets:
        rows = make_rows(size)
        png_data = build_png(rows)
        out_path = os.path.join(icons_dir, name)
        with open(out_path, 'wb') as f:
            f.write(png_data)
        print(f'  {name}: {size}x{size}, {len(png_data):,} bytes -> {out_path}')

    print('Done.')
