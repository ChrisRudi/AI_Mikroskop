// Version: 1.1.0
// background.js - Hintergrundskript für die Extension
console.log('KI Mikroskop PartScan: Background Script geladen');

// Auf Tab-Updates achten
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Nur bei vollständig geladenen Tabs und wenn die URL zu ChatGPT oder Claude gehört
  if (changeInfo.status === 'complete' && tab.url) {
    // Verschiedene mögliche ChatGPT und Claude URLs
    const aiUrls = [
      'chat.openai.com',    // ChatGPT Basis-Domain
      'chatgpt.com',        // ChatGPT Alternative Domain
      'claude.ai'           // Claude Domain
    ];
    
    const isAITab = aiUrls.some(url => tab.url.includes(url));
    
    if (isAITab) {
      const isClaude = tab.url.includes('claude.ai');
      console.log(`KI Mikroskop PartScan: ${isClaude ? 'Claude' : 'ChatGPT'}-Tab erkannt`, tabId, tab.url);
      
      // Mehrere Versuche mit steigender Verzögerung, um maximale Kompatibilität zu gewährleisten
      const delays = [1500, 3000, 5000];
      
      delays.forEach(delay => {
        setTimeout(() => {
          // Sende Nachricht an den Content Script mit Angabe des AI-Typs
          chrome.tabs.sendMessage(tabId, { 
            action: 'paste',
            aiType: isClaude ? 'claude' : 'chatgpt'
          }, response => {
            if (chrome.runtime.lastError) {
              console.log('Nachricht konnte nicht gesendet werden, vielleicht noch nicht bereit:', chrome.runtime.lastError.message);
            } else {
              console.log(`KI Mikroskop PartScan: Paste-Befehl gesendet an ${isClaude ? 'Claude' : 'ChatGPT'} Tab ${tabId} nach ${delay}ms Verzögerung`);
            }
          });
        }, delay);
      });
    }
  }
});