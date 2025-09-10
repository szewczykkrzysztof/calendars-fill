// === USTAWIENIA ===
const CLIENT_ID = "TUTAJ_WSTAW_SWÓJ_CLIENT_ID.apps.googleusercontent.com";
const API_KEY = "TUTAJ_WSTAW_SWÓJ_API_KEY";
const SCOPES = "https://www.googleapis.com/auth/calendar.readonly";

// Tutaj wpisujesz ID kalendarzy, które chcesz śledzić
const calendarIds = [
  "primary",
  "twoj_inny_kalendarz_id@group.calendar.google.com"
];

// === AUTORYZACJA ===
let tokenClient;
let gapiInited = false;
let gisInited = false;

document.getElementById("authorize_button").onclick = () => {
  tokenClient.requestAccessToken({ prompt: 'consent' });
};

function gapiLoaded() {
  gapi.load('client', initializeGapiClient);
}

async function initializeGapiClient() {
  await gapi.client.init({
    apiKey: API_KEY,
    discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest"],
  });
  gapiInited = true;
}

function gisLoaded() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: async () => {
      await listCalendarsData();
    },
  });
  gisInited = true;
}

// === LOGIKA OBLICZEŃ ===
async function listCalendarsData() {
  const now = new Date();
  const months = [];

  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.unshift(new Date(d)); // od najstarszego
  }

  let results = {};
  for (let calId of calendarIds) {
    results[calId] = [];
    for (let month of months) {
      const start = new Date(month.getFullYear(), month.getMonth(), 1).toISOString();
      const end = new Date(month.getFullYear(), month.getMonth() + 1, 1).toISOString();

      const resp = await gapi.client.calendar.events.list({
        calendarId: calId,
        timeMin: start,
        timeMax: end,
        singleEvents: true,
        orderBy: "startTime",
      });

      let busyMs = 0;
      for (let ev of resp.result.items) {
        if (ev.start.dateTime && ev.end.dateTime) {
          const startEv = new Date(ev.start.dateTime);
          const endEv = new Date(ev.end.dateTime);
          busyMs += (endEv - startEv);
        }
      }

      const hoursBusy = busyMs / 1000 / 3600;
      const totalHours = 24 * new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
      const percent = ((hoursBusy / totalHours) * 100).toFixed(1);
      results[calId].push(percent);
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

  for (let calId in results) {
    html += `<tr><td>${calId}</td>`;
    for (let percent of results[calId]) {
      html += `<td>${percent}%</td>`;
    }
    html += "</tr>";
  }

  html += "</table>";
  document.getElementById("output").innerHTML = html;
}
