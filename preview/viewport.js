const vertexCode = `
attribute vec3 point;
uniform vec3 right, up, forward, center;
uniform vec2 scale, shift;
uniform float depth;
varying vec3 modelPoint;
void main() {
  vec3 p = point - center;
  gl_Position = vec4(vec2(dot(p, right), dot(p, up)) * scale + shift,
                     dot(p, forward) * depth, 1.0);
  modelPoint = point;
}`;
const fragmentCode = `
#extension GL_OES_standard_derivatives : enable
precision highp float;
uniform vec3 light;
uniform vec3 color;
uniform bool shaded;
varying vec3 modelPoint;
void main() {
  float intensity = 1.0;
  if (shaded) {
    vec3 normal = normalize(cross(dFdx(modelPoint), dFdy(modelPoint)));
    intensity = 0.63 + 0.37 * max(0.0, dot(normal, light));
  }
  gl_FragColor = vec4(color * intensity, 1.0);
}`;

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

function compile(gl, type, code) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, code);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
  return shader;
}

export function makeViewport(canvas) {
  const gl = canvas.getContext('webgl', { alpha: true, antialias: true });
  if (!gl || !gl.getExtension('OES_standard_derivatives')) throw new Error('Для 3D-вида нужен WebGL');
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertexCode));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragmentCode));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  const uniforms = Object.fromEntries(
    ['right', 'up', 'forward', 'center', 'scale', 'shift', 'depth', 'light', 'color', 'shaded']
      .map(key => [key, gl.getUniformLocation(program, key)])
  );
  const point = gl.getAttribLocation(program, 'point');
  gl.enableVertexAttribArray(point);
  const chunks = {
    triangles: { buffer: gl.createBuffer(), mode: gl.TRIANGLES, color: [0.43, 0.66, 0.93] },
    segments: { buffer: gl.createBuffer(), mode: gl.LINES, color: [0.15, 0.29, 0.46] },
    measure: { buffer: gl.createBuffer(), mode: gl.LINES, color: [0.78, 0.18, 0.13] }
  };
  let center = [0, 0, 0], radius = 10, zoom = 1, shift = [0, 0];
  let yaw = -0.65, pitch = 0.55, frame = 0;
  let mesh = { triangles: new Float32Array(), segments: new Float32Array() };
  const pointers = new Map();

  function upload(key, data) {
    const chunk = chunks[key];
    gl.bindBuffer(gl.ARRAY_BUFFER, chunk.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    chunk.count = data.length / 3;
  }

  function draw() {
    frame = 0;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (width !== canvas.width || height !== canvas.height) {
      canvas.width = width;
      canvas.height = height;
    }
    const right = [Math.cos(yaw), Math.sin(yaw), 0];
    const forward = [Math.sin(yaw) * Math.cos(pitch), -Math.cos(yaw) * Math.cos(pitch), -Math.sin(pitch)];
    const up = cross(right, forward).map(n => -n);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniform3fv(uniforms.right, right);
    gl.uniform3fv(uniforms.up, up);
    gl.uniform3fv(uniforms.forward, forward);
    gl.uniform3fv(uniforms.center, center);
    gl.uniform3fv(uniforms.light, forward.map((n, i) => -n * 0.84 + up[i] * 0.48 - right[i] * 0.24));
    const factor = 0.85 * zoom / radius * Math.min(width, height);
    gl.uniform2f(uniforms.scale, factor / width, factor / height);
    gl.uniform2f(uniforms.shift, ...shift);
    gl.uniform1f(uniforms.depth, 0.8 / radius);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1, 1);
    for (const [name, chunk] of Object.entries(chunks)) {
      if (!chunk.count) continue;
      if (name === 'measure') gl.disable(gl.DEPTH_TEST);
      gl.bindBuffer(gl.ARRAY_BUFFER, chunk.buffer);
      gl.vertexAttribPointer(point, 3, gl.FLOAT, false, 0, 0);
      gl.uniform3fv(uniforms.color, chunk.color);
      gl.uniform1i(uniforms.shaded, name === 'triangles');
      gl.drawArrays(chunk.mode, 0, chunk.count);
    }
  }

  function redraw() { if (!frame) frame = requestAnimationFrame(draw); }

  function fit() {
    const low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity];
    for (const data of [mesh.triangles, mesh.segments]) {
      for (let i = 0; i < data.length; i++) {
        const axis = i % 3;
        low[axis] = Math.min(low[axis], data[i]);
        high[axis] = Math.max(high[axis], data[i]);
      }
    }
    const empty = !Number.isFinite(low[0]);
    center = empty ? [0, 0, 0] : low.map((n, i) => (n + high[i]) / 2);
    radius = empty ? 10 : Math.max(0.001, Math.hypot(...high.map((n, i) => n - low[i])) / 2);
    shift = [0, 0];
    zoom = 1;
    redraw();
  }

  function pan(dx, dy) {
    shift[0] += 2 * dx / canvas.clientWidth;
    shift[1] -= 2 * dy / canvas.clientHeight;
  }
  function rotate(dx, dy) {
    yaw -= dx * 0.009;
    pitch = clamp(pitch + dy * 0.009, -1.54, 1.54);
  }
  function resizeZoom(factor) { zoom = clamp(zoom * factor, 0.12, 25); }
  function coords(event) { return [event.clientX, event.clientY]; }

  canvas.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button > 2) return;
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, coords(event));
  });
  canvas.addEventListener('pointermove', event => {
    const old = pointers.get(event.pointerId);
    if (!old) return;
    const now = coords(event);
    const dx = now[0] - old[0], dy = now[1] - old[1];
    if (pointers.size > 1) {
      const other = [...pointers].find(([id]) => id !== event.pointerId)[1];
      const start = Math.hypot(other[0] - old[0], other[1] - old[1]);
      const end = Math.hypot(other[0] - now[0], other[1] - now[1]);
      if (start > 1 && end > 1) resizeZoom(end / start);
      pan(dx / 2, dy / 2);
    } else if (event.shiftKey || event.buttons & 6) pan(dx, dy);
    else rotate(dx, dy);
    pointers.set(event.pointerId, now);
    redraw();
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
    canvas.addEventListener(type, event => pointers.delete(event.pointerId));
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    resizeZoom(Math.exp(-event.deltaY * 0.0015));
    redraw();
  }, { passive: false });
  canvas.addEventListener('dblclick', fit);
  new ResizeObserver(redraw).observe(canvas);
  return {
    fit,
    capture() {
      if (frame) cancelAnimationFrame(frame);
      draw();
      return canvas.toDataURL('image/png');
    },
    update(next, resetCamera) {
      mesh = next;
      upload('triangles', next.triangles);
      upload('segments', next.segments);
      upload('measure', new Float32Array());
      if (resetCamera) fit();
      else redraw();
    },
    mark(from, to) {
      upload('measure', new Float32Array([...from, ...to]));
      redraw();
    }
  };
}
