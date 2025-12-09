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

// === LOCAL STORAGE CACHE ===
// Struktura:
// calendarCache = {
//   [calendarId]: {
//      name: "...",
//      events: [
//         { title, start, end },
//         ...
//      ]
//   }
// }

function loadCalendarCache() {
  return JSON.parse(localStorage.getItem("calendarCache") || "{}");
}

function saveCalendarCache(cache) {
  localStorage.setItem("calendarCache", JSON.stringify(cache));
}

// === Pobierz tylko skończone miesiące ===
function getPastMonths() {
  const now = new Date();
  const months = [];

  // Do poprzedniego miesiąca (nie bieżący)
  for (let i = 1; i <= 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(new Date(d));
  }
  return months.reverse(); // od najstarszego
}

// === LOGIKA OBLICZEŃ ===
async function listCalendarsData() {
  const cache = loadCalendarCache();
  const months = getPastMonths();

  // Pierwsza tabela wyników – klucz to nazwa kalendarza
  const results = {};

  for (let calId of calendarIds) {
    console.log("Przetwarzam:", calId);

    // Jeśli nie ma cache – przygotuj
    if (!cache[calId]) cache[calId] = { name: calId, events: [] };

    // Pobierz nazwę kalendarza (tylko raz)
    try {
      const calResp = await gapi.client.calendar.calendars.get({ calendarId: calId });
      cache[calId].name = calResp.result.summary;
    } catch (e) {
      console.warn("Nie pobrano nazwy kalendarza:", e);
    }

    const calName = cache[calId].name;
    results[calName] = [];

    // Pobierz wydarzenia tylko dla miesięcy, których jeszcze nie ma w cache
    for (let month of months) {
      const monthKey = `${month.getFullYear()}-${month.getMonth()}`;

      // Sprawdź czy wydarzenia dla tego miesiąca już są
      const exists = cache[calId].events.some(ev => ev.monthKey === monthKey);
      if (exists) continue;

      // Pobranie z API
      const start = new Date(month.getFullYear(), month.getMonth(), 1).toISOString();
      const end = new Date(month.getFullYear(), month.getMonth() + 1, 1).toISOString();

      let resp;
      try {
        resp = await gapi.client.calendar.events.list({
          calendarId: calId,
          timeMin: start,
          timeMax: end,
          singleEvents: true,
          orderBy: "startTime",
        });
      } catch (err) {
        console.error("Błąd API:", err);
        continue;
      }

      // Zapisz wydarzenia z nazwą kalendarza
      const newEvents = resp.result.items.map(ev => ({
        title: ev.summary || "(bez tytułu)",
        start: ev.start.date || ev.start.dateTime,
        end: ev.end.date || ev.end.dateTime,
        monthKey
      }));

      cache[calId].events.push(...newEvents);
    }

    saveCalendarCache(cache);

    // === LICZENIE ZAPEŁNIENIA Z CACHE ===
    for (let month of months) {
      const monthKey = `${month.getFullYear()}-${month.getMonth()}`;

      const events = cache[calId].events.filter(ev => ev.monthKey === monthKey);

      let busyMs = 0;

      for (let ev of events) {
        let startEv = new Date(ev.start);
        let endEv = new Date(ev.end);

        // 🔥 Google calendar: for all-day events end.date is EXCLUSIVE
        if (ev.start.length === 10 && ev.end.length === 10) {
          endEv.setDate(endEv.getDate() - 1);
          endEv.setHours(23, 59, 59, 999);
        }

        busyMs += (endEv - startEv);
      }

      const totalHours = 24 * new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
      const busyHours = busyMs / 1000 / 3600;

      // 🔥 Gwarantuje max 100%
      const percent = Math.min(100, ((busyHours / totalHours) * 100)).toFixed(1);

      results[calName].push(percent);
    }
  }

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
