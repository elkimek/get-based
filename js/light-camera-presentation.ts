// Display-only camera tool contracts. Sampling, calibration and storage retain their owners.
import type { CameraLockResult } from './light-tool-camera.js';
export type CameraToolKey = 'lux' | 'flicker' | 'darkness' | 'cct' | 'spectrum' | 'glass-transmission';
export interface AimingGuideView { key: string; mode: string; before: string; emphasis: string; after: string; webcam: string }
export interface CameraLockView { text: string; manual: boolean }
export type CameraLockDisplay = Partial<CameraLockResult> | null | undefined;
export interface CameraShellView { tool: CameraToolKey; guide: AimingGuideView | null; zones?: readonly {max: number; label: string}[] }
export type CameraMessageView =
  | {kind: 'cct-auto'}
  | {kind: 'cct-reading'; melanopic: number; banding: boolean}
  | {kind: 'spectrum-auto'; lock: CameraLockDisplay}
  | {kind: 'spectrum-reading'; result: {label: string; reason: string; confidence: number; melanopic: number; circadian: 'blue-poor' | 'blue-rich' | 'mixed'}}
  | {kind: 'spectrum-denied'}
  | {kind: 'flicker-wait'; lock: CameraLockDisplay}
  | {kind: 'flicker-reading'; score: number; label: string; bandingRatio: number; frameRatio: number; stripes: number}
  | {kind: 'flicker-denied'}
  | {kind: 'darkness-reading'; label: string; cls: string; cameraLevel: number; peakLevel: number; lock: CameraLockDisplay}
  | {kind: 'darkness-denied'}
  | {kind: 'glass-reading'; transmission: number; lock: CameraLockDisplay}
  | {kind: 'lux-camera'; calibrated: boolean; exposureHeld: boolean; lock: CameraLockDisplay}
  | {kind: 'lux-start'; sensorUnavailable: boolean}
  | {kind: 'lux-denied'};
export type CameraGuidePresentationProps = {kind: 'guide'; guide: AimingGuideView | null} | {kind: 'lock'; lock: CameraLockDisplay};
export type CameraToolPresentationProps = {kind: 'shell'; view: CameraShellView} | CameraMessageView;
const AIMING_GUIDES: Readonly<Record<string, AimingGuideView | undefined>> = {
  "lux": {
    "key": "lux",
    "mode": "AT the point you want to check",
    "before": "Hold the phone at ",
    "emphasis": "eye height",
    "after": " where you normally sit, work, or read. Keep the light sensor uncovered and point its side toward the light field you want to check (usually the screen/front side). If you choose the camera fallback, face the camera into the room rather than directly at a bulb.",
    "webcam": "A laptop may not expose a light sensor. Its camera can make a relative estimate, but a phone light sensor or real lux meter is preferable."
  },
  "flicker": {
    "key": "flicker",
    "mode": "AT the source",
    "before": "Point the camera ",
    "emphasis": "directly at the bulb / fixture",
    "after": " from ~30–50 cm, so the source fills a noticeable chunk of the frame. Rolling-shutter bands are harder to see after light reflects off walls or skin.",
    "webcam": "⚠ A user-facing webcam under-reads flicker — modulation amplitude attenuates when bouncing off your face. Use a phone for a real read."
  },
  "cct": {
    "key": "cct",
    "mode": "AT the source",
    "before": "Point the camera ",
    "emphasis": "directly at the fixture or a white wall lit by it",
    "after": " from ~30–50 cm. White paper or a grey card under the source also works.",
    "webcam": "⚠ A user-facing webcam can be skewed by skin, clothing, automatic white balance, and the display. Use a phone aimed at a neutral surface when possible."
  },
  "spectrum": {
    "key": "spectrum",
    "mode": "AT the source",
    "before": "Point the camera ",
    "emphasis": "directly at the bulb or LED panel",
    "after": " so it dominates the frame. The classifier reads the RGB profile of whatever it sees.",
    "webcam": "⚠ A user-facing webcam mostly sees the person and display, so its RGB balance may not represent the room source. Use a phone aimed at the source when possible."
  },
  "darkness": {
    "key": "darkness",
    "mode": "FROM your sleeping position",
    "before": "Place the phone ",
    "emphasis": "face-up on your pillow or bedside table",
    "after": " at night, lens facing the ceiling. Check the light field at your sleeping position with the room set as you normally sleep (door, hallway light, alarm clock, and curtains included).",
    "webcam": "⚠ A monitor webcam in a different room can't measure your bedroom darkness. This one needs to be physically on the bed."
  },
  "glass-transmission": {
    "key": "glass-transmission",
    "mode": "TWO-STEP — same direction both times",
    "before": "Step 1: hold the camera ",
    "emphasis": "against the closed window",
    "after": " (looking out at the sky / scene). Step 2: same direction, but with the window open or stepping outside, so only the glass changes between readings.",
    "webcam": "Webcam can't do this — it can't physically move outside."
  },
  "audit": {
    "key": "audit",
    "mode": "FROM your position, at eye height",
    "before": "Hold the phone ",
    "emphasis": "at eye height, facing forward",
    "after": " while you walk through each room. The pause-detection captures the lighting where you actually look — not the floor or ceiling.",
    "webcam": "Walking with a phone is the whole point — a fixed webcam misses the inter-room comparison this tool exists to provide."
  }
};
export function projectAimingGuide(key: string, dismissed = false): AimingGuideView | null {
  const guide = Object.hasOwn(AIMING_GUIDES, key) ? AIMING_GUIDES[key] : undefined;
  return dismissed || !guide ? null : {...guide};
}
export function projectCameraLock(lock: CameraLockDisplay): CameraLockView | null {
  if (!lock) return null;
  const manual = lock.exposure === 'manual' && lock.whiteBalance === 'manual';
  if (manual) return {manual, text: `✓ camera locked${lock.frameRate ? ` · ${Math.round(lock.frameRate)} fps` : ''}`};
  const auto: string[] = [];
  if (lock.exposure !== 'manual') auto.push('exposure');
  if (lock.whiteBalance !== 'manual') auto.push('white-balance');
  return {manual, text: `⚠ camera ${auto.join(' + ')} on auto — reading may drift`};
}
