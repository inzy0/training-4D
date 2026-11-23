// Pointer-based navigation for every 3D view (Atlas, Motion Lab, Brain):
//   - wheel / pinch zooms toward the point under the pointer (not the screen centre)
//   - pressing on a structure makes it the rotation centre: the view glides so
//     that point becomes the pivot, then dragging rotates around it
//   - double-click flies in to the point under the pointer
//   - right-drag (or Shift+drag) pans; keys: + / - zoom, arrows rotate, 0 resets
// pick(event) returns a THREE.Vector3 on a visible surface, or null.

import * as THREE from 'three';

export function pointerControls({ controls, camera, canvas, pick, onReset }) {
  controls.zoomToCursor = true;          // three r160: dolly toward the cursor ray
  controls.screenSpacePanning = true;
  controls.minDistance = 0.005;          // close enough to read a single foramen
  controls.maxDistance = 30;
  controls.zoomSpeed = 1.2;
  controls.rotateSpeed = 0.8;
  let anim = null, orbitAtPointer = true;
  const home = { p: camera.position.clone(), t: controls.target.clone() };

  const glide = (newTarget, newPos, ms = 200) => {
    const t0 = performance.now(), fromT = controls.target.clone(), fromP = camera.position.clone();
    anim = () => {
      const k = Math.min(1, (performance.now() - t0) / ms), e = 1 - (1 - k) ** 3;
      controls.target.lerpVectors(fromT, newTarget, e); camera.position.lerpVectors(fromP, newPos, e);
      if (k >= 1) anim = null;
    };
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (!orbitAtPointer || e.button !== 0 || e.shiftKey || e.ctrlKey || e.metaKey) return;
    const hit = pick(e); if (!hit) return;
    // pan (camera and target move together) so the pressed point becomes the pivot; view direction is unchanged
    const delta = hit.clone().sub(controls.target);
    if (delta.length() < 1e-4) return;
    glide(hit, camera.position.clone().add(delta));
  });
  canvas.addEventListener('dblclick', (e) => {
    const hit = pick(e); if (!hit) return;
    const dir = camera.position.clone().sub(controls.target).normalize();
    const dist = Math.max(0.06, camera.position.distanceTo(hit) * 0.45);
    glide(hit, hit.clone().add(dir.multiplyScalar(dist)), 380);
  });
  canvas.tabIndex = canvas.tabIndex >= 0 ? canvas.tabIndex : 0;
  canvas.addEventListener('keydown', (e) => {
    const off = camera.position.clone().sub(controls.target);
    if (e.key === '+' || e.key === '=') camera.position.copy(controls.target.clone().add(off.multiplyScalar(0.8)));
    else if (e.key === '-') camera.position.copy(controls.target.clone().add(off.multiplyScalar(1.25)));
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { off.applyAxisAngle(new THREE.Vector3(0, 1, 0), (e.key === 'ArrowLeft' ? 1 : -1) * 0.12); camera.position.copy(controls.target.clone().add(off)); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { const ax = new THREE.Vector3().crossVectors(camera.up, off).normalize(); off.applyAxisAngle(ax, (e.key === 'ArrowUp' ? 1 : -1) * 0.12); camera.position.copy(controls.target.clone().add(off)); }
    else if (e.key === '0') { glide(home.t.clone(), home.p.clone(), 300); onReset?.(); }
    else return;
    e.preventDefault();
  });
  return {
    tick() { anim?.(); },
    setHome() { home.p.copy(camera.position); home.t.copy(controls.target); },
    set orbitAtPointer(v) { orbitAtPointer = v; }, get orbitAtPointer() { return orbitAtPointer; },
    flyTo(target, dist) { const dir = camera.position.clone().sub(controls.target).normalize(); glide(target.clone(), target.clone().add(dir.multiplyScalar(dist)), 380); },
  };
}

// surface point under the pointer for a list of meshes (respecting clipping when given)
export function surfacePicker(camera, canvas, meshesFn, accept = () => true) {
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  return (e) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(meshesFn(), false).find((h) => accept(h.point));
    return hit ? hit.point.clone() : null;
  };
}
