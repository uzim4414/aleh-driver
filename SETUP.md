# הגדרות לאחר Deploy — Driver PWA

## שלב 1: GAS Web App URL

אחרי `clasp push` + deploy ב-Apps Script:
1. Apps Script → Deploy → Manage deployments → URL
2. פתח `app.js` ושים ב: `const GAS_URL = 'https://script.google.com/macros/s/AKf.../exec';`

## שלב 2: Google OAuth Client ID

1. https://console.cloud.google.com → APIs & Services → Credentials
2. Create Credentials → OAuth 2.0 Client ID → Web application
3. Authorized JavaScript origins: הוסף את ה-URL שממנו ה-PWA יוגש (GitHub Pages / Netlify / וכו')
4. העתק Client ID → שים ב: `const GOOGLE_CLIENT_ID = '123456789.apps.googleusercontent.com';`

## שלב 3: FCM Server Key (push notifications — אופציונלי)

1. https://console.firebase.google.com → Project settings → Cloud Messaging
2. Server key → פתח Google Sheets → Settings sheet → הוסף שורה:
   - עמודה A: `fcm_server_key`
   - עמודה B: [המפתח שהעתקת]

## שלב 4: הגשת ה-PWA לנהגים

**GitHub Pages (מומלץ — חינמי):**
1. צור repo חדש ב-GitHub
2. העלה את תיקיית `driver/` כולה
3. Settings → Pages → Branch: main → /root → Save
4. URL: `https://[username].github.io/[repo]/`

**Netlify:**
- גרור את תיקיית `driver/` לתוך https://app.netlify.com/drop

## שלב 5: שליחה לנהגים

שלח WhatsApp לנהגים:
> "כנסו לקישור: [URL] → לחצו על 3 הנקודות בכרום → 'הוסף למסך הבית' → 'הוסף' ✓"

## במצב דמו (ללא GAS_URL)

האפליקציה עובדת במצב דמו עם נתוני דוגמה.
כדי לעבוד עם נתונים אמיתיים — הגדר `GAS_URL` ו-`GOOGLE_CLIENT_ID`.
