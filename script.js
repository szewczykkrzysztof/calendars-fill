// === KONFIGURACJA ===
const CLIENT_ID = "16718101302-u4f3m2o7hscp3etlssn3fvsjg28m72h0.apps.googleusercontent.com";
const SCOPES = "https://www.googleapis.com/auth/calendar.readonly";

// Wybierasz swoje kalendarze
const calendarIds = [
  "17f08fe83ddde066de05ee5a91de4aa59525d2280e311e056c7516c170e056fe@group.calendar.google.com",
  "eb3b0721a613a56fbc53649819fbc147b780f34100bdef6208d483c40ea89966@group.calendar.google.com",
  "9eeqlsgr9o8da012ser6k2j63o@group.calendar.google.com",
  "urcl2erk9auhnnl69c027a0vhg@group.calendar.google.com",
  "fkaajd35f3usfsvcbakp290ei4@group.calendar.google.com",
  "k8s9nbpc6o3hcrj563lef233lo@group.calendar.google.com",
  "5sle8p37h45t953fprgi6gf39k@group.calendar.google.com",
];

let tokenClient;
const CACHE_KEY = "calendarCacheV1";

// === HELPERS: months / keys / cache ===
function monthKeyFromDate(d) {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  return `${y}-${m}`;
}

// returns array of Date objects for the last 12 completed months,
// oldest first, excluding the current (in-progress) month
function getLast12CompletedMonths() {
  const now = new Date();
  const months = [];
  for (let i = 12; i >= 1; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(d);
  }
  return months;
}

function loadCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "null") || { events: {} };
  } catch (e) {
    console.warn("Niepoprawny cache w localStorage, czyszczę.", e);
    localStorage.removeItem(CACHE_KEY);
    return { events: {} };
  }
}

function saveCache(cache) {
  cache.updatedAt = Date.now();
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

// Ensure structure: cache.events[calendarName] is object with monthKey -> [events]
function ensureCalendarInCache(cache, calName) {
  if (!cache.events[calName]) cache.events[calName] = {};
}

// Normalize an event item: prefer date (all-day) else dateTime
function normalizeEventItem(ev) {
  const start = ev.start?.date || ev.start?.dateTime || null;
  const end = ev.end?.date || ev.end?.dateTime || null;
  return {
    id: ev.id,
    summary: ev.summary || "",
    start,
    end,
  };
}

// === CALCULATION ===
function calculatePercentages(months, cache) {
  const results = {};

  for (const calName in cache.events) {
    results[calName] = [];
    for (const month of months) {
      const key = monthKeyFromDate(month);
      const monthEvents = (cache.events[calName] && cache.events[calName][key]) || [];
      let busyMs = 0;

      for (const ev of monthEvents) {
        if (!ev.start || !ev.end) continue;
        const startEv = new Date(ev.start);
        const endEv = new Date(ev.end);
        // ensure we only count overlap within the month boundaries
        const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
        const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59, 999);
        const overlapStart = startEv > monthStart ? startEv : monthStart;
        const overlapEnd = endEv < monthEnd ? endEv : monthEnd;
        if (overlapEnd > overlapStart) {
          busyMs += overlapEnd - overlapStart;
        }
      }

      const totalHours = 24 * new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
      const hoursBusy = busyMs / 1000 / 3600;
      const percent = totalHours > 0 ? ((hoursBusy / totalHours) * 100).toFixed(1) : "0.0";
      results[calName].push(percent);
    }
  }

  return results;
}

// === MAIN LOGIC ===
async function listCalendarsData() {
  const months = getLast12CompletedMonths();
  const monthKeys = months.map(m => monthKeyFromDate(m));
  const cache = loadCache();

  // Ensure calendars exist in cache with proper structure
  for (const calId of calendarIds) {
    // Try get name to use as key (fall back to id)
    let calName = calId;
    try {
      const calResp = await gapi.client.calendar.calendars.get({ calendarId: calId });
      calName = calResp.result.summary || calName;
    } catch (err) {
      console.warn("Nie udało się pobrać nazwy kalendarza:", calId, err);
    }
    ensureCalendarInCache(cache, calName);
  }

  // Determine which (calendar, monthKey) pairs are missing
  const toFetch = []; // entries: { calendarId, calName, monthKey, startISO, endISO }
  for (const calId of calendarIds) {
    let calName = calId;
    try {
      const calResp = await gapi.client.calendar.calendars.get({ calendarId: calId });
      calName = calResp.result.summary || calName;
    } catch (err) {
      // name fallback already set
    }

    for (const month of months) {
      const key = monthKeyFromDate(month);
      // If cache already has events for this calendar and month, skip
      if (cache.events[calName] && cache.events[calName][key] && cache.events[calName][key].length > 0) {
        continue;
      }
      const start = new Date(month.getFullYear(), month.getMonth(), 1).toISOString();
      const end = new Date(month.getFullYear(), month.getMonth() + 1, 1).toISOString();
      toFetch.push({ calendarId: calId, calName, monthKey: key, start, end });
    }
  }

  if (toFetch.length > 0) {
    console.log("Pobieram brakujące miesiące z API:", toFetch.length, "zadań");
    // Group requests by calendar to reduce repeated calendarName lookups
    const byCalendar = {};
    for (const item of toFetch) {
      byCalendar[item.calName] = byCalendar[item.calName] || [];
      byCalendar[item.calName].push(item);
    }

    for (const calName in byCalendar) {
      const items = byCalendar[calName];
      ensureCalendarInCache(cache, calName);
      for (const it of items) {
        try {
          const resp = await gapi.client.calendar.events.list({
            calendarId: it.calendarId,
            timeMin: it.start,
            timeMax: it.end,
            singleEvents: true,
            orderBy: "startTime",
          });

          const arr = [];
          for (const ev of resp.result.items || []) {
            // We only store events with start and end (date or dateTime)
            const norm = normalizeEventItem(ev);
            if (norm.start && norm.end) arr.push(norm);
          }
          cache.events[calName][it.monthKey] = arr;
          console.log(`Pobrano ${arr.length} zdarzeń dla ${calName} ${it.monthKey}`);
        } catch (err) {
          console.error("Błąd pobierania eventów dla:", it.calendarId, it.monthKey, err);
          // leave cache empty for that month to attempt later
          cache.events[calName][it.monthKey] = cache.events[calName][it.monthKey] || [];
        }
      }
    }

    // Save updated cache
    saveCache(cache);
  } else {
    console.log("Wszystkie wymagane miesiące są w cache. Nie pobieram z API.");
  }

  // Calculate percentages using cached data (only completed months)
  const results = calculatePercentages(months, cache);
  renderTable(months, results);
}

function renderTable(months, results) {
  let html = "<table><tr><th>Kalendarz</th>";
  for (let m of months) {
    html += `<th>${m.getFullYear()}-${(m.getMonth()+1).toString().padStart(2,'0')}</th>`;
  }
  html += "</tr>";

  for (let calName in results) {
    html += `<tr><td>${calName}</td>`;
    for (let percent of results[calName]) {
      html += `<td>${percent}%</td>`;
    }
    html += "</tr>";
  }

  html += "</table>";
  document.getElementById("output").innerHTML = html;
}

// === AUTORYZACJA ===
document.getElementById("authorize_button").onclick = () => {
  tokenClient.requestAccessToken({ prompt: 'consent' });
};

function gapiLoaded() {
  gapi.load("client", async () => {
    await gapi.client.load("calendar", "v3");
  });
}

function gisLoaded() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: async (resp) => {
      console.log("OAuth zalogował:", resp);
      document.getElementById("authorize_button").style.display = "none";
      await listCalendarsData();
    },
  });
}