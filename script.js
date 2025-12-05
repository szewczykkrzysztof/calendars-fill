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

// === LOGIKA OBLICZEŃ ===
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
    // --- pobranie nazwy kalendarza ---
    let calName = calId; // fallback w razie błędu
    try {
      const calResp = await gapi.client.calendar.calendars.get({
        calendarId: calId
      });
      calName = calResp.result.summary;
    } catch (err) {
      console.warn("Nie udało się pobrać nazwy kalendarza:", calId, err);
    }

    results[calName] = []; // używamy nazwy jako klucza w results

    for (let month of months) {
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
        console.error("Błąd pobierania eventów dla:", calId, err);
        results[calName].push("ERR");
        continue;
      }
      
      let busyMs = 0;
      for (let ev of resp.result.items) {
        if (ev.start?.date && ev.end?.date) {
        // Obsługa Wydarzeń całodniowych
        let startEv = new Date(ev.start.date); 
        let endEv = new Date(ev.end.date);
        busyMs += (endEv - startEv);  // sumuj czas wydarzeń w ms

        } else {
        continue; // pomiń dziwne/niekompletne wydarzenia
       }

      }

      const hoursBusy = busyMs / 1000 / 3600;
      const totalHours = 24 * new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
      const percent = ((hoursBusy / totalHours) * 100).toFixed(1);
      results[calName].push(percent);       // zapisz procent zapełnienia pod kluczem z nazwą kalendarza
      console.log(`Kalendarz: ${calName}, Miesiąc: ${month.getFullYear()}-${month.getMonth()+1}, Zajętość: ${percent}%`);
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
