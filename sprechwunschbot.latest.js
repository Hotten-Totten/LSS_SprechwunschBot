

(function() {
  'use strict';

  const requestListSel = '#radio_messages_important';
  const vehicleLinkSel = 'a.lightbox-open:not(.mission-radio-button)';
  const patientBtnSel  = 'a.btn.btn-success[href*="/patient/"]';
  const prisonBtnSel   = 'a.btn.btn-success[data-prison-id]';
  const nextVehBtnSel  = '#next-vehicle-fms-5';

  // Zähler-Variablen
  let totalRequests = 0;
  let patientsDone = 0;
  let prisonersDone = 0;

  // Hilfsfunktion fetch + parse
  async function fetchDoc(url) {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`Ladefehler ${res.status} bei ${url}`);
    const txt = await res.text();
    return new DOMParser().parseFromString(txt, 'text/html');
  }

  async function handlePatientTransport(url) {
    const doc = await fetchDoc(url);
    const btn = doc.querySelector(patientBtnSel);
    if (!btn) throw new Error('Kein Patienten-Transportbutton gefunden!');
    let nextDoc = await fetchDoc(btn.href);
    while (true) {
      const nextBtn = nextDoc.querySelector(nextVehBtnSel);
      if (!nextBtn) break;
      nextDoc = await fetchDoc(nextBtn.href);
    }
    patientsDone++;
    updateProgress();
  }

  function waitForSelectorInIframe(iframe, selector, timeout = 5000) {
    return new Promise(resolve => {
      const start = Date.now();
      function check() {
        try {
          const doc = iframe.contentDocument || iframe.contentWindow.document;
          const el = doc.querySelector(selector);
          if (el) return resolve(el);
          if (Date.now() - start > timeout) return resolve(null);
          setTimeout(check, 100);
        } catch (e) {
          if (Date.now() - start > timeout) return resolve(null);
          setTimeout(check, 100);
        }
      }
      check();
    });
  }

  function handlePrisonIframe(url, done) {
    const frame = document.createElement('iframe');
    frame.style.display = 'none';
    frame.src = url + (url.includes('?') ? '&' : '?') + 'load_all_prisons=true&show_only_available=true';
    document.body.appendChild(frame);

    frame.onload = async function() {
      const btn = await waitForSelectorInIframe(frame, 'a.btn-success[data-prison-id]', 5000);
      if (btn) {
        console.log('🚓 Gefangenen-Button gefunden:', btn.href);
        btn.click();

        function processStatus5() {
          const doc = frame.contentDocument || frame.contentWindow.document;
          const status5Btn = doc.querySelector('#next-vehicle-fms-5');
          if (status5Btn) {
            status5Btn.click();
            setTimeout(processStatus5, 700);
          } else {
            document.body.removeChild(frame);
            prisonersDone++;
            updateProgress();
            if (done) done();
          }
        }
        setTimeout(processStatus5, 700);
      } else {
        document.body.removeChild(frame);
        alert('❌ Kein Gefangenentransport-Button gefunden!');
        if (done) done();
      }
    };
  }

  function updateProgress() {
    const progressText = `🚑 Patienten: ${patientsDone} / ${totalRequests} | 🚓 Gefangene: ${prisonersDone} / ${totalRequests}`;
    console.log(progressText);
    const progressEl = document.getElementById('progress-status');
    if (progressEl) {
      progressEl.textContent = progressText;
    }
  }

  async function processAll() {
    try {
      const list = document.querySelector(requestListSel);
      if (!list) throw new Error('Sprechwünsche-Liste nicht gefunden!');
      const vehicleLinks = Array.from(list.querySelectorAll(vehicleLinkSel));
      totalRequests = vehicleLinks.length;
      patientsDone = 0;
      prisonersDone = 0;

      updateProgress();

      for (let i = 0; i < vehicleLinks.length; i++) {
        const href = vehicleLinks[i].href;
        try {
          const doc = await fetchDoc(href + '?load_all_prisons=true&show_only_available=true');
          const patientBtn = doc.querySelector(patientBtnSel);
          if (patientBtn) {
            console.log('🚑 Patienten-Transport:', href);
            await handlePatientTransport(href);
            await new Promise(r => setTimeout(r, 400));
            continue;
          }
        } catch (e) {
          // Fehler ignorieren
        }
        console.log('🚓 Gefangenentransport (IFrame):', href);
        await new Promise(res => handlePrisonIframe(href, res));
        await new Promise(r => setTimeout(r, 400));
      }
      alert(`✅ Alle Transporte abgearbeitet!\n${patientsDone} Patienten, ${prisonersDone} Gefangene von ${totalRequests} abgearbeitet.`);
      window.location.reload();
    } catch (e) {
      console.error('Automatisierung abgebrochen:', e);
      alert('❌ ' + e.message);
    }
  }

  function addButton() {
    const header = document.querySelector('#radio_panel_heading .flex-row');
    if (!header || document.getElementById('invisible-auto-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'invisible-auto-btn';
    btn.textContent = 'Sprechwünsche ▶️';
    btn.className = 'btn btn-primary btn-xs';
    btn.style.marginLeft = '10px';
    btn.title = 'Batch: Alle Sprechwünsche/Transporte abarbeiten';
    btn.addEventListener('click', processAll);
    header.appendChild(btn);

    // Fortschrittsanzeige ergänzen
    let progressEl = document.createElement('span');
    progressEl.id = 'progress-status';
    progressEl.style.marginLeft = '15px';
    progressEl.style.fontWeight = 'bold';
    progressEl.style.color = '#0055aa';
    header.appendChild(progressEl);
  }

  new MutationObserver(addButton).observe(document.body, { childList: true, subtree: true });
  addButton();

})();
