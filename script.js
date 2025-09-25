// === KONFIGURACJA ===
const CLIENT_ID = "16718101302-u4f3m2o7hscp3etlssn3fvsjg28m72h0.apps.googleusercontent.com";
const SCOPES = "https://www.googleapis.com/auth/calendar.readonly";

// Wybierasz swoje kalendarze
const calendarIds = [
  "Pokój 101",
  "Pokój 202",
  "Pokój 203",
  "Pokój 204",
  "Pokój 205",
  "Pokój 206",
  "Pokój 207",
];

let tokenClient;

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

-// === LOGIKA OBLICZEŃ ===
async function listCalendarsData() {
  const now = new Date();
  const months = [];

  console.log("Start pobierania kalendarzy dla:", calendarIds);

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

      console.log("Dane z kalendarza:", calId, resp);

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
