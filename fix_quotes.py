# -*- coding: utf-8 -*-
import re

with open('app.js', 'r', encoding='utf-8') as f:
    src = f.read()

fixes = [
    # line 279 — puncture provider phone button
    (
        """'<button class="help-action-btn" onclick="window.open('tel:' + (p.phone||'').replace(/[^0-9*+]/g,'') + '')">&#x1F4DE; ' + (p.phone||'') + ' &#x2014; חייג עכשיו</button>' +""",
        """'<button class="help-action-btn" onclick="window.open(\\'tel:\\' + (p.phone||\\'\\').replace(/[^0-9*+]/g,\\'\\') + \\'\\')">&#x1F4DE; ' + (p.phone||'') + ' &#x2014; חייג עכשיו</button>' +"""
    ),
    # line 280 — puncture mapsUrl button (with provider)
    (
        """'<button class="help-action-btn secondary" onclick="window.open('' + mapsUrl + '','_blank')">&#x1F50D; פנצריות פתוחות 24/7 קרוב אליי</button>' +""",
        """'<button class="help-action-btn secondary" onclick="window.open(\\'' + mapsUrl + '\\')" >&#x1F50D; פנצריות פתוחות 24/7 קרוב אליי</button>' +"""
    ),
    # line 290 — puncture mapsUrl button (no provider)
    (
        """'<button class="help-action-btn" onclick="window.open('' + mapsUrl + '','_blank')">&#x1F50D; מצא פנצריות פתוחות 24/7 קרוב אליי</button>' +""",
        """'<button class="help-action-btn" onclick="window.open(\\'' + mapsUrl + '\\')" >&#x1F50D; מצא פנצריות פתוחות 24/7 קרוב אליי</button>' +"""
    ),
    # line 315 — battery *6140 call
    (
        """'<button class="help-action-btn" onclick="window.open('tel:*6140');APP._batteryCall()">&#x1F4DE; *6140 &#x2014; התקשר עכשיו</button>' +""",
        """'<button class="help-action-btn" onclick="window.open(\\'tel:*6140\\');APP._batteryCall()">&#x1F4DE; *6140 &#x2014; התקשר עכשיו</button>' +"""
    ),
    # line 316 — battery WhatsApp button
    (
        """'<button class="help-action-btn secondary" onclick="APP._batteryWa('' + waUrl + '')">&#x1F4AC; שלח וואטסאפ + מיקום</button>' +""",
        """'<button class="help-action-btn secondary" onclick="APP._batteryWa(\\'' + waUrl + '\\')">&#x1F4AC; שלח וואטסאפ + מיקום</button>' +"""
    ),
    # line 344 — towing mgr phone button
    (
        """(mgrPhone ? '<button class="help-action-btn" onclick="window.open('tel:' + mgrPhone.replace(/[^0-9+]/g,'') + '')">&#x1F4DE; התקשר למנהל הצי</button>' : '') +""",
        """(mgrPhone ? '<button class="help-action-btn" onclick="window.open(\\'tel:\\' + mgrPhone.replace(/[^0-9+]/g,\\'\\') + \\'\\')">&#x1F4DE; התקשר למנהל הצי</button>' : '') +"""
    ),
    # line 354 — towing insurance emergency phone button
    (
        """(ins.emergencyPhone ? '<button class="help-action-btn" onclick="window.open('tel:' + ins.emergencyPhone.replace(/[^0-9+]/g,'') + '')">&#x1F4DE; מוקד חירום 24/7 &#x2014; ' + ins.emergencyPhone + '</button>' : '') +""",
        """(ins.emergencyPhone ? '<button class="help-action-btn" onclick="window.open(\\'tel:\\' + ins.emergencyPhone.replace(/[^0-9+]/g,\\'\\') + \\'\\')">&#x1F4DE; מוקד חירום 24/7 &#x2014; ' + ins.emergencyPhone + '</button>' : '') +"""
    ),
    # line 384 — appointment garage phone button
    (
        """(garagePhone ? '<button class="help-action-btn secondary" style="margin-bottom:16px" onclick="window.open('tel:' + garagePhone.replace(/[^0-9+]/g,'') + '')">&#x1F4DE; חייג למוסך</button>' : '') +""",
        """(garagePhone ? '<button class="help-action-btn secondary" style="margin-bottom:16px" onclick="window.open(\\'tel:\\' + garagePhone.replace(/[^0-9+]/g,\\'\\') + \\'\\')">&#x1F4DE; חייג למוסך</button>' : '') +"""
    ),
]

count = 0
for old, new in fixes:
    if old in src:
        src = src.replace(old, new, 1)
        count += 1
        print('  OK: fixed quote in: ' + old[:60])
    else:
        print('  WARN not found: ' + old[:60])

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(src)

print('Done. %d/%d fixes applied.' % (count, len(fixes)))
