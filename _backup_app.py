import shutil, os, sys
from datetime import datetime
sys.stdout.reconfigure(encoding='utf-8')
src = 'app.js'
if not os.path.exists(src):
    print('SKIP missing'); sys.exit(1)
sz = os.path.getsize(src)
if sz == 0:
    print('!!! refusing empty'); sys.exit(1)
os.makedirs('.backups', exist_ok=True)
stamp = datetime.now().strftime('%Y%m%d_%H%M%S')
dest = os.path.join('.backups', stamp + '_app.js')
shutil.copy2(src, dest)
print('OK', dest, sz//1024, 'KB')
