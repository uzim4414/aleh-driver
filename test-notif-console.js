// ========================================
// TEST NOTIFICATIONS — paste in Chrome DevTools Console
// while driver app is open at the driver URL
// ========================================

var TEST_PAYLOADS = {

  overdue: {
    notification: { title: '⚠️ טיפול באיחור!', body: 'הרכב עבר את מועד הטיפול לפני 1,200 ק"מ. יש לתאם מיידית.' },
    data: { alertType: 'overdue', vehicleId: '143', kmLeft: 1200, nextKm: 86140, estKm: 87340, ts: Date.now() }
  },

  urgent: {
    notification: { title: '🟠 טיפול מתקרב', body: 'נותרו 430 ק"מ עד לטיפול הבא.' },
    data: { alertType: 'urgent', vehicleId: '143', kmLeft: 430, nextKm: 87770, estKm: 87340, ts: Date.now() }
  },

  plan: {
    notification: { title: '📅 תכנן טיפול', body: 'נותרו 2,800 ק"מ עד לטיפול הבא.' },
    data: { alertType: 'plan', vehicleId: '143', kmLeft: 2800, nextKm: 90000, ts: Date.now() }
  },

  km_update: {
    notification: { title: '🕐 עדכן קילומטראז׳', body: 'לא עדכנת קילומטראז׳ כבר 3 ימים.' },
    data: { alertType: 'km_update', vehicleId: '143', daysSinceUpdate: 3, lastKm: 87340, ts: Date.now() }
  },

  test_urgent: {
    notification: { title: '🔴 טסט רכב — דחוף!', body: 'הטסט פג תוקף בעוד 3 ימים. יש לבצע מיידית.' },
    data: { alertType: 'test_urgent', vehicleId: '143', testDate: '27/05/2026', daysLeft: 3, ts: Date.now() }
  },

  test_due: {
    notification: { title: '🟠 טסט רכב מתקרב', body: 'הטסט הבא חייב להתבצע לפני 15/06/2026.' },
    data: { alertType: 'test_due', vehicleId: '143', testDate: '15/06/2026', daysLeft: 22, ts: Date.now() }
  },

  garage_approved: {
    notification: { title: '✅ בקשת מוסך אושרה!', body: 'הבקשה אושרה על ידי המנהל. ניתן לקבוע מועד.' },
    data: { alertType: 'garage_approved', vehicleId: '143', garageInfo: 'גלית אחזקה בע"מ', eventId: 'EVT001', ts: Date.now() }
  },

  garage_rejected: {
    notification: { title: '❌ בקשת מוסך נדחתה', body: 'הבקשה נדחתה. ניתן לשלוח בקשה חדשה.' },
    data: { alertType: 'garage_rejected', vehicleId: '143', reasonLabel: 'הרכב לא דורש טיפול כעת', ts: Date.now() }
  },

  garage_appointment_set: {
    notification: { title: '📅 תור מוסך נקבע', body: 'מנהל קבע עבורך תור מוסך.' },
    data: { alertType: 'garage_appointment_set', vehicleId: '143', appointmentDate: '26/05/2026', appointmentTime: '09:00', garageInfo: 'גלית אחזקה', ts: Date.now() }
  },

  garage_appointment_cancelled: {
    notification: { title: '🚫 תור מוסך בוטל', body: 'התור ב-26/05/2026 · 09:00 בוטל.' },
    data: { alertType: 'garage_appointment_cancelled', vehicleId: '143', appointmentDate: '26/05/2026', appointmentTime: '09:00', ts: Date.now() }
  },

  fuel_high: {
    notification: { title: '⛽ צריכת דלק חריגה', body: 'צריכת הדלק גבוהה ב-23% מהממוצע הצפוי.' },
    data: { alertType: 'fuel_high', vehicleId: '143', fuelConsumption: 11.3, threshold: 10.5, fleetAverage: 9.2, ts: Date.now() }
  },

  fuel_km_high: {
    notification: { title: '💰 עלות לק"מ חריגה', body: 'עלות הדלק לק"מ גבוהה מממוצע הצי.' },
    data: { alertType: 'fuel_km_high', vehicleId: '143', costPerKm: 0.87, fleetAverage: 0.71, ts: Date.now() }
  }
};

// ============================================
// USAGE:
//   testNotif('overdue')          — test specific type
//   testNotif('fuel_high')        — test fuel
//   testAllNotifs(800)            — cycle all types (800ms delay each)
// ============================================

function testNotif(type) {
  var payload = TEST_PAYLOADS[type];
  if (!payload) {
    console.warn('Unknown type:', type, '| Valid:', Object.keys(TEST_PAYLOADS).join(', '));
    return;
  }
  // Fresh ts to bypass dedup
  payload.data.ts = Date.now();
  console.log('%c[TEST NOTIF]', 'color:#58a6ff;font-weight:bold', type, payload);
  if (typeof showInAppNotification === 'function') {
    showInAppNotification(payload);
  } else {
    console.error('showInAppNotification not found — make sure driver app is loaded');
  }
}

function testAllNotifs(delayMs) {
  var types = Object.keys(TEST_PAYLOADS);
  var i = 0;
  console.log('%c[TEST ALL]', 'color:#3fb950;font-weight:bold', types.length + ' notifications, ' + (delayMs||800) + 'ms each');
  var next = function() {
    if (i >= types.length) { console.log('%c[DONE]', 'color:#3fb950;font-weight:bold'); return; }
    testNotif(types[i++]);
    setTimeout(next, delayMs || 800);
  };
  next();
}

console.log('%c✅ Notif test loaded!', 'color:#3fb950;font-size:14px;font-weight:bold');
console.log('testNotif("overdue")   — test single type');
console.log('testAllNotifs(1000)    — cycle all 12 types');
console.log('Types:', Object.keys(TEST_PAYLOADS).join(' | '));
