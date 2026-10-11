# RuhToon Studio — FIXLOG (per-milestone)

Build: 2026-10-11. Source: `/tmp/ruhtoon/RuhToonStudio/` MVP → full studio.
Deliverable: `~/workspace/ruhtoonstudio/` (www/ + android/), APK build left to parent.

## Architecture decisions
- **Three.js r147 UMD** (`js/lib/three.min.js`) + **GLTFLoader r147 UMD** (`js/lib/GLTFLoader.js`), loaded as plain global scripts. r150+ removed UMD builds and ES modules fail on `file://` in WebView (CORS), so r147 is the newest UMD-compatible release. Verified: `THREE.GLTFLoader` loads a real GLB; bad URLs reject with honest errors.
- **No build step / no modules**: all app JS is plain `<script>` files on a global `RTS` namespace (same proven pattern as RuhGenesis). Works from `file:///android_asset/`.
- **Zero external requests**: only network call in the app is the optional HuggingFace Inference API, fired only when the user pastes their own token.
- **No backend**: AI voice = provider abstraction; device TTS is the default, clearly labeled.

## M1 — Stabilize (MVP test)
Ran the MVP headless (360px, SwiftShader): **13/14**.
- PASS: 3D renders, fallback hidden, color pickers, expression select, reset, TTS graceful-degrade, mic error path ("Requested device not found" shown, no crash), audio import, mouth animate, export records 6s → blob download link, zero external requests.
- The 1 non-pass was the test's own dialog detector catching the MVP's intentional `alert()` on mic failure — not a JS error; in the APK `onJsAlert` shows it natively. The studio rewrite uses status text instead of `alert()` for this path.
- Actual JS errors found in MVP: **none**.
- Fix applied: r147 color API (`outputEncoding`/`sRGBEncoding` instead of r152+ `outputColorSpace`).

## M2 — Project management
New: `js/db.js` (IndexedDB `ruhtoon_studio`: `projects` + `assets` stores, in-memory fallback), `js/project.js` (create/rename/duplicate/delete-with-confirm, asset refcount cleanup on delete, 1.2s debounced autosave, recovery of last open project after refresh).
Test: create → listed; reload → recovered with character config intact. PASS.

## M3 — Character editor
`js/stage.js`: MVP geometry kept, added hair cap, hat toggle, glasses toggle (all color-configurable materials). Transform sliders (pos X/Y, rot Y, scale) applied live + saved.
GLB/GLTF import: file → IndexedDB asset → `THREE.GLTFLoader` → auto-normalized to ~4 units, animation clips listed with play buttons, morph targets listed. "Use built-in character" fallback. Loading + error states shown.
Test: real generated triangle GLB loads (0 clips/0 morphs as expected); nonexistent URL rejects honestly. PASS.

## M4 — Scene builder
Multiple scenes per project (add/select/rename/delete-with-confirm; deleting a scene removes its clips). Per scene: 4 background presets (day sky, night + stars, sunset, studio), 3 camera presets (close-up/medium/wide), character position (left/center/right), duration seconds. All persisted in project format.
Test: add scene, night bg, close-up cam all applied + saved. PASS.

## M5 — Voice studio
`js/audio.js`: `RTS.Rec` (MediaRecorder mic capture, graceful errors), `RTS.TTS` (device voices, voice/rate/pitch, cancel), audio import, playback, volume, trim (start/end → `OfflineAudioContext` render), "add to timeline".
**AI voice (zero-budget, Hasnain-approved)**: `RTS.AI` provider abstraction — device TTS is default; Settings has an optional HuggingFace token field (stored on-device only, never shipped); Voice studio shows "🤖 AI (needs your HF token)" button, honest states (no token / model warming up / bad token). Uses `suno/bark-small` via HF Inference API free tier.
Test: TTS no-crash headless, AI button honest without token, record error path, import works, clip added. PASS.

## M6 — Animation + lip-sync
Timeline screen: clips (TTS dialogue / voice audio) with per-clip expression, reorder up/down, remove, per-clip **keyframes** (capture current pose at time t, list/delete, interpolated during playback).
Playback: sequential; TTS via device speech; audio clips via `<audio>` + **real amplitude lip-sync** (`AnalyserNode` RMS → mouth open, `RTS.LipSync`). No phoneme claims anywhere.
Test: keyframe added, play → stop mid-sequence, no crash. PASS.

## M7 — Export
`export-studio`: aspect toggle **16:9 / 9:16** (stage resizes), clip checkboxes, WebM via `canvas.captureStream(30)` + selected audio clips trimmed/volumed and concatenated (`RTS.Mixer`) played through `MediaStreamDestination` with lip-sync driving the mouth. Progress bar, **cancel**, honest errors. Silent 5s fallback when no audio. MP4 honestly labeled unavailable (no reliable offline converter).
Download: in APK, `window.Android.saveVideo(dataURL, filename)` bridge → MediaStore Downloads/RuhToonStudio; in browser, anchor fallback.
**Bug found & fixed**: `Mixer.process` used `src.channels` (undefined → NaN channels → OfflineAudioContext constructor threw, export failed). Fixed to `src.numberOfChannels`; verified decode→process→concat chain.
Test: export with 1s audio clip completes, download offered. PASS.

## M8 — Packaging (android/)
- `com.ruhtoonstudio.app`, versionCode 1, versionName "1.0", label "RuhToon Studio".
- `MainActivity`: `WebChromeClient.onPermissionRequest` grants `RESOURCE_AUDIO_CAPTURE` after runtime `RECORD_AUDIO` (denial → honest toast + JS error path); `onShowFileChooser` for audio import; `onJsAlert/Confirm/Prompt` native dialogs (app uses `prompt`/`confirm`); `DownloadListener` safety net; `AppBridge.saveVideo` writes WebM to Downloads via MediaStore on a worker thread with result toast.
- `AndroidManifest.xml`: `RECORD_AUDIO` + mic feature (not required), FileProvider authority updated.
- Fresh launcher icons generated (dark-purple "R").
- `www/` copied to `android/app/src/main/assets/www/` (816K). **APK build left to parent.**

## i18n
`js/i18n.js`: full Hindi + English dictionaries, `RTS.t(key)`, toggle in header + Settings, persisted. All UI strings routed through it.

## Final test results (headless Chrome, 360px)
**30/30 PASS**, 0 JS errors, 0 external network requests. Full journey: 7 tabs → create project → character (render/colors/hat/glasses/expression) → scenes (add/bg/camera) → voice (TTS/AI-honest/record-error/import/clip) → timeline (keyframes/play/stop) → export (9:16, WebM download) → Hindi toggle → reload recovery. GLB load + bad-URL rejection verified separately.

## Known limits / next steps
- TTS audio cannot be captured into WebM (OS-level); UI says so honestly — record device voice via mic to include it.
- MP4 not in v1 (per spec).
- Long exports hold the video in memory; fine for short clips (phone use-case).
- Real-mic and on-device APK behaviors (permission dialog, saveVideo, file chooser) need Hasnain's phone test — parent to build + deliver APK.
