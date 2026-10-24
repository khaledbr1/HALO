const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('haloAPI', {
  // Screen capture event from Main process
  onScreenCaptured: (callback) => {
    ipcRenderer.on('screen-captured', (event, data) => callback(data));
  },

  // AI response events
  onAnalysisResult: (callback) => {
    ipcRenderer.on('analysis-result', (event, data) => callback(data));
  },
  onAnalysisError: (callback) => {
    ipcRenderer.on('analysis-error', (event, error) => callback(error));
  },

  // Actions from Renderer to Main process
  analyzeCrop: (payload) => {
    ipcRenderer.send('crop-and-search', payload);
  },
  askFollowUp: (payload) => {
    ipcRenderer.send('ask-follow-up', payload);
  },
  translateText: (payload) => {
    ipcRenderer.send('translate-text', payload);
  },
  copyToClipboard: (text) => {
    ipcRenderer.send('copy-to-clipboard', text);
  },
  openExternal: (url) => {
    ipcRenderer.send('open-external', url);
  },
  hideOverlay: () => {
    ipcRenderer.send('hide-overlay');
  }
});
