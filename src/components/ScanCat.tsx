import {useEffect, useRef, useState} from 'react';

/**
 * A scanline cat, drawn live in WebGL over a clean video.
 *
 * The frame is cut into square cells, one row of cells per scanline. Each
 * cell reads the video's brightness and becomes nothing (highlights and the
 * white backdrop), a thin rule, a thick rule, or a solid pixel block (eyes,
 * nose, paw pads). Under the rules sits a soft, low-contrast ghost of the
 * footage, so the cat glows faintly through the gaps. The texture and the
 * per-cell flicker step at 12 fps for a choppy, sampled feel.
 */

const STEP_MS = 1000 / 12;

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform sampler2D uTex;
uniform vec2 uOrigin;  // texture top-left, device px from the canvas top-left
uniform vec2 uScale;   // uv per device px
uniform float uH;      // canvas height, device px
uniform float uRow;    // scanline pitch = cell height, device px
uniform float uCellW;  // cell width (wider than tall, for coarse horizontal steps)
uniform float uLine;   // thin rule thickness, device px
uniform float uBlur;   // ghost blur radius, device px
uniform float uSeed;
uniform vec3 uPage;
uniform vec3 uInk;

// Studio backdrop reads ~0.97, the eyes ~0.05 (sampled from the renders).
const float WHITE = 0.965;
const float BLACK = 0.12;
const float T_THIN = 0.10;
const float T_THICK = 0.42;
const float T_BLOCK = 0.66;

float lum(vec2 px) {
  vec2 uv = clamp((px - uOrigin) * uScale, 0.0, 1.0);
  return dot(texture2D(uTex, uv).rgb, vec3(0.299, 0.587, 0.114));
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 px = vec2(gl_FragCoord.x, uH - gl_FragCoord.y);
  vec2 size = vec2(uCellW, uRow);
  vec2 cell = floor(px / size);
  vec2 c = (cell + 0.5) * size;

  // Four taps per cell so fine fur texture doesn't sparkle.
  vec2 q = size * 0.25;
  float L = 0.25 * (lum(c - q) + lum(c + vec2(q.x, -q.y)) + lum(c + vec2(-q.x, q.y)) + lum(c + q));
  float s = clamp((WHITE - L) / (WHITE - BLACK), 0.0, 1.0);
  s += (hash(cell + uSeed) - 0.5) * 0.04 + (hash(vec2(cell.y, uSeed * 1.7)) - 0.5) * 0.05;

  float th = s > T_BLOCK ? uRow : s > T_THICK ? uLine * 2.0 : s > T_THIN ? uLine : 0.0;
  float y = px.y - cell.y * uRow;
  float top = floor((uRow - th) * 0.5);
  float on = th > 0.0 ? step(top, y) * step(y, top + th) : 0.0;

  float g = lum(px);
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398;
    g += lum(px + vec2(cos(a), sin(a)) * uBlur);
  }
  g /= 9.0;
  vec3 ghost = clamp(uPage + (g - WHITE) * 0.55, 0.0, 1.0);

  gl_FragColor = vec4(mix(ghost, uInk, on), 1.0);
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(sh));
    return null;
  }
  return sh;
}

function link(gl: WebGLRenderingContext) {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(prog));
    return null;
  }
  return prog;
}

const hexToRgb = (hex: string) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255] as const;
};

interface Props {
  video: string;
  poster: string;
  page?: string;
  ink?: string;
  className?: string;
}

export function ScanCat({video, poster, page = '#f0f1ee', ink = '#0b0b0b', className = ''}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = host.current!;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Canvas is created here and only attached after the first real frame:
    // a JSX canvas reused across StrictMode mounts can come back lost and paint white.
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    const gl = canvas.getContext('webgl', {alpha: false, antialias: false, depth: false, stencil: false});
    const prog = gl && link(gl);
    if (!gl || !prog) {
      setFailed(true);
      return;
    }

    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const u = (name: string) => gl.getUniformLocation(prog, name);
    const uni = {
      origin: u('uOrigin'),
      scale: u('uScale'),
      h: u('uH'),
      row: u('uRow'),
      cellW: u('uCellW'),
      line: u('uLine'),
      blur: u('uBlur'),
      seed: u('uSeed'),
    };
    gl.uniform1i(u('uTex'), 0);
    gl.uniform3fv(u('uPage'), hexToRgb(page));
    gl.uniform3fv(u('uInk'), hexToRgb(ink));

    let W = 1;
    let H = 1;
    let srcW = 0;
    let srcH = 0;
    let usingVideo = false;
    let attached = false;
    let disposed = false;

    // Fit the source by height; on narrow stages fit ~72% of its width instead
    // so the cat (about 60% of the frame) is never cropped. Outside the frame
    // the edge texels extend, so the studio shade simply carries on.
    const fit = () => {
      if (!srcW) return;
      const k = Math.min(H / srcH, W / (0.72 * srcW));
      gl.uniform2f(uni.origin, W * 0.5 - (srcW * k) / 2, H * 0.5 - (srcH * k) / 2);
      gl.uniform2f(uni.scale, 1 / (srcW * k), 1 / (srcH * k));
    };

    const layout = () => {
      const r = el.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(1, Math.round(r.width * dpr));
      H = Math.max(1, Math.round(r.height * dpr));
      canvas.width = W;
      canvas.height = H;
      gl.viewport(0, 0, W, H);
      // ~110 scanlines down the stage; whole device pixels keep rules crisp.
      const row = Math.max(4, Math.round(Math.max(4.5, r.height / 110) * dpr));
      gl.uniform1f(uni.h, H);
      gl.uniform1f(uni.row, row);
      gl.uniform1f(uni.cellW, Math.round(row * 1.5));
      gl.uniform1f(uni.line, Math.max(1, Math.round(row * 0.38)));
      gl.uniform1f(uni.blur, row * 1.6);
      fit();
    };

    const upload = (src: TexImageSource, w: number, h: number) => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, src);
      if (w !== srcW || h !== srcH) {
        srcW = w;
        srcH = h;
        fit();
      }
    };

    let seed = 0;
    const draw = () => {
      if (!srcW || disposed) return;
      gl.uniform1f(uni.seed, seed);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!attached) {
        attached = true;
        el.appendChild(canvas);
      }
    };

    const onLost = (e: Event) => {
      e.preventDefault();
      canvas.remove();
      setFailed(true);
    };
    canvas.addEventListener('webglcontextlost', onLost);

    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      if (disposed || usingVideo) return;
      upload(img, img.naturalWidth, img.naturalHeight);
      draw();
    };
    img.src = poster;

    // The video stays in the DOM (invisible) so every browser keeps decoding it.
    const vid = document.createElement('video');
    if (!reduced) {
      vid.muted = true;
      vid.loop = true;
      vid.playsInline = true;
      vid.preload = 'auto';
      vid.setAttribute('aria-hidden', 'true');
      vid.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none';
      vid.addEventListener('loadeddata', () => {
        usingVideo = true;
        vid.play().catch(() => {});
      });
      // No clip yet (or it fails): the poster keeps rendering through the shader.
      vid.addEventListener('error', () => (usingVideo = false));
      vid.src = video;
      el.appendChild(vid);
    }

    layout();
    const ro = new ResizeObserver(() => {
      layout();
      draw();
    });
    ro.observe(el);

    let visible = true;
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (!usingVideo) return;
      if (visible) vid.play().catch(() => {});
      else vid.pause();
    });
    io.observe(el);

    let raf = 0;
    let last = -Infinity;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (!visible || t - last < STEP_MS) return;
      last = t;
      if (usingVideo && vid.readyState >= 2) upload(vid, vid.videoWidth, vid.videoHeight);
      seed = (seed + 1) % 509;
      draw();
    };
    if (!reduced) raf = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      img.onload = null;
      vid.pause();
      vid.removeAttribute('src');
      vid.load();
      vid.remove();
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.remove();
    };
  }, [video, poster, page, ink]);

  return (
    <div ref={host} className={`relative overflow-hidden ${className}`} aria-hidden>
      {failed && <img src={poster} alt="" className="absolute inset-0 h-full w-full object-cover grayscale" />}
    </div>
  );
}
