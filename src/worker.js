import { slice } from './core/gcode.js';
self.onmessage = (e) => {
  const { pattern, printerId, print, fil, thumbnails } = e.data;
  try {
    const result = slice(pattern, printerId, print, fil, {
      thumbnails,
      onProgress: (v) => self.postMessage({ type: 'progress', value: v }),
    });
    self.postMessage({ type: 'done', result });
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message || String(err) });
  }
};
