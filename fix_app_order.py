# -*- coding: utf-8 -*-
"""
Move all APP.xxx = assignments from the help-menu block (lines ~202-427)
to AFTER the const APP = {...}; definition (line ~1598).

Strategy:
1. Extract the help-menu APP methods block
2. Remove it from its current position
3. Insert it right after the closing "};" of const APP
"""

with open('app.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# ── Step 1: find the block boundaries ──
# Block starts at the comment line: /* ══ Help Menu ══ */
# Block ends just before "/* ══ Session ══ */" (or similar)
# We know standalone functions before the APP block should stay.

BLOCK_START_MARKER = '/* ══════════════════════════════════════════════════════════════\n'
BLOCK_START_NEXT   = '   Help Menu\n'
BLOCK_END_MARKER   = "/* ═══════════════════\n"  # next major section

# Find start of the block (the "Help Menu" comment)
block_start = None
for i, line in enumerate(lines):
    if line == BLOCK_START_MARKER and i+1 < len(lines) and lines[i+1] == BLOCK_START_NEXT:
        block_start = i
        break

if block_start is None:
    print('ERROR: Help Menu block start not found')
    exit(1)

# Find end of block: first APP._apptSubmit function closing, then the next top-level comment or function
# The block ends just before the next /* ══ section (Session, etc.)
# Scan from block_start forward
block_end = None
for i in range(block_start + 5, len(lines)):
    stripped = lines[i].strip()
    # End when we hit the next major comment block or standalone function
    if (stripped.startswith('/* ══') or
        stripped.startswith('// ══') or
        stripped.startswith('function ') or
        stripped.startswith('const ') or
        stripped.startswith('var ') or
        stripped.startswith('let ') or
        stripped.startswith('async function ')):
        block_end = i
        break

if block_end is None:
    print('ERROR: Help Menu block end not found')
    exit(1)

print('Block: lines %d - %d (%d lines)' % (block_start+1, block_end, block_end - block_start))
print('Block starts at line %d' % (block_start+1))
print('Block ends before line %d' % block_end)

# ── Step 2: find const APP closing "};" ──
app_def_start = None
app_def_end = None
for i, line in enumerate(lines):
    if line.strip().startswith('const APP = {') or line.strip() == 'const APP = {':
        app_def_start = i
    if app_def_start and i > app_def_start and line.rstrip() == '};':
        app_def_end = i
        break

if app_def_start is None or app_def_end is None:
    print('ERROR: const APP not found (start=%s end=%s)' % (app_def_start, app_def_end))
    exit(1)

print('const APP: lines %d - %d' % (app_def_start+1, app_def_end+1))

# ── Step 3: extract the block ──
help_block = lines[block_start:block_end]

# ── Step 4: build new file ──
before_block  = lines[:block_start]
after_block   = lines[block_end:]

# app_def_end index has shifted because we removed help_block
# Recalculate app_def_end in the new array
new_lines = before_block + after_block
# Find the new position of the APP closing
new_app_end = None
new_start = app_def_start  # same start (it was before block_start)
for i in range(new_start + 1, len(new_lines)):
    if new_lines[i].rstrip() == '};':
        new_app_end = i
        break

if new_app_end is None:
    print('ERROR: could not find }; after APP in rebuilt array')
    exit(1)

print('New APP end: line %d' % (new_app_end + 1))

# Insert help_block AFTER the "};" line
final = new_lines[:new_app_end+1] + ['\n'] + help_block + new_lines[new_app_end+1:]

with open('app.js', 'w', encoding='utf-8') as f:
    f.writelines(final)

print('Done. File written.')
print('Total lines: %d -> %d' % (len(lines), len(final)))
