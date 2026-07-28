// @ts-check
// Compatibility facade for lazily loaded camera-backed Light tool workflows.

import { closeCameraTool } from './light-tool-camera-modal-runtime.js';

export { openCCTMeter } from './light-tool-cct-meter.js';
export { openDarknessMeter } from './light-tool-darkness-meter.js';
export { openFlickerDetector } from './light-tool-flicker-detector.js';
export { openGlassTransmission } from './light-tool-glass-transmission.js';
export { openLuxMeter } from './light-tool-lux-meter.js';
export { openSpectrumClassifier } from './light-tool-spectrum-classifier.js';

export function closeLuxMeter() { closeCameraTool('close-lux'); }
export function closeFlickerDetector() { closeCameraTool('close-flicker'); }
export function closeDarknessMeter() { closeCameraTool('close-dark'); }
export function closeCCTMeter() { closeCameraTool('close-cct'); }
export function closeSpectrumClassifier() { closeCameraTool('close-spec'); }
export function closeGlassTransmission() { closeCameraTool('close-glass'); }
