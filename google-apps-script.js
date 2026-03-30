// =============================================================================
//  Google Apps Script — Sync partidos LaLiga a Google Calendar
//
//  SETUP:
//  1. Ve a https://script.google.com/ y crea un proyecto nuevo
//  2. Pega este codigo completo en el editor
//  3. Cambia CALENDAR_ID por el ID de tu calendario (linea 11)
//  4. Deploy > New deployment > Web app
//     - Execute as: Me
//     - Who has access: Anyone (o Anyone within your organization)
//  5. Copia la URL del deployment y pegala en GCAL_SCRIPT_URL en index.html
// =============================================================================

const CALENDAR_ID = 'c_ef9bbc45c83bc9048068acd5fedc47c48f8bcf00741b42a9d7a60ab03d247b11@group.calendar.google.com';
const TAG_KEY = 'espnMatchId';
const SOURCE_TAG = 'laliga-calendario';

// Google Calendar color IDs: 11 = Tomato (red), 10 = Basil (green)
const COLOR_MAP = { ea: '11', hyper: '10' };

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const matches = payload.matches || [];

    const cal = CalendarApp.getCalendarById(CALENDAR_ID);
    if (!cal) {
      return jsonResponse({ ok: false, error: 'Calendario no encontrado. Verifica CALENDAR_ID.' });
    }

    // 1. Get all existing events tagged by us (season range: Aug prev year - Jul next year)
    const now = new Date();
    const seasonStart = new Date(now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1, 7, 1);
    const seasonEnd = new Date(seasonStart.getFullYear() + 1, 6, 31);
    const existing = cal.getEvents(seasonStart, seasonEnd);

    // Index existing events by ESPN match ID
    const existingById = {};
    for (const ev of existing) {
      const tag = ev.getTag(TAG_KEY);
      if (tag && ev.getTag('source') === SOURCE_TAG) {
        existingById[tag] = ev;
      }
    }

    // 2. Create or update
    const currentIds = {};
    let created = 0, updated = 0, deleted = 0, skipped = 0;

    for (const m of matches) {
      currentIds[m.id] = true;
      const start = new Date(m.start);
      const end = new Date(m.end);
      const ex = existingById[m.id];

      if (ex) {
        // Check if update needed
        if (ex.getTitle() !== m.summary || ex.getStartTime().getTime() !== start.getTime()) {
          ex.setTitle(m.summary);
          ex.setTime(start, end);
          ex.setLocation(m.location || '');
          ex.setDescription(m.description || '');
          if (m.colorId) ex.setColor(m.colorId);
          updated++;
        } else {
          skipped++;
        }
      } else {
        const ev = cal.createEvent(m.summary, start, end, {
          location: m.location || '',
          description: m.description || ''
        });
        ev.setTag(TAG_KEY, m.id);
        ev.setTag('source', SOURCE_TAG);
        if (m.colorId) ev.setColor(m.colorId);
        created++;
      }
    }

    // 3. Delete events no longer in the list
    for (const [matchId, ev] of Object.entries(existingById)) {
      if (!currentIds[matchId]) {
        ev.deleteEvent();
        deleted++;
      }
    }

    return jsonResponse({ ok: true, created, updated, deleted, skipped });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message || String(err) });
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Optional: test from the editor
function testDoPost() {
  const fake = {
    postData: {
      contents: JSON.stringify({
        matches: [
          {
            id: 'test-123',
            summary: 'TEST vs TEST',
            start: new Date().toISOString(),
            end: new Date(Date.now() + 7200000).toISOString(),
            location: 'Test Stadium',
            description: 'Test match',
            colorId: '11'
          }
        ]
      })
    }
  };
  const result = doPost(fake);
  Logger.log(result.getContent());
}
