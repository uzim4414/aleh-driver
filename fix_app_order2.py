# -*- coding: utf-8 -*-
"""
Move the Help Menu block (lines 202-418, 0-indexed: 201-417)
to AFTER const APP definition (which ends with "};" at line 1598, 0-indexed: 1597).

After removing the block (218 lines), const APP start shifts:
  const APP was at line 1464 -> now at line 1464-218 = 1246 (1-indexed)
  const APP end (};) was at line 1598 -> now at line 1598-218 = 1380 (1-indexed)
"""

with open('app.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

total = len(lines)
print('Total lines:', total)

# Exact 1-indexed boundaries (from grep above):
# Help block: line 202 through 418 inclusive (ends at blank line before "/* Session */")
# "/* Session */" is at line 419
HELP_START = 202 - 1   # 0-indexed: 201
HELP_END   = 419 - 1   # 0-indexed: 418  (exclusive: up to but not including this line)
# Lines 201..417 (inclusive) = the help block

# const APP closing "};" is at line 1598
APP_END = 1598 - 1     # 0-indexed: 1597

print('Help block: lines %d-%d (%d lines)' % (HELP_START+1, HELP_END, HELP_END-HELP_START))
print('APP end: line %d' % (APP_END+1))
print('APP end content:', lines[APP_END].rstrip())

# Sanity check
assert lines[HELP_START].strip().startswith('/*'), 'Expected comment at help start, got: ' + lines[HELP_START][:50]
assert lines[APP_END].rstrip() == '};', 'Expected }; at app end, got: ' + lines[APP_END][:50]

# Extract help block
help_block = lines[HELP_START:HELP_END]
print('Help block line count:', len(help_block))

# Rebuild without help block
without_block = lines[:HELP_START] + lines[HELP_END:]

# After removing HELP_END-HELP_START lines, APP_END shifts back
removed = HELP_END - HELP_START  # 217 lines removed
new_app_end = APP_END - removed
print('New APP end index:', new_app_end, '(line %d)' % (new_app_end+1))
print('New APP end ok:', without_block[new_app_end].rstrip() == '};')
assert without_block[new_app_end].rstrip() == '};', 'APP end not found after shift!'

# Insert help block AFTER the "};" line of APP
result = without_block[:new_app_end+1] + ['\n'] + help_block + without_block[new_app_end+1:]

with open('app.js', 'w', encoding='utf-8') as f:
    f.writelines(result)

print('Done. %d -> %d lines' % (total, len(result)))
