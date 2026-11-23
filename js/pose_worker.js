// Detection worker: runs the MediaPipe hand, face and pose landmarkers off the main
// thread so drawing never waits for detection (steadier frame rate). The page sends
// one ImageBitmap per camera frame (transferred, not copied) with its capture
// timestamp; the worker returns the landmark results and how long detection took.
// It times 30 frames on the GPU delegate and 30 on the CPU delegate and keeps the faster one
// (a software-emulated GPU, as in headless browsers, is slower than the CPU path).

// MediaPipe's WASM loader calls importScripts(), which module workers do not have: load that classic script
// synchronously (same origin, served by this app) and evaluate it in the worker's global scope.
self.importScripts = (...urls) => {
  for (const u of urls) {
    const x = new XMLHttpRequest(); x.open('GET', u, false); x.send();
    if (x.status !== 200) throw new Error(`importScripts ${u}: HTTP ${x.status}`);
    (0, eval)(`${x.responseText}
//# sourceURL=${u}`);
  }
};
let FilesetResolver, HandLandmarker, FaceLandmarker, PoseLandmarker;

const L = {};
let fs = null, delegate = 'GPU';
const AB = { done: false, ms: { GPU: [], CPU: [] }, pose: 'full' }; // backend choice by measured speed
const opts = (file, extra) => ({ baseOptions: { modelAssetPath: `/training-4D/rt/models/${file}`, delegate }, runningMode: 'VIDEO', ...extra });

async function make(poseModel) {
  [L.hand, L.face, L.pose] = await Promise.all([
    HandLandmarker.createFromOptions(fs, opts('hand_landmarker.task', { numHands: 2 })),
    FaceLandmarker.createFromOptions(fs, opts('face_landmarker.task', { numFaces: 1 })),
    PoseLandmarker.createFromOptions(fs, opts(`pose_landmarker_${poseModel}.task`, { numPoses: 1 })),
  ]);
}

onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === 'init') {
      ({ FilesetResolver, HandLandmarker, FaceLandmarker, PoseLandmarker } = await import('/training-4D/rt/vendor/mediapipe/vision_bundle.mjs'));
      fs = await FilesetResolver.forVisionTasks('/training-4D/rt/vendor/mediapipe/wasm');
      AB.pose = m.pose;
      try { await make(m.pose); } catch (err) { delegate = 'CPU'; AB.done = true; await make(m.pose); }
      postMessage({ type: 'ready', delegate });
    } else if (m.type === 'pose-model') {
      const old = L.pose;
      AB.pose = m.pose;
      L.pose = await PoseLandmarker.createFromOptions(fs, opts(`pose_landmarker_${m.pose}.task`, { numPoses: 1 }));
      old?.close?.();
      postMessage({ type: 'model', pose: m.pose });
    } else if (m.type === 'frame') {
      const t0 = performance.now(), out = { type: 'result', ts: m.ts, id: m.id };
      try {
        if (m.hands) out.hands = L.hand.detectForVideo(m.bmp, m.ts);
        if (m.face) out.face = L.face.detectForVideo(m.bmp, m.ts);
        if (m.pose) out.pose = L.pose.detectForVideo(m.bmp, m.ts);
      } finally { m.bmp.close(); }
      out.ms = performance.now() - t0;
      out.delegate = delegate;
      // pick the faster backend on this machine: time 30 frames on each (GPU first), keep the faster one
      if (!AB.done && m.pose) {
        AB.ms[delegate].push(out.ms);
        if (AB.ms[delegate].length >= 30) {
          if (delegate === 'GPU' && !AB.ms.CPU.length) { delegate = 'CPU'; AB.pose = m.poseModel || AB.pose; await make(AB.pose); }
          else {
            const med = (a) => [...a].sort((x, y) => x - y)[a.length >> 1], g = AB.ms.GPU.length ? med(AB.ms.GPU) : Infinity, c = AB.ms.CPU.length ? med(AB.ms.CPU) : Infinity;
            AB.done = true; const best = g <= c ? 'GPU' : 'CPU';
            out.backend = { gpu_ms: g, cpu_ms: c, chosen: best };
            if (best !== delegate) { delegate = best; await make(AB.pose); }
          }
        }
      }
      postMessage(out);
    }
  } catch (err) {
    postMessage({ type: 'error', message: String(err?.message || err), id: m.id });
  }
};
