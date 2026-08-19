import {
  WebGLRenderer,
  Scene,
  OrthographicCamera,
  PlaneGeometry,
  Mesh,
  ShaderMaterial,
  CanvasTexture,
  Vector2,
  Vector4,
  LinearFilter
} from "https://cdnjs.cloudflare.com/ajax/libs/three.js/0.180.0/three.module.min.js";

(() => {
  // ── app-wide constants ──────────────────────────────────
  const RENDERER = {
    MAX_PIXEL_RATIO: 2
  };

  const MASK = {
    PROBE_FONT_SIZE: 300,
    PROBE_CANVAS_W: 2000,
    PROBE_CANVAS_H: 800,
    INK_BRIGHTNESS_THRESHOLD: 64,
    MAX_HEIGHT_FRACTION: 0.98
  };

  const FONT_SCALE = {
    SLIDER_MIN: 10,
    SLIDER_MAX: 100,
    FULL_WIDTH: 80 // Adjusted to prevent text from being too large
  };

  const INPUT = {
    DEFAULT_TEXT: "HI, I'M BOGDAN ZOGOVIC",
    REBUILD_DEBOUNCE_MS: 60
  };

  const RIPPLE = {
    SLOT_COUNT: 4,
    DECAY_RATE: 1.1,
    RING_FREQUENCY: 7.0,
    RING_SPEED_MUL: 9.0,
    DIST_FALLOFF: 2.2,
    AMPLITUDE: 1.8
  };

  const MOUSE_SWELL = {
    DIST_FALLOFF: 2.5,
    FREQUENCY: 9.0,
    SPEED_MUL: 5.0,
    AMPLITUDE: 1.2
  };

  const CONTOUR = {
    LINE_WIDTH: 0.22,
    AA_BASE: 0.015,
    AA_DENSITY_SCALE: 0.005,
    WAVE_SCALE: 0.5
  };

  const MASK_BLEND = {
    EDGE_LO: 0.38,
    EDGE_HI: 0.62
  };

  const PALETTE = {
    BG: [0.8, 1.0, 0.0],
    FILL: [0.765, 0.518, 1.0]
  };

  const BASE_WAVES = [
    { amp: 1.0, fx: 2.4, fy: 0.9, ts: 1.15, phase: 0 },
    { amp: 0.82, fx: -1.3, fy: 2.6, ts: -0.87, phase: Math.PI / 2 },
    { amp: 0.65, fx: 1.7, fy: -2.0, ts: 1.41, phase: Math.PI },
    { amp: 0.7, fx: -2.8, fy: -1.2, ts: -0.66, phase: 0.8 },
    { amp: 0.5, fx: 0.9, fy: 3.1, ts: 1.05, phase: 2.3 },
    { amp: 0.38, fx: 3.2, fy: 0.7, ts: -1.23, phase: 4.7 },
    { amp: 0.3, fx: -1.0, fy: -2.4, ts: 1.56, phase: 5.5 },
    { amp: 0.28, fx: 2.1, fy: 1.7, ts: 0.54, phase: 1.1 }
  ];

  const TURB_WAVES = [
    { amp: 0.35, fx: 5.6, fy: 4.4, ts: 1.1, hFold: 0.8 },
    { amp: 0.18, fx: 8.3, fy: -7.0, ts: -0.9, hFold: 1.3 },
    { amp: 0.1, fx: 12.0, fy: 9.5, ts: 1.6, hFold: 1.8 }
  ];

  const glslFloat = (n) => (Number.isInteger(n) ? n.toFixed(1) : String(n));
  const f4 = (n) => n.toFixed(4);

  function baseWaveGLSL(w) {
    const phase = w.phase !== 0 ? ` + ${f4(w.phase)}` : "";
    return `        h += ${f4(w.amp)} * sin(${f4(w.fx)}*p.x + ${f4(
      w.fy
    )}*p.y + t*${f4(w.ts)}${phase});`;
  }

  function turbWaveGLSL(w) {
    return `          h += uTurb * ${f4(w.amp)} * sin(${f4(w.fx)}*p.x + ${f4(
      w.fy
    )}*p.y + t*${f4(w.ts)} + h*${f4(w.hFold)});`;
  }

  // ── Initialize when DOM is ready ────────────────────────
  function initFluidText() {
    const container = document.querySelector('.fluid-text-container');
    if (!container) return;

    // ── renderer ──────────────────────────────────────────
    const renderer = new WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, RENDERER.MAX_PIXEL_RATIO));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.domElement.id = "three";
    container.appendChild(renderer.domElement);

    const scene = new Scene();
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // ── glyph mask texture ────────────────────────────────
    const maskCanvas = document.createElement("canvas");
    const maskCtx = maskCanvas.getContext("2d");
    let maskTex = null;

    function buildMask(text) {
      const W = container.clientWidth;
      const H = container.clientHeight;
      maskCanvas.width = W;
      maskCanvas.height = H;

      maskCtx.fillStyle = "#000";
      maskCtx.fillRect(0, 0, W, H);

      const str = (text || "").toUpperCase() || INPUT.DEFAULT_TEXT;

      // ── Step 1: measure true ink bounds ──
      const probeCanvas = document.createElement("canvas");
      probeCanvas.width = MASK.PROBE_CANVAS_W;
      probeCanvas.height = MASK.PROBE_CANVAS_H;
      const pc = probeCanvas.getContext("2d");
      pc.fillStyle = "#000";
      pc.fillRect(0, 0, MASK.PROBE_CANVAS_W, MASK.PROBE_CANVAS_H);
      pc.fillStyle = "#fff";
      pc.font = `900 ${MASK.PROBE_FONT_SIZE}px Unbounded, "Arial Black", sans-serif`;
      pc.textAlign = "center";
      pc.textBaseline = "middle";
      pc.fillText(str, MASK.PROBE_CANVAS_W / 2, MASK.PROBE_CANVAS_H / 2);

      const pd = pc.getImageData(0, 0, MASK.PROBE_CANVAS_W, MASK.PROBE_CANVAS_H).data;
      let minX = MASK.PROBE_CANVAS_W, maxX = 0;
      let minY = MASK.PROBE_CANVAS_H, maxY = 0;

      for (let y = 0; y < MASK.PROBE_CANVAS_H; y++) {
        for (let x = 0; x < MASK.PROBE_CANVAS_W; x++) {
          if (pd[(y * MASK.PROBE_CANVAS_W + x) * 4] > MASK.INK_BRIGHTNESS_THRESHOLD) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      const inkW = Math.max(1, maxX - minX);
      const inkH = Math.max(1, maxY - minY);

      // ── Step 2: compute final font size ───────────────────
      const fullWidthFontSize = MASK.PROBE_FONT_SIZE * (W / inkW);
      const userScaleFraction = +document.getElementById("sl-f").value / FONT_SCALE.FULL_WIDTH;
      const mobileScale = window.innerWidth < 768 ? 0.7 : 1; // Reduce font size on mobile
      const finalFontSize = Math.min(
        fullWidthFontSize * userScaleFraction * mobileScale,
        H * MASK.MAX_HEIGHT_FRACTION
      );

      // ── Step 3: draw at final size ───────────────────
      maskCtx.fillStyle = "#fff";
      maskCtx.font = `900 ${finalFontSize}px Unbounded, "Arial Black", sans-serif`;
      maskCtx.textAlign = "center";
      maskCtx.textBaseline = "middle";

      const probeInkCentreY = (minY + maxY) / 2;
      const probeCanvaCentreY = MASK.PROBE_CANVAS_H / 2;
      const inkCentreOffset =
        (probeInkCentreY - probeCanvaCentreY) * (finalFontSize / MASK.PROBE_FONT_SIZE);
      maskCtx.fillText(str, W / 2, H / 2 - inkCentreOffset);

      if (maskTex) {
        maskTex.image = maskCanvas;
        maskTex.needsUpdate = true;
      } else {
        maskTex = new CanvasTexture(maskCanvas);
        maskTex.minFilter = LinearFilter;
        maskTex.magFilter = LinearFilter;
      }
    }

    buildMask(INPUT.DEFAULT_TEXT);

    // ── shader uniforms ───────────────────────────────────
    const uniforms = {
      uTime: { value: 0.0 },
      uRes: {
        value: new Vector2(
          container.clientWidth * renderer.getPixelRatio(),
          container.clientHeight * renderer.getPixelRatio()
        )
      },
      uMouse: { value: new Vector2(0.5, 0.5) },
      uDensity: { value: 9.0 },
      uSpeed: { value: 0.28 },
      uTurb: { value: 0.45 },
      uMask: { value: maskTex },
      uR0: { value: new Vector4(0, 0, -1, 0) },
      uR1: { value: new Vector4(0, 0, -1, 0) },
      uR2: { value: new Vector4(0, 0, -1, 0) },
      uR3: { value: new Vector4(0, 0, -1, 0) }
    };

    // ── fragment shader ───────────────────────────────────
    const fragmentShader = /* glsl */ `
      precision highp float;
 
      uniform float     uTime;
      uniform vec2      uRes;
      uniform vec2      uMouse;
      uniform float     uDensity;
      uniform float     uSpeed;
      uniform float     uTurb;
      uniform sampler2D uMask;
      uniform vec4      uR0, uR1, uR2, uR3;
 
      const vec3 COLOR_BG   = vec3(${PALETTE.BG.map((v) => v.toFixed(3)).join(", ")});
      const vec3 COLOR_FILL = vec3(${PALETTE.FILL.map((v) => v.toFixed(3)).join(", ")});
 
      const float MASK_EDGE_LO = ${glslFloat(MASK_BLEND.EDGE_LO)};
      const float MASK_EDGE_HI = ${glslFloat(MASK_BLEND.EDGE_HI)};
 
      const float RIPPLE_DECAY_RATE   = ${glslFloat(RIPPLE.DECAY_RATE)};
      const float RIPPLE_RING_FREQ    = ${glslFloat(RIPPLE.RING_FREQUENCY)};
      const float RIPPLE_RING_SPEED   = ${glslFloat(RIPPLE.RING_SPEED_MUL)};
      const float RIPPLE_DIST_FALLOFF = ${glslFloat(RIPPLE.DIST_FALLOFF)};
      const float RIPPLE_AMPLITUDE    = ${glslFloat(RIPPLE.AMPLITUDE)};
 
      const float SWELL_DIST_FALLOFF = ${glslFloat(MOUSE_SWELL.DIST_FALLOFF)};
      const float SWELL_FREQUENCY    = ${glslFloat(MOUSE_SWELL.FREQUENCY)};
      const float SWELL_SPEED_MUL    = ${glslFloat(MOUSE_SWELL.SPEED_MUL)};
      const float SWELL_AMPLITUDE    = ${glslFloat(MOUSE_SWELL.AMPLITUDE)};
 
      const float CONTOUR_LINE_WIDTH   = ${glslFloat(CONTOUR.LINE_WIDTH)};
      const float CONTOUR_AA_BASE      = ${glslFloat(CONTOUR.AA_BASE)};
      const float CONTOUR_AA_DENSITY   = ${glslFloat(CONTOUR.AA_DENSITY_SCALE)};
      const float CONTOUR_WAVE_SCALE   = ${glslFloat(CONTOUR.WAVE_SCALE)};
 
      float tri(float x) {
        return abs(fract(x + 0.5) - 0.5) * 2.0;
      }
 
      float ripple(vec4 r, vec2 uv, float t) {
        if (r.z < 0.0) return 0.0;
        float age       = t - r.z;
        float decay     = exp(-age * RIPPLE_DECAY_RATE);
        float ar        = uRes.x / uRes.y;
        vec2  delta     = (uv - r.xy) * vec2(ar, 1.0);
        float dist      = length(delta);
        float ringPhase = dist * RIPPLE_RING_FREQ - age * uSpeed * RIPPLE_RING_SPEED;
        return decay * sin(ringPhase) * exp(-dist * RIPPLE_DIST_FALLOFF) * RIPPLE_AMPLITUDE;
      }
 
      void main() {
        vec2  uv = gl_FragCoord.xy / uRes;
        float ar = uRes.x / uRes.y;
        vec2  p  = vec2(uv.x * ar, uv.y);
        float t  = uTime * uSpeed;
 
        float insideMask = texture2D(uMask, uv).r;
        float mask       = smoothstep(MASK_EDGE_LO, MASK_EDGE_HI, insideMask);
 
        if (mask < 0.001) {
          gl_FragColor = vec4(COLOR_BG, 1.0);
          return;
        }
 
        float h = 0.0;
${BASE_WAVES.map(baseWaveGLSL).join("\n")}
 
        if (uTurb > 0.0) {
${TURB_WAVES.map(turbWaveGLSL).join("\n")}
        }
 
        vec2  swellDelta = (uv - uMouse) * vec2(ar, 1.0);
        float swellDist  = length(swellDelta);
        h += SWELL_AMPLITUDE
           * exp(-swellDist * SWELL_DIST_FALLOFF)
           * sin(swellDist * SWELL_FREQUENCY - t * SWELL_SPEED_MUL);
 
        h += ripple(uR0, uv, uTime);
        h += ripple(uR1, uv, uTime);
        h += ripple(uR2, uv, uTime);
        h += ripple(uR3, uv, uTime);
 
        float bands     = tri(h * uDensity * CONTOUR_WAVE_SCALE);
        float aaRadius  = CONTOUR_AA_BASE + CONTOUR_AA_DENSITY * uDensity;
        float isOnLine  = 1.0 - smoothstep(CONTOUR_LINE_WIDTH - aaRadius,
                                           CONTOUR_LINE_WIDTH + aaRadius, bands);
        vec3  fluidColor = mix(COLOR_FILL, COLOR_BG, isOnLine);
 
        gl_FragColor = vec4(mix(COLOR_BG, fluidColor, mask), 1.0);
      }
    `;

    const material = new ShaderMaterial({
      uniforms,
      vertexShader: `void main(){ gl_Position = vec4(position, 1.0); }`,
      fragmentShader
    });
    scene.add(new Mesh(new PlaneGeometry(2, 2), material));

    // ── resize ────────────────────────────────────────────
    const resizeObserver = new ResizeObserver(() => {
      renderer.setSize(container.clientWidth, container.clientHeight);
      const pr = renderer.getPixelRatio();
      uniforms.uRes.value.set(container.clientWidth * pr, container.clientHeight * pr);
      buildMask(document.getElementById("text-field").value || INPUT.DEFAULT_TEXT);
      uniforms.uMask.value = maskTex;
    });
    resizeObserver.observe(container);

    // Also handle window resize for mobile detection
    window.addEventListener('resize', () => {
      buildMask(document.getElementById("text-field").value || INPUT.DEFAULT_TEXT);
      uniforms.uMask.value = maskTex;
    });

    // ── text input ────────────────────────────────────────
    const textField = document.getElementById("text-field");
    let rebuildTimer = null;

    textField.addEventListener("input", () => {
      clearTimeout(rebuildTimer);
      rebuildTimer = setTimeout(() => {
        buildMask(textField.value);
        uniforms.uMask.value = maskTex;
      }, INPUT.REBUILD_DEBOUNCE_MS);
    });

    // ── mouse tracking + custom cursor ───────────────────
    const cursorEl = document.getElementById("cursor");

    container.addEventListener("mousemove", (e) => {
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      cursorEl.style.left = x + "px";
      cursorEl.style.top = y + "px";
      cursorEl.style.transform = 'translate(-50%, -50%)';
      uniforms.uMouse.value.set(
        x / container.clientWidth,
        1 - y / container.clientHeight
      );
    });
    
    container.addEventListener("mousedown", () => cursorEl.classList.add("big"));
    container.addEventListener("mouseup", () => cursorEl.classList.remove("big"));

    // ── click ripples ─────────────────────────────────────
    const rippleSlots = [
      uniforms.uR0,
      uniforms.uR1,
      uniforms.uR2,
      uniforms.uR3
    ];
    let rippleIndex = 0;

    container.addEventListener("click", (e) => {
      if (e.target.closest("#type-input")) return;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      rippleSlots[rippleIndex % RIPPLE.SLOT_COUNT].value.set(
        x / container.clientWidth,
        1 - y / container.clientHeight,
        uniforms.uTime.value,
        1
      );
      rippleIndex++;
    });

    // ── slider controls ───────────────────────────────────
    document.getElementById("sl-d").addEventListener("input", (e) => {
      uniforms.uDensity.value = +e.target.value;
    });
    document.getElementById("sl-s").addEventListener("input", (e) => {
      uniforms.uSpeed.value = +e.target.value / 100;
    });
    document.getElementById("sl-t").addEventListener("input", (e) => {
      uniforms.uTurb.value = +e.target.value / 100;
    });
    document.getElementById("sl-f").addEventListener("input", () => {
      buildMask(textField.value);
      uniforms.uMask.value = maskTex;
    });

    let paused = false;
    document.getElementById("btn-p").addEventListener("click", function () {
      paused = !paused;
      this.textContent = paused ? "▶" : "⏸";
    });

    // ── render loop ───────────────────────────────────────
    let lastTimestamp = null;
    let elapsed = 0;

    (function loop(timestamp) {
      requestAnimationFrame(loop);
      const dt = lastTimestamp === null ? 0 : Math.min((timestamp - lastTimestamp) / 1000, 0.05);
      lastTimestamp = timestamp;
      if (!paused) elapsed += dt;
      uniforms.uTime.value = elapsed;
      renderer.render(scene, camera);
    })(0);
  }

  // Initialize when fonts are loaded and DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      document.fonts.ready.then(initFluidText);
    });
  } else {
    document.fonts.ready.then(initFluidText);
  }
})();