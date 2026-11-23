// Vice Harbor — drawing only: a small hand-rolled WebGL renderer (no library, no network).
// The world state in, pixels out. Buildings, cars, pedestrians, the harbor, the helicopter and
// the neon are all boxes and quads with per-vertex colour; fog and a warm sun do the mood.
// The HUD is DOM (see index.html); the minimap is a 2D canvas drawn here.
import { CITY } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_JOB = 'job';

/** Lighting per time of day. Night is deliberately lifted out of black: street pools, lit
 * windows and wet neon reflections keep the frame readable. */
export function lightingFor(time) {
  if (time >= 20.5 || time < 5) {
    return { mode: 'night', sky: [0.10, 0.13, 0.25], fog: [0.14, 0.17, 0.30], ambient: 0.62, sun: [0.55, 0.60, 0.95], ground: [0.16, 0.18, 0.26], road: [0.13, 0.15, 0.22], windows: 1 };
  }
  if (time >= 19 || time < 6) {
    return { mode: 'dusk', sky: [0.45, 0.22, 0.38], fog: [0.42, 0.26, 0.36], ambient: 0.72, sun: [0.95, 0.45, 0.35], ground: [0.32, 0.24, 0.26], road: [0.22, 0.19, 0.22], windows: 1 };
  }
  if (time >= 16) {
    return { mode: 'golden', sky: [0.98, 0.58, 0.28], fog: [0.96, 0.62, 0.34], ambient: 0.95, sun: [1.0, 0.62, 0.25], ground: [0.55, 0.42, 0.30], road: [0.30, 0.26, 0.24], windows: 0 };
  }
  return { mode: 'day', sky: [0.55, 0.75, 0.92], fog: [0.62, 0.76, 0.90], ambient: 1.0, sun: [1.0, 0.95, 0.85], ground: [0.45, 0.48, 0.42], road: [0.25, 0.25, 0.26], windows: 0 };
}

function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}
function shade(rgb, f) { return [rgb[0] * f, rgb[1] * f, rgb[2] * f]; }

function perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0];
}
function lookAt(eye, target, up) {
  const zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
  const zl = Math.hypot(zx, zy, zz) || 1;
  const z = [zx / zl, zy / zl, zz / zl];
  const xx = up[1] * z[2] - up[2] * z[1], xy = up[2] * z[0] - up[0] * z[2], xz = up[0] * z[1] - up[1] * z[0];
  const xl = Math.hypot(xx, xy, xz) || 1;
  const x = [xx / xl, xy / xl, xz / xl];
  const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  return [
    x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
    -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]),
    -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]),
    -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]), 1,
  ];
}
function multiply(a, b) {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c += 1) for (let r = 0; r < 4; r += 1) {
    let s = 0;
    for (let k = 0; k < 4; k += 1) s += a[k * 4 + r] * b[c * 4 + k];
    out[c * 4 + r] = s;
  }
  return out;
}

// A growable triangle list: positions, colours, alphas.
class Mesh {
  constructor() { this.pos = []; this.col = []; this.alpha = []; }
  quad(a, b, c, d, color, alpha) {
    this.tri(a, b, c, color, alpha);
    this.tri(a, c, d, color, alpha);
  }
  tri(a, b, c, color, alpha) {
    for (const p of [a, b, c]) {
      this.pos.push(p[0], p[1], p[2]);
      this.col.push(color[0], color[1], color[2]);
      this.alpha.push(alpha);
    }
  }
  // Axis-aligned box centred at (x, y, z) with size (w, h, d); faces shaded by direction.
  box(x, y, z, w, h, d, base, ambient) {
    const hw = w / 2, hh = h / 2, hd = d / 2;
    const top = shade(base, Math.min(1.15, ambient + 0.25));
    const south = shade(base, ambient);
    const east = shade(base, ambient * 0.82);
    const north = shade(base, ambient * 0.62);
    const west = shade(base, ambient * 0.72);
    const y0 = y - hh, y1 = y + hh;
    const x0 = x - hw, x1 = x + hw, z0 = z - hd, z1 = z + hd;
    this.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], top, 1); // top
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], south, 1); // south
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], east, 1); // east
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], north, 1); // north
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], west, 1); // west
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], shade(base, ambient * 0.4), 1); // bottom
  }
  // A box rotated around Y by heading (radians). Built from a local box then rotated.
  rotBox(x, y, z, w, h, d, heading, base, ambient) {
    const hw = w / 2, hh = h / 2, hd = d / 2;
    const sin = Math.sin(heading), cos = Math.cos(heading);
    const rot = (lx, ly, lz) => [x + lx * cos + lz * sin, y + ly, z - lx * sin + lz * cos];
    const c = [
      rot(-hw, -hh, -hd), rot(hw, -hh, -hd), rot(hw, -hh, hd), rot(-hw, -hh, hd),
      rot(-hw, hh, -hd), rot(hw, hh, -hd), rot(hw, hh, hd), rot(-hw, hh, hd),
    ];
    const top = shade(base, Math.min(1.15, ambient + 0.25));
    const side = shade(base, ambient);
    this.quad(c[4], c[5], c[6], c[7], top, 1);
    this.quad(c[3], c[2], c[6], c[7], side, 1);
    this.quad(c[1], c[0], c[4], c[5], shade(base, ambient * 0.7), 1);
    this.quad(c[2], c[1], c[5], c[6], shade(base, ambient * 0.85), 1);
    this.quad(c[0], c[3], c[7], c[4], shade(base, ambient * 0.75), 1);
    this.quad(c[0], c[1], c[2], c[3], shade(base, ambient * 0.4), 1);
  }
  flat(x, y, z, w, d, color, alpha) {
    this.quad([x - w / 2, y, z - d / 2], [x + w / 2, y, z - d / 2], [x + w / 2, y, z + d / 2], [x - w / 2, y, z + d / 2], color, alpha);
  }
  // A vertical quad facing +z at (x, y, z).
  face(x, y, z, w, h, color, alpha) {
    this.quad([x - w / 2, y - h / 2, z], [x + w / 2, y - h / 2, z], [x + w / 2, y + h / 2, z], [x - w / 2, y + h / 2, z], color, alpha);
  }
}

const VERT = `
attribute vec3 aPos; attribute vec3 aColor; attribute float aAlpha;
uniform mat4 uProj; uniform mat4 uView;
varying vec3 vColor; varying float vAlpha; varying float vDist;
void main() {
  vec4 view = uView * vec4(aPos, 1.0);
  vDist = -view.z;
  vColor = aColor; vAlpha = aAlpha;
  gl_Position = uProj * view;
}`;
const FRAG = `
precision mediump float;
varying vec3 vColor; varying float vAlpha; varying float vDist;
uniform vec3 uFog; uniform float uFogNear; uniform float uFogFar;
void main() {
  float f = clamp((vDist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  gl_FragColor = vec4(mix(vColor, uFog, f), vAlpha);
}`;

export function createRenderer(canvas) {
  const gl = canvas.getContext('webgl', { antialias: true, preserveDrawingBuffer: true });
  if (!gl) throw new Error('WebGL is not available in this browser.');
  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(program);
  gl.useProgram(program);
  const loc = {
    pos: gl.getAttribLocation(program, 'aPos'),
    col: gl.getAttribLocation(program, 'aColor'),
    alpha: gl.getAttribLocation(program, 'aAlpha'),
    proj: gl.getUniformLocation(program, 'uProj'),
    view: gl.getUniformLocation(program, 'uView'),
    fog: gl.getUniformLocation(program, 'uFog'),
    fogNear: gl.getUniformLocation(program, 'uFogNear'),
    fogFar: gl.getUniformLocation(program, 'uFogFar'),
  };
  const posBuf = gl.createBuffer();
  const colBuf = gl.createBuffer();
  const alphaBuf = gl.createBuffer();
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  function upload(mesh) {
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.pos), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(loc.pos);
    gl.vertexAttribPointer(loc.pos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.col), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(loc.col);
    gl.vertexAttribPointer(loc.col, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, alphaBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.alpha), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(loc.alpha);
    gl.vertexAttribPointer(loc.alpha, 1, gl.FLOAT, false, 0, 0);
    return mesh.pos.length / 3;
  }

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
  }
  window.addEventListener('resize', resize);
  resize();

  // The static city mesh is rebuilt only when the lighting mode changes.
  let staticMesh = null;
  let staticMode = '';

  function buildStatic(world, light) {
    const m = new Mesh();
    const s = world.state;
    // Land.
    m.flat(0, 0, 0, 520, 470, light.ground, 1);
    // Water (the harbor, south of the city).
    const water = light.mode === 'night' ? [0.10, 0.16, 0.30] : light.mode === 'dusk' ? [0.35, 0.25, 0.38] : [0.20, 0.45, 0.60];
    m.flat(0, -0.2, 262, 520, 120, water, 1);
    // Roads.
    for (const rx of world.roadX) m.flat(rx, 0.05, 0, CITY.road, 410, light.road, 1);
    for (const rz of world.roadZ) m.flat(0, 0.05, rz, 470, CITY.road, light.road, 1);
    // Centre lines.
    const line = light.mode === 'night' ? [0.55, 0.55, 0.45] : [0.75, 0.68, 0.45];
    for (const rx of world.roadX) m.flat(rx, 0.08, 0, 0.5, 400, line, 1);
    for (const rz of world.roadZ) m.flat(0, 0.08, rz, 460, 0.5, line, 1);
    // Buildings with lit windows at dusk/night.
    for (const b of world.buildings) {
      m.box(b.x, b.h / 2, b.z, b.w, b.h, b.d, hexRgb(b.color), light.ambient);
      if (light.windows) {
        const winCol = [1.0, 0.8, 0.45];
        const rows = Math.min(6, Math.floor(b.h / 5));
        for (let r = 0; r < rows; r += 1) {
          const y = 3 + r * 5;
          if (y > b.h - 2) break;
          m.face(b.x, y, b.z + b.d / 2 + 0.15, Math.min(b.w * 0.7, 8), 2.2, winCol, 0.95);
          m.face(b.x, y, b.z - b.d / 2 - 0.15, Math.min(b.w * 0.7, 8), 2.2, winCol, 0.95);
        }
      }
    }
    // Piers and boats moored at the marina.
    for (let i = 0; i < 5; i += 1) m.flat(-160 + i * 70, 0.3, 215, 8, 26, [0.45, 0.33, 0.22], 1);
    // Palm trees (kept off the roads and out of the staged chase camera lane).
    for (const palm of world.palms) {
      m.box(palm.x, 3, palm.z, 0.7, 6, 0.7, [0.35, 0.25, 0.15], light.ambient);
      m.flat(palm.x, 6.4, palm.z, 5, 5, [0.15, 0.5, 0.2], 1);
    }
    // Streetlights.
    for (const lamp of world.streetlights) {
      m.box(lamp.x, 3, lamp.z, 0.35, 6, 0.35, [0.2, 0.2, 0.22], light.ambient);
      if (light.windows) m.box(lamp.x, 6.2, lamp.z, 1.2, 0.5, 1.2, [1.0, 0.85, 0.5], 1);
    }
    return m;
  }

  function drawCar(m, car, light, time) {
    const body = hexRgb(car.color);
    const y = car.kind === 'boat' ? 0.6 : 0.6;
    m.rotBox(car.x, y, car.z, 2.4, 1.0, 4.8, car.heading, body, light.ambient);
    m.rotBox(car.x, y + 0.9, car.z - 0.3, 2.0, 0.8, 2.6, car.heading, shade(body, 0.75), light.ambient);
    if (car.kind === 'police') {
      m.rotBox(car.x, y + 1.5, car.z - 0.3, 1.2, 0.3, 0.8, car.heading, [0.1, 0.1, 0.15], light.ambient);
      const blink = Math.floor(time * 3) % 2 === 0 ? [1, 0.1, 0.1] : [0.1, 0.3, 1];
      m.rotBox(car.x, y + 1.75, car.z - 0.3, 1.0, 0.25, 0.6, car.heading, blink, 1);
    }
    if (car.kind === 'boat') {
      m.rotBox(car.x, y + 0.9, car.z, 1.8, 0.9, 2.2, car.heading, [0.9, 0.9, 0.9], light.ambient);
      return;
    }
    // Headlights and taillights; at night they throw pools on the wet road.
    const sin = Math.sin(car.heading), cos = Math.cos(car.heading);
    const fx = car.x + sin * 2.5, fz = car.z + cos * 2.5;
    const bx = car.x - sin * 2.5, bz = car.z - cos * 2.5;
    m.rotBox(fx - cos * 0.8, 0.7, fz + sin * 0.8, 0.4, 0.3, 0.3, car.heading, [1, 0.95, 0.7], 1);
    m.rotBox(fx + cos * 0.8, 0.7, fz - sin * 0.8, 0.4, 0.3, 0.3, car.heading, [1, 0.95, 0.7], 1);
    m.rotBox(bx - cos * 0.8, 0.7, bz + sin * 0.8, 0.4, 0.3, 0.3, car.heading, [1, 0.1, 0.1], 1);
    m.rotBox(bx + cos * 0.8, 0.7, bz - sin * 0.8, 0.4, 0.3, 0.3, car.heading, [1, 0.1, 0.1], 1);
    if (light.windows) {
      m.flat(fx + sin * 4, 0.12, fz + cos * 4, 3.2, 7, [1.0, 0.9, 0.6], 0.28);
      m.flat(bx - sin * 2, 0.12, bz - cos * 2, 2.6, 3, [1, 0.15, 0.15], 0.22);
    }
  }

  function draw(state, world, screen) {
    const light = lightingFor(state.time);
    resize();
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(light.sky[0], light.sky[1], light.sky[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const aspect = canvas.width / canvas.height;
    const proj = perspective((62 * Math.PI) / 180, aspect, 0.5, 900);
    const p = state.player;
    let eye, target;
    if (state.camera) {
      eye = [state.camera.pos.x, state.camera.pos.y, state.camera.pos.z];
      target = [state.camera.target.x, state.camera.target.y, state.camera.target.z];
    } else {
      const back = 13, height = 6.5;
      const sin = Math.sin(p.heading), cos = Math.cos(p.heading);
      eye = [p.x - sin * back, height, p.z - cos * back];
      target = [p.x + sin * 10, 2, p.z + cos * 10];
    }
    const view = lookAt(eye, target, [0, 1, 0]);
    gl.uniformMatrix4fv(loc.proj, false, new Float32Array(proj));
    gl.uniformMatrix4fv(loc.view, false, new Float32Array(view));
    gl.uniform3f(loc.fog, light.fog[0], light.fog[1], light.fog[2]);
    gl.uniform1f(loc.fogNear, 90);
    gl.uniform1f(loc.fogFar, 420);

    // Static geometry is rebuilt only when the lighting mode changes.
    if (!staticMesh || staticMode !== light.mode) {
      staticMesh = buildStatic(world, light);
      staticMode = light.mode;
    }
    const opaque = new Mesh();
    opaque.pos.push(...staticMesh.pos); opaque.col.push(...staticMesh.col); opaque.alpha.push(...staticMesh.alpha);

    // Sun billboard low on the horizon (golden hour / dusk), kept close enough to stay visible through the fog.
    if (light.mode === 'golden' || light.mode === 'dusk') {
      const sx = p.x - 150, sz = p.z - 150;
      opaque.face(sx, 24, sz, 30, 30, light.mode === 'golden' ? [1, 0.75, 0.35] : [1, 0.45, 0.3], 1);
    }
    // Cars, boats, pedestrians, collectibles, markers.
    for (const car of world.state.cars) drawCar(opaque, car, light, state.time);
    for (const ped of world.state.peds) {
      if (ped.down > 0) continue;
      opaque.box(ped.x, 0.9, ped.z, 0.8, 1.8, 0.8, hexRgb(ped.color), light.ambient);
      opaque.box(ped.x, 2.1, ped.z, 0.6, 0.5, 0.6, [0.85, 0.65, 0.5], light.ambient);
    }
    const t = state.elapsed;
    for (const c of world.collectibles) {
      if (c.taken) continue;
      const bob = Math.sin(t * 2 + c.bob) * 0.4;
      opaque.rotBox(c.x, 1.6 + bob, c.z, 0.9, 0.9, 0.9, t, [1, 0.8, 0.1], 1);
    }
    // Player on foot.
    if (p.onFoot) {
      opaque.box(p.x, 0.9, p.z, 0.9, 1.8, 0.9, [0, 0.7, 0.85], light.ambient);
      opaque.box(p.x, 2.1, p.z, 0.6, 0.5, 0.6, [0.85, 0.65, 0.5], light.ambient);
    }
    // Race rivals.
    if (state.race) {
      for (const v of state.race.rivals) {
        drawCar(opaque, { kind: 'rival', x: v.x, z: v.z, heading: v.heading, color: v.color, speed: 0 }, light, state.time);
      }
      const cp = state.race.checkpoints[Math.min(state.race.index, state.race.checkpoints.length - 1)];
      opaque.rotBox(cp.x, 3, cp.z, 1.2, 6, 1.2, t, [1, 0.8, 0.1], 1);
      opaque.flat(cp.x, 0.15, cp.z, 10, 10, [1, 0.8, 0.1], 0.5);
    }
    // Job marker.
    if (state.jobProgress) {
      const jp = state.jobProgress;
      const marker = jp.target || jp.marker || (jp.parcels && jp.parcels.find((q) => !q.got));
      if (marker) {
        opaque.rotBox(marker.x, 3, marker.z, 1.2, 6, 1.2, t, [0.2, 0.9, 1], 1);
        opaque.flat(marker.x, 0.15, marker.z, 10, 10, [0.2, 0.9, 1], 0.5);
      }
      if (jp.parcels) for (const parcel of jp.parcels) {
        if (!parcel.got) opaque.rotBox(parcel.x, 1.2, parcel.z, 1.4, 1.4, 1.4, t, [1, 0.6, 0.1], 1);
      }
    }
    // Helicopter with a restrained searchlight.
    if (state.heli) {
      const h = state.heli;
      opaque.rotBox(h.x, h.y, h.z, 6, 2.4, 3, h.angle, [0.12, 0.12, 0.18], light.ambient);
      opaque.rotBox(h.x - 4.5, h.y, h.z, 5, 0.8, 0.8, h.angle, [0.12, 0.12, 0.18], light.ambient);
      opaque.rotBox(h.x, h.y + 1.6, h.z, 9, 0.2, 0.6, h.angle, [0.4, 0.4, 0.45], 1);
    }

    gl.depthMask(true);
    const opaqueCount = upload(opaque);
    gl.drawArrays(gl.TRIANGLES, 0, opaqueCount);

    // Translucent pass: wet neon reflections, streetlight pools, the searchlight cone.
    const glow = new Mesh();
    if (light.windows) {
      for (const sign of world.neonSigns) {
        const c = hexRgb(sign.color);
        glow.face(sign.x, 8, sign.z, sign.w, 3, c, 0.95);
        // Wet-road reflection: a vertical streak on the road below the sign.
        glow.flat(sign.x, 0.12, sign.z + 8, sign.w * 0.9, 14, c, 0.30);
      }
      for (const lamp of world.streetlights) {
        const d = Math.hypot(lamp.x - p.x, lamp.z - p.z);
        if (d < 120) glow.flat(lamp.x, 0.12, lamp.z, 7, 7, [1.0, 0.85, 0.5], 0.22);
      }
    }
    if (state.heli) {
      const h = state.heli;
      // A restrained cone: narrow, short, visible but not a floodlight.
      const top = [h.x, h.y - 1, h.z];
      const baseY = 0.3;
      const r = 3.5;
      for (let i = 0; i < 10; i += 1) {
        const a0 = (i / 10) * Math.PI * 2, a1 = ((i + 1) / 10) * Math.PI * 2;
        glow.tri(top, [p.x + Math.cos(a0) * r, baseY, p.z + Math.sin(a0) * r], [p.x + Math.cos(a1) * r, baseY, p.z + Math.sin(a1) * r], [1, 0.95, 0.75], 0.05);
      }
      glow.flat(p.x, 0.14, p.z, 8, 8, [1, 0.95, 0.75], 0.2);
    }
    if (glow.pos.length) {
      gl.depthMask(false);
      const n = upload(glow);
      gl.drawArrays(gl.TRIANGLES, 0, n);
      gl.depthMask(true);
    }
  }

  // The minimap: street grid, water, objective marker, cars, player.
  function drawMinimap(canvas2d, world, state) {
    const ctx = canvas2d.getContext('2d');
    const W = canvas2d.width, H = canvas2d.height;
    const scale = W / 500;
    const toX = (x) => (x + 250) * scale;
    const toY = (z) => (z + 235) * scale;
    ctx.fillStyle = '#10131c';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#16324a';
    ctx.fillRect(0, toY(205), W, H - toY(205));
    ctx.strokeStyle = '#3a4152';
    ctx.lineWidth = 3;
    for (const rx of world.roadX) { ctx.beginPath(); ctx.moveTo(toX(rx), 0); ctx.lineTo(toX(rx), H); ctx.stroke(); }
    for (const rz of world.roadZ) { ctx.beginPath(); ctx.moveTo(0, toY(rz)); ctx.lineTo(W, toY(rz)); ctx.stroke(); }
    ctx.fillStyle = '#e8b64c';
    const jp = state.jobProgress;
    const marker = jp && (jp.target || jp.marker);
    if (marker) { ctx.beginPath(); ctx.arc(toX(marker.x), toY(marker.z), 5, 0, Math.PI * 2); ctx.fill(); }
    if (state.race) {
      const cp = state.race.checkpoints[Math.min(state.race.index, state.race.checkpoints.length - 1)];
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath(); ctx.arc(toX(cp.x), toY(cp.z), 5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#7fb3d5';
    for (const car of world.state.cars) { ctx.fillRect(toX(car.x) - 1, toY(car.z) - 1, 2, 2); }
    ctx.fillStyle = '#ff4757';
    for (const pc of world.state.police) { ctx.fillRect(toX(pc.x) - 2, toY(pc.z) - 2, 4, 4); }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(toX(state.player.x), toY(state.player.z), 4, 0, Math.PI * 2); ctx.fill();
  }

  return { draw, drawMinimap };
}
