/* PiVista game renderer: a tiny WebGL batch renderer with a Canvas-2D fallback.
 *
 * Why: drawing hundreds of polygons and sprites per frame with Canvas 2D is CPU-bound on a
 * Raspberry Pi 4. Here every rect / quad / sprite of a frame goes into ONE vertex buffer and is
 * drawn with ONE WebGL draw call from ONE texture atlas, so the Pi's GPU does the work.
 * If only software WebGL exists (e.g. Chromium in GPU-disabled safe mode) we use Canvas 2D.
 *
 *   const R = PVRender.create(canvas);
 *   const tex = R.texture(someCanvas);            // register sprites up front (packed into an atlas)
 *   R.begin('#000'); R.rect(x, y, w, h, '#f00'); R.image(tex, x, y, w, h, { alpha, tint, flip, sh, rot });
 *   R.grad(x, y, w, h, top, bottom); R.quad(x1, y1, x2, y2, x3, y3, x4, y4, color); R.end();
 */
'use strict';
const PVRender = (() => {
  // ---------- colour parsing (cached): #rgb #rrggbb #rrggbbaa rgb() rgba() hsl() hsla()
  const cache = new Map();
  function hsl2rgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360; s /= 100; l /= 100;
    if (!s) return [l, l, l];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
  }
  function color(c) {
    if (Array.isArray(c)) return c;
    let v = cache.get(c); if (v) return v;
    if (c[0] === '#') {
      let h = c.slice(1); if (h.length <= 4) h = [...h].map((x) => x + x).join('');
      v = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).concat(h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1);
    } else {
      const n = c.match(/[\d.]+/g).map(Number);
      v = c.startsWith('hsl') ? hsl2rgb(n[0], n[1], n[2]).concat(n[3] ?? 1) : [n[0] / 255, n[1] / 255, n[2] / 255, n[3] ?? 1];
    }
    cache.set(c, v); return v;
  }

  // ---------- WebGL backend
  function webgl(canvas) {
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, desynchronized: true,
      powerPreference: 'high-performance', failIfMajorPerformanceCaveat: !/[?&]gl\b/.test(location.search), preserveDrawingBuffer: false });
    if (!gl) return null;
    const VS = `attribute vec2 p; attribute vec2 t; attribute vec4 c; uniform vec2 res; varying vec2 vt; varying vec4 vc;
      void main(){ vt=t; vc=c; gl_Position=vec4(p.x/res.x*2.0-1.0, 1.0-p.y/res.y*2.0, 0.0, 1.0); }`;
    const FS = `precision mediump float; varying vec2 vt; varying vec4 vc; uniform sampler2D tex;
      void main(){ vec4 s=texture2D(tex, vt); gl_FragColor=vec4(s.rgb*vc.rgb, s.a*vc.a); }`;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog); if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);
    const MAXQ = 12000, FPV = 8;                       // floats per vertex: x y u v r g b a
    const data = new Float32Array(MAXQ * 6 * FPV); let n = 0;
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
    const attr = (name, size, off) => { const l = gl.getAttribLocation(prog, name); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, FPV * 4, off * 4); };
    attr('p', 2, 0); attr('t', 2, 2); attr('c', 4, 4);
    const uRes = gl.getUniformLocation(prog, 'res');
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // texture atlas (shelf packing); a 4x4 white block gives untextured shapes their colour
    const A = 2048; const atlas = document.createElement('canvas'); atlas.width = atlas.height = A;
    const actx = atlas.getContext('2d'); actx.fillStyle = '#fff'; actx.fillRect(0, 0, 4, 4);
    let sx = 6, sy = 0, rowH = 6, dirty = true; const WHITE = { u0: 1 / A, v0: 1 / A, u1: 3 / A, v1: 3 / A, w: 1, h: 1 };
    const glTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, glTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    function texture(img) {
      const w = img.width, h = img.height;
      if (sx + w + 2 > A) { sx = 0; sy += rowH + 2; rowH = 0; }
      if (sy + h > A) throw new Error('atlas full');
      actx.drawImage(img, sx, sy); const t = { u0: sx / A, v0: sy / A, u1: (sx + w) / A, v1: (sy + h) / A, w, h };
      sx += w + 2; rowH = Math.max(rowH, h); dirty = true; return t;
    }
    function v(x, y, u, vv, c) { const o = n * FPV; data[o] = x; data[o + 1] = y; data[o + 2] = u; data[o + 3] = vv; data[o + 4] = c[0]; data[o + 5] = c[1]; data[o + 6] = c[2]; data[o + 7] = c[3]; n++; }
    function flush() {
      if (!n) return;
      if (dirty) { gl.bindTexture(gl.TEXTURE_2D, glTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas); dirty = false; }
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.subarray(0, n * FPV)); gl.drawArrays(gl.TRIANGLES, 0, n); n = 0;
    }
    function quadUV(x1, y1, x2, y2, x3, y3, x4, y4, t, us, vs, c) {     // corners: tl tr br bl
      if (n + 6 > MAXQ * 6) flush();
      v(x1, y1, us[0], vs[0], c); v(x2, y2, us[1], vs[1], c); v(x3, y3, us[2], vs[2], c);
      v(x1, y1, us[0], vs[0], c); v(x3, y3, us[2], vs[2], c); v(x4, y4, us[3], vs[3], c);
    }
    const W4 = [WHITE.u0, WHITE.u1, WHITE.u1, WHITE.u0], H4 = [WHITE.v0, WHITE.v0, WHITE.v1, WHITE.v1];
    return {
      kind: 'webgl', texture,
      begin(bg) { gl.viewport(0, 0, canvas.width, canvas.height); gl.uniform2f(uRes, canvas.width, canvas.height); const c = color(bg || '#000'); gl.clearColor(c[0], c[1], c[2], 1); gl.clear(gl.COLOR_BUFFER_BIT); },
      end: flush,
      rect(x, y, w, h, c) { quadUV(x, y, x + w, y, x + w, y + h, x, y + h, WHITE, W4, H4, color(c)); },
      quad(x1, y1, x2, y2, x3, y3, x4, y4, c) { quadUV(x1, y1, x2, y2, x3, y3, x4, y4, WHITE, W4, H4, color(c)); },
      grad(x, y, w, h, top, bottom) {
        const a = color(top), b = color(bottom); if (n + 6 > MAXQ * 6) flush();
        v(x, y, WHITE.u0, WHITE.v0, a); v(x + w, y, WHITE.u1, WHITE.v0, a); v(x + w, y + h, WHITE.u1, WHITE.v1, b);
        v(x, y, WHITE.u0, WHITE.v0, a); v(x + w, y + h, WHITE.u1, WHITE.v1, b); v(x, y + h, WHITE.u0, WHITE.v1, b);
      },
      image(t, x, y, w, h, o = {}) {
        const c = o.tint ? color(o.tint).slice() : [1, 1, 1, 1]; if (o.alpha != null) c[3] = (c[3] ?? 1) * o.alpha;
        const sx0 = o.sx || 0, sh = o.sh != null ? o.sh : t.h - (o.sy || 0), sy0 = o.sy || 0, sw = o.sw != null ? o.sw : t.w - sx0;
        let u0 = t.u0 + (t.u1 - t.u0) * sx0 / t.w, u1 = t.u0 + (t.u1 - t.u0) * (sx0 + sw) / t.w;
        const v0 = t.v0 + (t.v1 - t.v0) * sy0 / t.h, v1 = t.v0 + (t.v1 - t.v0) * (sy0 + sh) / t.h;
        if (o.flip) [u0, u1] = [u1, u0];
        if (o.rot) {                                   // rotate around the bottom centre
          const cx = x + w / 2, cy = y + h, cs = Math.cos(o.rot), sn = Math.sin(o.rot);
          const P = (px, py) => [cx + (px - cx) * cs - (py - cy) * sn, cy + (px - cx) * sn + (py - cy) * cs];
          const a = P(x, y), b = P(x + w, y), d = P(x + w, y + h), e = P(x, y + h);
          quadUV(a[0], a[1], b[0], b[1], d[0], d[1], e[0], e[1], t, [u0, u1, u1, u0], [v0, v0, v1, v1], c);
        } else quadUV(x, y, x + w, y, x + w, y + h, x, y + h, t, [u0, u1, u1, u0], [v0, v0, v1, v1], c);
      },
    };
  }

  // ---------- Canvas 2D fallback (same API)
  function canvas2d(canvas) {
    const g = canvas.getContext('2d', { alpha: false, desynchronized: true });
    const grads = new Map(); const tinted = new Map();
    const css = (c) => { if (!Array.isArray(c)) return c; return `rgba(${c[0] * 255},${c[1] * 255},${c[2] * 255},${c[3] ?? 1})`; };
    function tintOf(t, c) {
      const k = t.id + c; let x = tinted.get(k); if (x) return x;
      x = document.createElement('canvas'); x.width = t.img.width; x.height = t.img.height; const xg = x.getContext('2d');
      xg.drawImage(t.img, 0, 0); xg.globalCompositeOperation = 'multiply'; xg.fillStyle = c; xg.fillRect(0, 0, x.width, x.height);
      xg.globalCompositeOperation = 'destination-in'; xg.drawImage(t.img, 0, 0); tinted.set(k, x); return x;
    }
    let ids = 0;
    return {
      kind: '2d', texture: (img) => ({ img, w: img.width, h: img.height, id: ++ids }),
      begin(bg) { g.globalAlpha = 1; g.fillStyle = bg || '#000'; g.fillRect(0, 0, canvas.width, canvas.height); },
      end() {},
      rect(x, y, w, h, c) { g.fillStyle = css(c); g.fillRect(x, y, w, h); },
      quad(x1, y1, x2, y2, x3, y3, x4, y4, c) { g.fillStyle = css(c); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.lineTo(x3, y3); g.lineTo(x4, y4); g.closePath(); g.fill(); },
      grad(x, y, w, h, top, bottom) {
        const k = [y, h, top, bottom].join(); let gr = grads.get(k);
        if (!gr) { gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, css(top)); gr.addColorStop(1, css(bottom)); grads.set(k, gr); }
        g.fillStyle = gr; g.fillRect(x, y, w, h);
      },
      image(t, x, y, w, h, o = {}) {
        const img = o.tint ? tintOf(t, o.tint) : t.img;
        const sx = o.sx || 0, sy = o.sy || 0, sw = o.sw != null ? o.sw : t.w - sx, sh = o.sh != null ? o.sh : t.h - sy;
        if (sw <= 0 || sh <= 0 || w <= 0 || h <= 0) return;
        if (o.alpha != null) g.globalAlpha = o.alpha;
        if (o.flip || o.rot) {
          g.save(); g.translate(x + w / 2, y + h); if (o.rot) g.rotate(o.rot); if (o.flip) g.scale(-1, 1);
          g.drawImage(img, sx, sy, sw, sh, -w / 2, -h, w, h); g.restore();
        } else g.drawImage(img, sx, sy, sw, sh, x, y, w, h);
        g.globalAlpha = 1;
      },
    };
  }

  return {
    create(canvas, opts = {}) {
      let r = null;
      if (!opts.force2d && !/[?&]2d\b/.test(location.search)) { try { r = webgl(canvas); } catch (_) { r = null; } }
      r = r || canvas2d(canvas);
      console.log('PiVista renderer:', r.kind);
      document.documentElement.dataset.renderer = r.kind;
      return r;
    },
  };
})();
