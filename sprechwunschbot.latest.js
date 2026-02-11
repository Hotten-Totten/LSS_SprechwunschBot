/* 
LSS_SrechwunschBot
Version: 1.2.2
*/

(function () {
  'use strict';

  // ===== SOFORT exportieren =====
  window.__SPRECHB_VERSION__ = '1.2.2';

  console.log('[SPRECHB] LIVE', window.__SPRECHB_VERSION__);

  // ===== Loader-Check =====
  const EXPECT_KEY = 'SPRECHB-9f3c2d4a1b7e49d8a6c1f0b2c4d6e8aa10022026';
  if (window.__SPRECHB_LOADER_KEY__ !== EXPECT_KEY) {
    console.warn('SPRECHB] falscher Loader – Abbruch');
    return;
  }

  // ===== Doppelstart verhindern =====
  if (window._SPRECHB_LOADED__) {
    console.warn('[SPRECHB] Doppelstart verhindert');
    return;
  }
  window.__SPRECHB_LOADED__ = true;

  console.log('[SPRECHB] ✅ SprechwunschBot initialisiert');

// ############### Ab hier Originalcode einfügen ###############
  
  const requestListSel = '#radio_messages_important';
  const vehicleLinkSel = 'a.lightbox-open:not(.mission-radio-button)';
  const patientBtnSel  = 'a.btn.btn-success[href*="/patient/"]';
  const prisonBtnSel   = 'a.btn.btn-success[data-prison-id]';
  const nextVehBtnSel  = '#next-vehicle-fms-5';
  const QUIET_MODE = true;        // true = keine Alerts (auch bei Fehler)
  const PRISON_RETRIES = 2;       // Anzahl Retry-Versuche (zusätzlich zum ersten Versuch)
  const PRISON_RETRY_PAUSE = 900; // Pause zwischen Retries in ms
  const AUTO_STOP_IF_EMPTY = true;


  // Zähler
  let totalRequests = 0;
  let patientsDone = 0;
  let prisonersDone = 0;
  let skipped = 0;

  // Hilfsfunktionen Anfang
let tickerQueue = [];
let tickerRunning = false;

    let botRunning = false;


function ticker(msg) {
  tickerQueue.push(msg);
  if (!tickerRunning) runTicker();
}

async function runTicker() {
  tickerRunning = true;
  const el = document.getElementById('progress-ticker');
  while (tickerQueue.length) {
    const text = tickerQueue.shift();
    if (el) {
      el.textContent = text;
      el.style.transform = 'translateY(-5px)';
      await sleep(50);
      el.style.transform = 'translateY(0)';
    }
    await sleep(650); // Geschwindigkeit
  }
  tickerRunning = false;
}

  // Hilfsfunktionen Ende
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  async function fetchDoc(url) {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`Ladefehler ${res.status} bei ${url}`);
    const txt = await res.text();
    return new DOMParser().parseFromString(txt, 'text/html');
  }

  function updateProgress(extra = '') {
      //const progressText = `Patienten: ${patientsDone} / ${totalRequests} | Gefangene: ${prisonersDone} / ${totalRequests} | Skip: ${skipped}${extra ? ' | ' + extra : ''}`;
      const progressText =``;
    console.log(progressText);
    const progressEl = document.getElementById('progress-status');
    if (progressEl) progressEl.textContent = progressText;
  }

  async function followStatus5Loop(startDoc) {
    let doc = startDoc;
    // Hard-Limit, falls irgendwas in eine Endlosschleife läuft
    for (let guard = 0; guard < 80; guard++) {
      const nextBtn = doc.querySelector(nextVehBtnSel);
      if (!nextBtn || !nextBtn.href) return doc;
      doc = await fetchDoc(nextBtn.href);
      await sleep(120);
    }
    throw new Error('Status-5 Schleife abgebrochen (Guard-Limit erreicht).');
  }

  async function handlePatientTransport(baseUrl) {
      ticker(`Patienten-Transport wird abgearbeitet`);
    const doc = await fetchDoc(baseUrl);
    const btn = doc.querySelector(patientBtnSel);
    if (!btn || !btn.href) throw new Error('Kein Patienten-Transportbutton gefunden!');
    const nextDoc = await fetchDoc(btn.href);
    await followStatus5Loop(nextDoc);
    patientsDone++;
    updateProgress();
  }

async function handlePrisonTransport(baseUrl) {
  const url = baseUrl + (baseUrl.includes('?') ? '&' : '?') + 'load_all_prisons=true&show_only_available=true';
  const doc = await fetchDoc(url);

  const btn = doc.querySelector(prisonBtnSel);
  if (!btn || !btn.href) {
    ticker('Kein Gefangenentransport verfügbar');
    return false; // wichtig: kein Skip
  }

  const nextDoc = await fetchDoc(btn.href);
  await followStatus5Loop(nextDoc);

  prisonersDone++;
  updateProgress();
  return true;
}

async function processAll() {
    if (botRunning) {
  ticker('⛔ Bot läuft bereits');
  return;
}
botRunning = true;
  ticker('Abarbeitung gestartet');

  const failures = [];
  try {
    const list = document.querySelector(requestListSel);
    if (!list) throw new Error('Sprechwünsche-Liste nicht gefunden!');

    const vehicleLinks = Array.from(list.querySelectorAll(vehicleLinkSel));
    totalRequests = vehicleLinks.length;
    patientsDone = 0;
    prisonersDone = 0;
    skipped = 0;

    updateProgress('▶️ Start');

    // Auto-Stop: nix zu tun
    if (AUTO_STOP_IF_EMPTY && totalRequests === 0) {
      ticker('🛑 Keine Sprechwünsche vorhanden – Stop.');
      updateProgress('🛑 Leer');
      return;
    }

    for (let i = 0; i < vehicleLinks.length; i++) {
      const href = vehicleLinks[i].href;
      updateProgress(`(${i + 1}/${totalRequests})`);

      // 1) Erst Patient versuchen
      try {
        const doc = await fetchDoc(href);
        const patientBtn = doc.querySelector(patientBtnSel);
        if (patientBtn) {
          console.log(' Patienten-Transport:', href);
          ticker(' Patienten-Transport wird abgearbeitet');
          await handlePatientTransport(href);
          await sleep(250);
          continue;
        }
      } catch (e) {
        // ignorieren, wir probieren danach Gefangene
      }

      // 2) Gefangene mit Retry
      let successOrNoTask = false;

      for (let attempt = 0; attempt <= PRISON_RETRIES; attempt++) {
        try {
          if (attempt > 0) {
            ticker(`Retry Gefangene (${attempt}/${PRISON_RETRIES}) …`);
            await sleep(PRISON_RETRY_PAUSE);
          }

          console.log(`Gefangenentransport (Attempt ${attempt + 1}):`, href);
          ticker('Gefangenentransport wird abgearbeitet');

          const done = await handlePrisonTransport(href);

          if (done === false) {
            // Kein Transport vorhanden → NICHT skippen
            successOrNoTask = true;
            break;
          }

          // done === true
          successOrNoTask = true;
          break;

        } catch (e) {
          // beim letzten Versuch zählen wir es als echten Skip
          if (attempt === PRISON_RETRIES) {
            skipped++;
            failures.push({ href, msg: e?.message || String(e) });
            console.warn(' Übersprungen (Fehler):', href, e);
            updateProgress('⚠️ Skip');
            ticker(' Fehler beim Gefangenentransport');
          } else {
            console.warn('⚠️ Gefangenenversuch fehlgeschlagen, retry folgt:', href, e);
          }
        }
      }

      await sleep(250);
    }

    // Ende
    updateProgress('✅ Fertig');
    //ticker(`✅ Fertig:Einlieferung Krankenhaus: ${patientsDone} | Zellen: ${prisonersDone} | ${skipped}`);
      ticker(`Fertig:Einlieferung Krankenhaus: ${patientsDone} | Zellen: ${prisonersDone}`);
    console.log('[SprechwunschBot] fertig', { patientsDone, prisonersDone, skipped, totalRequests });

//botRunning = false;

    // Auto-Reload optional: wenn du es leise willst, lass es drin oder kommentier es aus
//    window.location.reload();

  } catch (e) {
    console.error('Automatisierung abgebrochen:', e);
    ticker('❌ Abbruch: ' + (e?.message || String(e)));

    if (!QUIET_MODE) {
      alert('❌ ' + (e?.message || String(e)));
    }
  } finally {
    if (failures.length) {
      console.group(`[SprechwunschBot] Failures: ${failures.length}`);
      failures.forEach(f => console.log(f.msg, f.href));
      console.groupEnd();
    }
  }
}



function addButton() {
  const header = document.querySelector('#radio_panel_heading .flex-row');
  if (!header || document.getElementById('invisible-auto-btn')) return;

  // --- Button ---
  const btn = document.createElement('button');
  btn.id = 'invisible-auto-btn';
  btn.textContent = 'Sprechwünsche ▶️';
  btn.className = 'btn btn-primary btn-xs';
  btn.style.marginLeft = '10px';
  btn.title = 'Batch: Alle Sprechwünsche/Transporte abarbeiten';
  btn.addEventListener('click', processAll);
  header.appendChild(btn);

  // --- Progress (rechts neben Button) ---
  const progressEl = document.createElement('span');
  progressEl.id = 'progress-status';
  progressEl.style.marginLeft = '15px';
  progressEl.style.fontWeight = 'bold';
  progressEl.style.color = '#0055aa';
  header.appendChild(progressEl);

  // --- Ticker: eigene Zeile UNTER dem Header (unterhalb der Buttons) ---
  // Wir hängen ihn nicht in die Flex-Zeile rein, sondern direkt darunter.
  const panelHeading = document.getElementById('radio_panel_heading');
  if (!panelHeading) return;

  // Falls schon vorhanden (z.B. wegen Re-render), vorher entfernen
  const old = document.getElementById('progress-ticker-wrap');
  if (old) old.remove();

  const wrap = document.createElement('div');
  wrap.id = 'progress-ticker-wrap';
  wrap.style.marginTop = '6px';
  wrap.style.padding = '4px 8px';
  wrap.style.borderTop = '1px solid rgba(0,0,0,0.08)';
  wrap.style.fontSize = '11px';
  wrap.style.color = '#333';
  wrap.style.whiteSpace = 'nowrap';
  wrap.style.overflow = 'hidden';
  wrap.style.textOverflow = 'ellipsis';
  wrap.style.display = 'flex';
  wrap.style.justifyContent = 'center';

  const tickerEl = document.createElement('div');
  tickerEl.id = 'progress-ticker';
  tickerEl.textContent = 'Bereit.';
  tickerEl.style.transition = 'transform 120ms ease';
  tickerEl.style.textAlign = 'center';
  wrap.appendChild(tickerEl);

  // Direkt NACH der Header-Zeile einfügen (unterhalb der Buttons)
  header.insertAdjacentElement('afterend', wrap);
}



  new MutationObserver(addButton).observe(document.body, { childList: true, subtree: true });
  addButton();

})();
