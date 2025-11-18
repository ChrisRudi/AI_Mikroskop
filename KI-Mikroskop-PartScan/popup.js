// Version: 1.2.1
// KI Mikroskop PartScan - JavaScript für popup.html
document.addEventListener('DOMContentLoaded', init);

// Globale Variablen
let config = {
  chatUrl: 'https://chatgpt.com',
  alternativeChatUrl: 'https://chat.openai.com/',
  claudeUrl: 'https://claude.ai/new',
  alternativeClaudeUrl: 'https://claude.ai/chats',
  countdownTime: 3000,
  minVideoWidth: 640,
  minVideoHeight: 480
};
let stream = null;

// DOM-Elemente
const elements = {
  video: null,
  btnStartCam: null,
  btnScanChatGPT: null,
  btnScanClaude: null,
  cameraSelect: null,
  countdown: null,
  flash: null,
  status: null,
  notification: null,
  previewContainer: null,
  previewCanvas: null
};

// Initialisierung beim Laden
async function init() {
  console.log('Extension wird initialisiert...');
  
  // DOM-Elemente referenzieren
  elements.video = document.getElementById('video');
  elements.btnStartCam = document.getElementById('btnStartCam');
  elements.btnScanChatGPT = document.getElementById('btnScanChatGPT');
  elements.btnScanClaude = document.getElementById('btnScanClaude');
  elements.cameraSelect = document.getElementById('cameraSelect');
  elements.countdown = document.getElementById('countdown');
  elements.flash = document.getElementById('flash');
  elements.status = document.getElementById('status');
  elements.notification = document.getElementById('notification');
  elements.previewContainer = document.getElementById('previewContainer');
  elements.previewCanvas = document.getElementById('previewCanvas');

  // Event-Listener
  elements.btnStartCam.addEventListener('click', startCam);
  elements.btnScanChatGPT.addEventListener('click', () => startScan('chatgpt'));
  elements.btnScanClaude.addEventListener('click', () => startScan('claude'));
  elements.cameraSelect.addEventListener('change', changeCam);

  // Konfiguration laden
  try {
    const configResponse = await fetch(chrome.runtime.getURL('config.json'));
    config = await configResponse.json();
    console.log('Konfiguration geladen:', config);
  } catch (err) {
    console.warn('Konfigurationsdatei konnte nicht geladen werden:', err);
  }
  
  // Prüfen, ob MediaDevices API verfügbar ist
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    console.error('MediaDevices API nicht unterstützt!');
    elements.status.textContent = 'Fehler: Kamera-API nicht unterstützt';
    showNotification('Ihr Browser unterstützt die Kamera-API nicht.', 5000);
    // Button anzeigen, damit der Benutzer weiß, dass etwas nicht stimmt
    elements.btnStartCam.classList.remove('hidden');
    return;
  }
  
  // Kamera-Berechtigungen vorab prüfen
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(device => device.kind === 'videoinput');
    const hasCamera = videoDevices.length > 0;
    
    if (hasCamera) {
      console.log('Kameras gefunden:', videoDevices.length);
      
      // Mehrere Kameras gefunden - Kameraauswahl anzeigen und aktivieren
      if (videoDevices.length > 1) {
        await enumerateCameras();
        elements.cameraSelect.classList.remove('hidden');
        // Bei mehreren Kameras den Start-Button anzeigen, wenn der Benutzer auswählen muss
        elements.btnStartCam.classList.remove('hidden');
        elements.btnStartCam.textContent = 'Ausgewählte Kamera starten';
        elements.status.textContent = 'Bitte Kamera auswählen';
      } else {
        // Bei nur einer Kamera automatisch starten
        const cameraPermissionStatus = await getCameraPermissionStatus();
        console.log('Kamera-Berechtigungsstatus:', cameraPermissionStatus);
        
        if (cameraPermissionStatus === 'granted' || cameraPermissionStatus === 'prompt') {
          // Kurze Verzögerung, um sicherzustellen, dass alles geladen ist
          setTimeout(startCam, 500);
        } else if (cameraPermissionStatus === 'denied') {
          elements.status.textContent = 'Kamera-Zugriff verweigert';
          showCameraPermissionHelp();
          // Button anzeigen, um erneut zu versuchen
          elements.btnStartCam.classList.remove('hidden');
          elements.btnStartCam.textContent = 'Kamera-Zugriff erneut versuchen';
        }
      }
    } else {
      console.warn('Keine Kamera am Gerät gefunden');
      elements.status.textContent = 'Keine Kamera gefunden';
      showNotification('Es wurde keine Kamera am Gerät gefunden.', 5000);
      // Button anzeigen, um erneut zu versuchen
      elements.btnStartCam.classList.remove('hidden');
      elements.btnStartCam.textContent = 'Nach Kameras suchen';
    }
  } catch (err) {
    console.error('Fehler bei Kamera-Zugriffsabfrage:', err);
    // Button anzeigen, um erneut zu versuchen
    elements.btnStartCam.classList.remove('hidden');
  }
}

// Kamera-Berechtigungsstatus abfragen
async function getCameraPermissionStatus() {
  try {
    if (navigator.permissions && navigator.permissions.query) {
      const permissionStatus = await navigator.permissions.query({ name: 'camera' });
      return permissionStatus.state; // 'granted', 'prompt', 'denied'
    } else {
      // Fallback für Browser ohne Permissions API
      return 'prompt';
    }
  } catch (err) {
    console.error('Fehler bei Berechtigungsabfrage:', err);
    return 'prompt';
  }
}

// Verfügbare Kameras auflisten
async function enumerateCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(device => device.kind === 'videoinput');
    
    console.log('Verfügbare Kameras:', videoDevices);
    
    // Select-Element leeren und neu befüllen
    elements.cameraSelect.innerHTML = '';
    
    if (videoDevices.length > 0) {
      // Option zum Auswählen hinzufügen
      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = 'Kamera wählen...';
      elements.cameraSelect.appendChild(defaultOption);
      
      // Alle Kameras als Optionen hinzufügen
      videoDevices.forEach((device, index) => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        
        // Versuchen, sinnvolle Labels zu erhalten (nach Berechtigung)
        if (device.label) {
          // Für bessere Lesbarkeit lange Labels kürzen
          let label = device.label;
          if (label.length > 30) {
            label = label.substring(0, 27) + '...';
          }
          
          // "Rückkamera" oder "Frontkamera" Bezeichnungen erkennen
          if (label.toLowerCase().includes('back') || 
              label.toLowerCase().includes('rück') || 
              label.toLowerCase().includes('hinten')) {
            label += ' (Rückkamera)';
          } else if (label.toLowerCase().includes('front') || 
                   label.toLowerCase().includes('selfie') || 
                   label.toLowerCase().includes('vorne')) {
            label += ' (Frontkamera)';
          }
          
          option.textContent = label;
        } else {
          // Fallback falls keine Labels verfügbar sind
          option.textContent = `Kamera ${index + 1}`;
        }
        
        elements.cameraSelect.appendChild(option);
      });
      
      // Bei mehreren Kameras das Dropdown anzeigen
      if (videoDevices.length > 1) {
        elements.cameraSelect.classList.remove('hidden');
      } else {
        elements.cameraSelect.classList.add('hidden');
      }
      
      // Wenn ein Label "rück" enthält, diese Kamera vorauswählen
      for (let i = 0; i < elements.cameraSelect.options.length; i++) {
        const option = elements.cameraSelect.options[i];
        if (option.text.toLowerCase().includes('rück') || 
            option.text.toLowerCase().includes('back') ||
            option.text.toLowerCase().includes('hinten')) {
          elements.cameraSelect.selectedIndex = i;
          break;
        }
      }
      
      return videoDevices;
    }
  } catch (err) {
    console.error('Fehler beim Auflisten der Kameras:', err);
    return [];
  }
}

// Kamera starten
async function startCam() {
  try {
    console.log('Kamera wird gestartet...');
    
    // Button während des Starts verbergen
    elements.btnStartCam.classList.add('hidden');
    
    // Bestehenden Stream stoppen, falls vorhanden
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    
    // Kamera-Constraints
    const constraints = {
      video: {
        width: { min: config.minVideoWidth },
        height: { min: config.minVideoHeight },
        facingMode: "environment" // Bevorzugt die Rückkamera bei mobilen Geräten
      },
      audio: false
    };
    
    // Spezifische Kamera verwenden, falls ausgewählt
    if (elements.cameraSelect.value) {
      constraints.video.deviceId = { exact: elements.cameraSelect.value };
    }
    
    // Direkte Anzeige während der Anfrage
    elements.status.textContent = 'Kamera wird angefordert...';
    
    try {
      console.log('Fordere Kamera mit Constraints an:', JSON.stringify(constraints));
      
      // Kamera-Stream anfordern
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      console.log('Kamera-Stream erhalten:', stream);
      
      // Stream dem Video-Element zuweisen
      elements.video.srcObject = stream;
      
      // Sicherstellen, dass das Video korrekt angezeigt wird
      elements.video.onloadedmetadata = () => {
        console.log('Video-Metadaten geladen, starte Wiedergabe...');
        elements.video.play().catch(err => {
          console.error('Fehler beim Starten der Video-Wiedergabe:', err);
        });
      };
      
      // UI aktualisieren
      elements.status.textContent = 'Kamera aktiv';
      elements.btnScanChatGPT.disabled = false;
      elements.btnScanClaude.disabled = false;
      
      // Bei mehreren Kameras den Button für Kamerawechsel verfügbar machen
      const videoDevices = await enumerateCameras();
      if (videoDevices && videoDevices.length > 1) {
        elements.cameraSelect.classList.remove('hidden');
        elements.btnStartCam.textContent = 'Kamera wechseln';
        elements.btnStartCam.classList.remove('hidden');
      }
    } catch (mediaErr) {
      console.error('Primäre Kamera-Anfrage fehlgeschlagen:', mediaErr);
      
      // Fallback mit weniger strengen Anforderungen versuchen
      console.log('Versuche Fallback mit einfacheren Kamera-Einstellungen...');
      
      const fallbackConstraints = {
        video: true,
        audio: false
      };
      
      stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
      
      console.log('Fallback-Stream erhalten');
      
      // Stream dem Video-Element zuweisen
      elements.video.srcObject = stream;
      
      // UI aktualisieren
      elements.status.textContent = 'Kamera aktiv (Fallback-Modus)';
      elements.btnScanChatGPT.disabled = false;
      elements.btnScanClaude.disabled = false;
      
      // Erneuten Versuch ermöglichen
      elements.btnStartCam.textContent = 'Kamera erneut versuchen';
      elements.btnStartCam.classList.remove('hidden');
      
      // Keine Kameraauswahl im Fallback-Modus
      elements.cameraSelect.classList.add('hidden');
    }
  } catch (err) {
    console.error('Kamera-Fehler:', err);
    
    // Fehlermeldung je nach Fehlertyp anzeigen
    let errorMessage = '';
    
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      errorMessage = 'Kamerazugriff wurde verweigert. Bitte erlauben Sie den Zugriff in den Browser-Einstellungen.';
      elements.status.textContent = 'Kamera-Fehler: Zugriff verweigert';
      
      // Anleitung zum Zurücksetzen der Berechtigungen anzeigen
      showCameraPermissionHelp();
      
      // Button zum erneuten Versuch anzeigen
      elements.btnStartCam.textContent = 'Kamera-Zugriff erneut versuchen';
      elements.btnStartCam.classList.remove('hidden');
    } else if (err.name === 'NotFoundError') {
      errorMessage = 'Keine Kamera gefunden. Bitte schließen Sie eine Kamera an und versuchen Sie es erneut.';
      elements.status.textContent = 'Kamera-Fehler: Keine Kamera gefunden';
      
      // Button zum erneuten Versuch anzeigen
      elements.btnStartCam.textContent = 'Erneut versuchen';
      elements.btnStartCam.classList.remove('hidden');
    } else if (err.name === 'NotReadableError') {
      errorMessage = 'Kamera konnte nicht gelesen werden. Möglicherweise wird sie von einer anderen Anwendung verwendet.';
      elements.status.textContent = 'Kamera-Fehler: Kamera belegt';
      
      // Button zum erneuten Versuch anzeigen
      elements.btnStartCam.textContent = 'Erneut versuchen';
      elements.btnStartCam.classList.remove('hidden');
    } else {
      errorMessage = `Fehler beim Starten der Kamera: ${err.message || err.name}`;
      elements.status.textContent = 'Kamera-Fehler';
      
      // Button zum erneuten Versuch anzeigen
      elements.btnStartCam.textContent = 'Erneut versuchen';
      elements.btnStartCam.classList.remove('hidden');
    }
    
    // Benachrichtigung anzeigen
    showNotification(errorMessage, 5000);
  }
}

// Kamera wechseln
function changeCam() {
  if (elements.cameraSelect.value) {
    console.log(`Wechsle zu Kamera mit ID: ${elements.cameraSelect.value}`);
    startCam();
  }
}

// Scan starten
function startScan(target = 'chatgpt') {
  // Button deaktivieren während Scan läuft
  elements.btnScanChatGPT.disabled = true;
  elements.btnScanClaude.disabled = true;
  elements.status.textContent = 'Countdown läuft...';
  
  // Countdown anzeigen
  let countdown = 3;
  elements.countdown.textContent = countdown;
  elements.countdown.classList.remove('hidden');
  
  // Intervall für Countdown
  const countdownInterval = setInterval(() => {
    countdown--;
    
    if (countdown <= 0) {
      // Countdown beenden
      clearInterval(countdownInterval);
      elements.countdown.classList.add('hidden');
      
      // Snapshot erstellen
      captureSnapshot(target);
    } else {
      // Countdown aktualisieren
      elements.countdown.textContent = countdown;
    }
  }, 1000);
}

// Hilfetext für Kamera-Berechtigungen
function showCameraPermissionHelp() {
  const helpDiv = document.createElement('div');
  helpDiv.className = 'permission-help';
  helpDiv.innerHTML = `
    <h3>Kamera-Zugriff verweigert</h3>
    <p>Sie haben den Zugriff auf Ihre Kamera verweigert. Um die Anwendung nutzen zu können, müssen Sie die Berechtigungen zurücksetzen:</p>
    <ol>
      <li>Klicken Sie auf das Schlosssymbol in der Adressleiste.</li>
      <li>Wählen Sie "Berechtigung zurücksetzen" oder "Einstellungen".</li>
      <li>Laden Sie die Seite neu oder starten Sie den Browser neu.</li>
    </ol>
    <button id="btnCloseHelp" class="primary-btn">Schließen</button>
  `;
  
  document.body.appendChild(helpDiv);
  
  // Schließen-Button-Handler
  document.getElementById('btnCloseHelp').addEventListener('click', () => {
    helpDiv.remove();
  });
}

// Benachrichtigung anzeigen
function showNotification(message, duration = 3000) {
  elements.notification.textContent = message;
  elements.notification.classList.remove('hidden');
  
  // Nach Anzeigedauer ausblenden
  setTimeout(() => {
    elements.notification.classList.add('hidden');
  }, duration);
}

// Vorschau anzeigen
function showPreview(canvas) {
  // Canvas-Größe anpassen
  const previewCtx = elements.previewCanvas.getContext('2d');
  elements.previewCanvas.width = 300;
  elements.previewCanvas.height = 225;
  
  // Bild skaliert auf Vorschau-Canvas zeichnen
  previewCtx.drawImage(canvas, 0, 0, 300, 225);
  
  // Vorschau-Container anzeigen
  elements.previewContainer.classList.remove('hidden');
}

// Snapshot erstellen und in Zwischenablage kopieren
async function captureSnapshot(target = 'chatgpt') {
  try {
    // Flash-Effekt anzeigen
    elements.flash.classList.add('active');
    setTimeout(() => {
      elements.flash.classList.remove('active');
    }, 300);
    
    // Canvas für Snapshot
    const canvas = document.createElement('canvas');
    canvas.width = elements.video.videoWidth || config.minVideoWidth;
    canvas.height = elements.video.videoHeight || config.minVideoHeight;
    
    // Video-Frame auf Canvas zeichnen
    const ctx = canvas.getContext('2d');
    ctx.drawImage(elements.video, 0, 0, canvas.width, canvas.height);
    
    // Vorschau anzeigen
    showPreview(canvas);
    
    // Prompt-Text aus Datei laden - mit await (captureSnapshot ist bereits async)
    const promptText = await fetch(chrome.runtime.getURL('prompt.txt'))
      .then(res => res.text())
      .catch(err => {
        console.error('Fehler beim Laden des Prompts:', err);
        return 'Benenne und beschreibe das im Bild gezeigte Bauteil.';
      });
    
    // Methode 1: Verbesserte Clipboard-Nutzung mit ClipboardItem
    let clipboardSuccess = false;
    try {
      // Bild-Blob erzeugen
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      
      // In ClipboardItem verpacken und in Zwischenablage schreiben
      const clipboardItem = new ClipboardItem({
        'image/png': blob,
        'text/plain': new Blob([promptText], {type: 'text/plain'})
      });
      
      await navigator.clipboard.write([clipboardItem]);
      clipboardSuccess = true;
      
      // Erfolg anzeigen
      showNotification('Bild und Text wurden in die Zwischenablage kopiert!', 2000);
      elements.status.textContent = 'Fertig - öffne ' + (target === 'chatgpt' ? 'ChatGPT' : 'Claude') + '...';
    } catch (clipErr) {
      console.error('Fehler bei erweiterter Clipboard-Methode:', clipErr);
    }
    
    // Methode 2: Fallback - Native Zwischenablage mit Bild + Text
    if (!clipboardSuccess) {
      try {
        console.log('Versuche alternativen Clipboard-Ansatz mit execCommand');
        
        // Temporäres Element für Copy-Operation erstellen
        const tempContainer = document.createElement('div');
        tempContainer.style.position = 'fixed';
        tempContainer.style.top = '-9999px';
        tempContainer.style.left = '-9999px';
        document.body.appendChild(tempContainer);
        
        // Text hinzufügen
        const textElement = document.createElement('p');
        textElement.textContent = promptText;
        tempContainer.appendChild(textElement);
        
        // Bild hinzufügen
        const img = document.createElement('img');
        img.src = canvas.toDataURL('image/png');
        tempContainer.appendChild(img);
        
        // Bereich auswählen und kopieren
        const range = document.createRange();
        range.selectNode(tempContainer);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        
        // In Zwischenablage kopieren
        const copyResult = document.execCommand('copy');
        
        // Aufräumen
        selection.removeAllRanges();
        document.body.removeChild(tempContainer);
        
        if (copyResult) {
          clipboardSuccess = true;
          showNotification('Bild und Text mit alternativer Methode kopiert!', 2000);
        }
      } catch (fallbackErr) {
        console.error('Fehler bei alternativem Clipboard-Ansatz:', fallbackErr);
      }
    }
    
    // Methode 3: Minimaler Fallback - nur Text kopieren
    if (!clipboardSuccess) {
      try {
        await navigator.clipboard.writeText(promptText);
        showNotification('Nur der Text wurde kopiert. Bild konnte nicht kopiert werden.', 3000);
        clipboardSuccess = true;
      } catch (textErr) {
        console.error('Fehler beim Kopieren des Textes:', textErr);
        showNotification('Kopieren in die Zwischenablage fehlgeschlagen.', 3000);
      }
    }
    
    // ChatGPT oder Claude öffnen - OHNE await fetch
    setTimeout(() => {
      if (target === 'chatgpt') {
        // Direkt ChatGPT öffnen
        chrome.tabs.create({url: config.chatUrl});
      } else {
        // Direkt Claude öffnen
        chrome.tabs.create({url: config.claudeUrl});
      }
    }, 500);
  } catch (err) {
    console.error('Fehler beim Snapshot:', err);
    showNotification('Fehler beim Erstellen des Snapshots.', 3000);
    elements.status.textContent = 'Fehler aufgetreten';
  } finally {
    // Buttons wieder aktivieren
    elements.btnScanChatGPT.disabled = false;
    elements.btnScanClaude.disabled = false;
  }
}