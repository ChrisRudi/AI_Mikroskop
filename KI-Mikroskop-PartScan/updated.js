// Version: 1.0.0
// content-script.js - Wird auf chat.openai.com ausgeführt
console.log('KI Mikroskop PartScan: Content Script geladen');

// Kommunikation mit der Background-Seite empfangen
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.action === 'paste') {
    console.log('KI Mikroskop PartScan: Paste-Befehl empfangen');
    // Mehrere Versuche mit steigender Verzögerung
    tryPasteWithRetry(5);
  }
  return true;
});

// Auch bei normaler Seitenladung versuchen zu pasten
document.addEventListener('DOMContentLoaded', function() {
  // Längere Verzögerung bei initialem Laden
  setTimeout(() => tryPasteWithRetry(5), 2500);
});

// Versucht das Einfügen mehrmals mit steigender Verzögerung
function tryPasteWithRetry(maxAttempts) {
  let attempt = 0;
  
  function attemptPaste() {
    attempt++;
    console.log(`KI Mikroskop PartScan: Paste-Versuch ${attempt} von ${maxAttempts}`);
    
    pasteFromClipboard().then(success => {
      if (!success && attempt < maxAttempts) {
        // Exponentiell steigende Verzögerung
        const delay = 1000 * Math.pow(1.5, attempt);
        console.log(`KI Mikroskop PartScan: Nächster Versuch in ${delay}ms`);
        setTimeout(attemptPaste, delay);
      }
    });
  }
  
  attemptPaste();
}

// Funktionen zum Finden des Eingabebereichs
function findChatGPTInputElement() {
  // Neueste Selektoren zuerst probieren (häufigste ChatGPT-Selektoren)
  const selectors = [
    // Aktuelle Chat-Oberfläche (ab 2024)
    'form div[contenteditable="true"]',
    'div[data-testid="sendMessageButton"]',
    'textarea[data-id="root"]',
    // Ältere Versionen
    'textarea[placeholder]',
    '[role="textbox"]',
    '.stretch textarea',
    '#prompt-textarea',
    'form textarea',
    // Generische Fallbacks
    'textarea',
    'div[contenteditable="true"]'
  ];
  
  for (const selector of selectors) {
    const elements = document.querySelectorAll(selector);
    for (const el of elements) {
      if (el.offsetParent !== null && isVisible(el)) {
        console.log(`KI Mikroskop PartScan: Eingabeelement gefunden mit Selektor: ${selector}`, el);
        return el;
      }
    }
  }
  
  console.error('KI Mikroskop PartScan: Kein passendes Eingabeelement gefunden');
  return null;
}

// Hilfsfunktion um zu prüfen, ob ein Element wirklich sichtbar ist
function isVisible(element) {
  if (!element) return false;
  if (element.offsetWidth === 0 || element.offsetHeight === 0) return false;
  
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }
  
  return true;
}

// Findet den Senden-Button
function findSendButton() {
  const selectors = [
    'button[data-testid="sendMessageButton"]',
    'button[aria-label*="Send"]',
    'button[aria-label*="send"]',
    'button[aria-label*="Senden"]',
    'button[type="submit"]',
    'button.absolute',
    'form button:last-child'
  ];
  
  for (const selector of selectors) {
    const buttons = document.querySelectorAll(selector);
    for (const button of buttons) {
      if (button.offsetParent !== null && isVisible(button)) {
        return button;
      }
    }
  }
  
  return null;
}

// Funktion zum automatischen Einfügen aus der Zwischenablage
async function pasteFromClipboard() {
  try {
    // 1. Finde Eingabeelement
    const inputElement = findChatGPTInputElement();
    if (!inputElement) {
      return false;
    }
    
    // 2. Fokus setzen und kurz warten
    inputElement.focus();
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Erfolg-Flag
    let pasteSuccess = false;
    
    // 3. Versuch mit Clipboard API (modern)
    if (navigator.clipboard && navigator.clipboard.readText) {
      try {
        const clipboardText = await navigator.clipboard.readText();
        console.log('KI Mikroskop PartScan: Text aus Zwischenablage gelesen:', 
          clipboardText ? clipboardText.substring(0, 20) + '...' : 'leer');
        
        if (clipboardText) {
          // Text setzen je nach Elementtyp
          if (inputElement.tagName.toLowerCase() === 'textarea') {
            inputElement.value = clipboardText;
          } else {
            inputElement.textContent = clipboardText;
            // Für contenteditable
            inputElement.innerHTML = clipboardText.replace(/\\n/g, '<br>');
          }
          
          // Events auslösen
          inputElement.dispatchEvent(new Event('input', { bubbles: true }));
          inputElement.dispatchEvent(new Event('change', { bubbles: true }));
          
          // In contenteditable Elementen auch Tastendruck simulieren
          if (inputElement.getAttribute('contenteditable') === 'true') {
            const keypressEvent = new KeyboardEvent('keypress', { 
              key: 'Enter', 
              code: 'Enter',
              which: 13,
              keyCode: 13,
              bubbles: true
            });
            inputElement.dispatchEvent(keypressEvent);
          }
          
          pasteSuccess = true;
          console.log('KI Mikroskop PartScan: Text erfolgreich eingefügt via Clipboard API');
        }
      } catch (err) {
        console.error('Fehler bei Clipboard API:', err);
      }
    }
    
    // 4. Fallback: execCommand
    if (!pasteSuccess) {
      try {
        document.execCommand('paste');
        console.log('KI Mikroskop PartScan: Einfügen mit execCommand versucht');
        
        // Prüfen ob Inhalt vorhanden ist
        const hasContent = inputElement.value || inputElement.textContent;
        if (hasContent) {
          pasteSuccess = true;
        }
      } catch (err) {
        console.error('Fehler bei execCommand paste:', err);
      }
    }
    
    // 5. Tastenkombination simulieren (letzter Versuch)
    if (!pasteSuccess) {
      try {
        // Simuliere Strg+V Tastendruck
        const pasteEvent = new KeyboardEvent('keydown', {
          key: 'v',
          code: 'KeyV',
          ctrlKey: true,
          bubbles: true
        });
        inputElement.dispatchEvent(pasteEvent);
        console.log('KI Mikroskop PartScan: Tastenkombination Strg+V simuliert');
      } catch (err) {
        console.error('Fehler bei Tastensimulation:', err);
      }
    }
    
    // Warten und dann prüfen, ob der Eingabebereich Inhalt hat
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Erfolg prüfen
    const inputContent = inputElement.value || inputElement.textContent || '';
    if (inputContent.trim().length > 0) {
      console.log('KI Mikroskop PartScan: Eingabefeld hat nun Inhalt');
      
      // Optional: Aktiviere diese Zeilen, um auch den Send-Button zu klicken
      /*
      const sendButton = findSendButton();
      if (sendButton) {
        console.log('KI Mikroskop PartScan: Senden-Button gefunden, klicke...');
        sendButton.click();
      } else {
        console.log('KI Mikroskop PartScan: Kein Senden-Button gefunden');
      }
      */
      
      return true;
    } else {
      console.log('KI Mikroskop PartScan: Eingabefeld ist leer geblieben');
      return false;
    }
  } catch (err) {
    console.error('KI Mikroskop PartScan: Fehler beim Einfügen:', err);
    return false;
  }
}