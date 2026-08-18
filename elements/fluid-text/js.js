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
  // Grouped by concern so it's obvious where to tune things.

  const RENDERER = {
    MAX_PIXEL_RATIO: 2 // cap retina scaling so GPU doesn't die
  };

  const MASK = {
    // A temporary canvas used to measure the true ink bounding-box of the
    // glyph before we scale it up to fill the screen.
    PROBE_FONT_SIZE: 300, // px — big enough for accurate measurement
    PROBE_CANVAS_W: 2000, // px wide
    PROBE_CANVAS_H: 800, // px tall
    INK_BRIGHTNESS_THRESHOLD: 64, // 0-255; pixels above this count as "ink"
    MAX_HEIGHT_FRACTION: 0.98 // never let the glyph exceed this share of viewport height
  };

  const FONT_SCALE = {
    // The font-size slider maps [SLIDER_MIN .. SLIDER_MAX] → [tiny .. edge-to-edge]
    SLIDER_MIN: 10,
    SLIDER_MAX: 100,
    FULL_WIDTH: 100 // slider value that means "fill viewport width"
  };

  const INPUT = {
    DEFAULT_TEXT: "FLUID",
    REBUILD_DEBOUNCE_MS: 60 // wait this long after last keypress before re-rasterising
  };

  const RIPPLE = {
    SLOT_COUNT: 4, // number of simultaneous ripple origins
    DECAY_RATE: 1.1, // exponential decay per second
    RING_FREQUENCY: 7.0, // spatial frequency of the concentric rings  — must be float
    RING_SPEED_MUL: 9.0, // multiplied by uSpeed to get ring propagation rate — must be float
    DIST_FALLOFF: 2.2, // how fast rings fade with distance
    AMPLITUDE: 1.8 // peak height contribution
  };

  const MOUSE_SWELL = {
    DIST_FALLOFF: 2.5, // Gaussian-ish falloff around cursor
    FREQUENCY: 9.0, // spatial ring frequency — must be float
    SPEED_MUL: 5.0, // multiplied by uSpeed — must be float
    AMPLITUDE: 1.2
  };

  const CONTOUR = {
    LINE_WIDTH: 0.22, // half-width of each contour band in tri() space
    AA_BASE: 0.015, // minimum anti-alias blur radius
    AA_DENSITY_SCALE: 0.005, // grows AA slightly as density increases
    WAVE_SCALE: 0.5 // maps wave height → tri() input
  };

  const MASK_BLEND = {
    // smoothstep edges for the glyph mask — controls how crisply the
    // fluid is clipped to the letterforms
    EDGE_LO: 0.38,
    EDGE_HI: 0.62
  };

  // ── colour palette (mirrored into the shader as literals) ──
  // Defined here so JS and GLSL stay in sync when you tweak them.
  const PALETTE = {
    BG: [0.8, 1.0, 0.0], // chartreuse  (#c8ff00)
    FILL: [0.765, 0.518, 1.0] // soft lavender
  };

  // ── wave field ──────────────────────────────────────────
  // Each row defines one sinusoid in the height field h.
  // Schema: { amp, fx, fy, ts, phase }
  //   amp   — peak contribution to h
  //   fx/fy — spatial frequency along x / y (aspect-corrected coords)
  //   ts    — time speed multiplier; negative = wave travels in reverse
  //   phase — initial phase offset in radians (use Math.PI constants where meaningful)
  //
  // Tuning tips:
  //   • Vary ts signs and magnitudes for counter-rotating waves (less boring)
  //   • Keep sum-of-amps ≈ 4–5 so contour density feels consistent
  //   • Irrational-ratio ts values prevent visible periodicity
  const BASE_WAVES = [
    //  amp    fx      fy     ts      phase
    { amp: 1.0, fx: 2.4, fy: 0.9, ts: 1.15, phase: 0 },
    { amp: 0.82, fx: -1.3, fy: 2.6, ts: -0.87, phase: Math.PI / 2 }, // π/2
    { amp: 0.65, fx: 1.7, fy: -2.0, ts: 1.41, phase: Math.PI }, // π
    { amp: 0.7, fx: -2.8, fy: -1.2, ts: -0.66, phase: 0.8 },
    { amp: 0.5, fx: 0.9, fy: 3.1, ts: 1.05, phase: 2.3 },
    { amp: 0.38, fx: 3.2, fy: 0.7, ts: -1.23, phase: 4.7 },
    { amp: 0.3, fx: -1.0, fy: -2.4, ts: 1.56, phase: 5.5 },
    { amp: 0.28, fx: 2.1, fy: 1.7, ts: 0.54, phase: 1.1 }
  ];

  // High-frequency turbulence layers. These fold h back into themselves,
  // creating self-similar distortion. Schema: { amp, fx, fy, ts, hFold }
  //   hFold — how strongly the current h value warps the wave's own phase
  const TURB_WAVES = [
    //  amp    fx      fy     ts    hFold
    { amp: 0.35, fx: 5.6, fy: 4.4, ts: 1.1, hFold: 0.8 },
    { amp: 0.18, fx: 8.3, fy: -7.0, ts: -0.9, hFold: 1.3 },
    { amp: 0.1, fx: 12.0, fy: 9.5, ts: 1.6, hFold: 1.8 }
  ];

  // ── GLSL code-generation helpers ────────────────────────
  // Defined here (outer scope) so they can be used both in the shader
  // template and in any future debug tooling.

  // GLSL ES 3.00 won't coerce integer literals to float in const declarations.
  // This ensures every number we interpolate into shader source has a decimal.
  const glslFloat = (n) => (Number.isInteger(n) ? n.toFixed(1) : String(n));

  // Emit one base-wave line:  h += amp * sin(fx*p.x + fy*p.y + t*ts [+ phase]);
  const f4 = (n) => n.toFixed(4); // 4 dp keeps GLSL readable without excess precision
  function baseWaveGLSL(w) {
    const phase = w.phase !== 0 ? ` + ${f4(w.phase)}` : "";
    return `        h += ${f4(w.amp)} * sin(${f4(w.fx)}*p.x + ${f4(
      w.fy
    )}*p.y + t*${f4(w.ts)}${phase});`;
  }

  // Emit one turbulence line:  h += uTurb * amp * sin(fx*p.x + fy*p.y + t*ts + h*hFold);
  function turbWaveGLSL(w) {
    return `          h += uTurb * ${f4(w.amp)} * sin(${f4(w.fx)}*p.x + ${f4(
      w.fy
    )}*p.y + t*${f4(w.ts)} + h*${f4(w.hFold)});`;
  }

  // ── wait for web fonts before first render ──────────────
  document.fonts.ready.then(init);

  function init() {
    // ── renderer ──────────────────────────────────────────
    const renderer = new WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(
      Math.min(devicePixelRatio, RENDERER.MAX_PIXEL_RATIO)
    );
    renderer.setSize(innerWidth, innerHeight);
    renderer.domElement.id = "three";
    document.body.prepend(renderer.domElement);

    const scene = new Scene();
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // ── glyph mask texture ────────────────────────────────
    // White-on-black canvas rasterisation of the current text, uploaded
    // to the GPU so the fragment shader can clip the fluid to letterforms.
    const maskCanvas = document.createElement("canvas");
    const maskCtx = maskCanvas.getContext("2d");
    let maskTex = null;

    function buildMask(text) {
      const W = innerWidth;
      const H = innerHeight;
      maskCanvas.width = W;
      maskCanvas.height = H;

      // Clear to black, then paint glyphs in white
      maskCtx.fillStyle = "#000";
      maskCtx.fillRect(0, 0, W, H);

      const str = (text || "").toUpperCase() || INPUT.DEFAULT_TEXT;

      // ── Step 1: measure true ink bounds at a known probe size ──
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

      // Pixel-scan for first/last ink column and row
      const pd = pc.getImageData(0, 0, MASK.PROBE_CANVAS_W, MASK.PROBE_CANVAS_H)
        .data;
      let minX = MASK.PROBE_CANVAS_W,
        maxX = 0;
      let minY = MASK.PROBE_CANVAS_H,
        maxY = 0;

      for (let y = 0; y < MASK.PROBE_CANVAS_H; y++) {
        for (let x = 0; x < MASK.PROBE_CANVAS_W; x++) {
          if (
            pd[(y * MASK.PROBE_CANVAS_W + x) * 4] >
            MASK.INK_BRIGHTNESS_THRESHOLD
          ) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      const inkW = Math.max(1, maxX - minX);
      const inkH = Math.max(1, maxY - minY); // eslint-disable-line no-unused-vars

      // ── Step 2: compute final font size ───────────────────
      // Font size that would make ink exactly as wide as the viewport
      const fullWidthFontSize = MASK.PROBE_FONT_SIZE * (W / inkW);

      // User slider: FONT_SCALE.FULL_WIDTH = edge-to-edge, FONT_SCALE.SLIDER_MIN = tiny
      const userScaleFraction =
        +document.getElementById("sl-f").value / FONT_SCALE.FULL_WIDTH;
      const finalFontSize = Math.min(
        fullWidthFontSize * userScaleFraction,
        H * MASK.MAX_HEIGHT_FRACTION
      );

      // ── Step 3: draw at final size, correcting for EM vs ink vertical centre ──
      maskCtx.fillStyle = "#fff";
      maskCtx.font = `900 ${finalFontSize}px Unbounded, "Arial Black", sans-serif`;
      maskCtx.textAlign = "center";
      maskCtx.textBaseline = "middle";

      const probeInkCentreY = (minY + maxY) / 2;
      const probeCanvaCentreY = MASK.PROBE_CANVAS_H / 2;
      const inkCentreOffset =
        (probeInkCentreY - probeCanvaCentreY) *
        (finalFontSize / MASK.PROBE_FONT_SIZE);
      maskCtx.fillText(str, W / 2, H / 2 - inkCentreOffset);

      // Upload (or update) the GPU texture
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
          innerWidth * renderer.getPixelRatio(),
          innerHeight * renderer.getPixelRatio()
        )
      },
      uMouse: { value: new Vector2(0.5, 0.5) },
      uDensity: { value: 9.0 },
      uSpeed: { value: 0.28 },
      uTurb: { value: 0.45 },
      uMask: { value: maskTex },
      // Ripple slots: xy = normalised origin, z = birth time (-1 = inactive), w = unused
      uR0: { value: new Vector4(0, 0, -1, 0) },
      uR1: { value: new Vector4(0, 0, -1, 0) },
      uR2: { value: new Vector4(0, 0, -1, 0) },
      uR3: { value: new Vector4(0, 0, -1, 0) }
    };

    // ── fragment shader ───────────────────────────────────
    // Constants at the top mirror the JS PALETTE / RIPPLE / etc. objects.
    // Wave coefficients (freq_x, freq_y, amplitude, time_speed, phase) are
    // left inline because they are artistic tuning values, not structural magic.
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
 
      // ── palette ────────────────────────────────────────
      const vec3 COLOR_BG   = vec3(${PALETTE.BG.map((v) => v.toFixed(3)).join(
        ", "
      )});
      const vec3 COLOR_FILL = vec3(${PALETTE.FILL.map((v) => v.toFixed(3)).join(
        ", "
      )});
 
      // ── mask clip ──────────────────────────────────────
      const float MASK_EDGE_LO = ${glslFloat(MASK_BLEND.EDGE_LO)};
      const float MASK_EDGE_HI = ${glslFloat(MASK_BLEND.EDGE_HI)};
 
      // ── ripple physics ─────────────────────────────────
      const float RIPPLE_DECAY_RATE   = ${glslFloat(RIPPLE.DECAY_RATE)};
      const float RIPPLE_RING_FREQ    = ${glslFloat(RIPPLE.RING_FREQUENCY)};
      const float RIPPLE_RING_SPEED   = ${glslFloat(RIPPLE.RING_SPEED_MUL)};
      const float RIPPLE_DIST_FALLOFF = ${glslFloat(RIPPLE.DIST_FALLOFF)};
      const float RIPPLE_AMPLITUDE    = ${glslFloat(RIPPLE.AMPLITUDE)};
 
      // ── mouse swell ────────────────────────────────────
      const float SWELL_DIST_FALLOFF = ${glslFloat(MOUSE_SWELL.DIST_FALLOFF)};
      const float SWELL_FREQUENCY    = ${glslFloat(MOUSE_SWELL.FREQUENCY)};
      const float SWELL_SPEED_MUL    = ${glslFloat(MOUSE_SWELL.SPEED_MUL)};
      const float SWELL_AMPLITUDE    = ${glslFloat(MOUSE_SWELL.AMPLITUDE)};
 
      // ── contour lines ──────────────────────────────────
      const float CONTOUR_LINE_WIDTH   = ${glslFloat(CONTOUR.LINE_WIDTH)};
      const float CONTOUR_AA_BASE      = ${glslFloat(CONTOUR.AA_BASE)};
      const float CONTOUR_AA_DENSITY   = ${glslFloat(CONTOUR.AA_DENSITY_SCALE)};
      const float CONTOUR_WAVE_SCALE   = ${glslFloat(CONTOUR.WAVE_SCALE)};
 
 
      // Triangle wave — maps any float to [0,1], used for contour bands
      float tri(float x) {
        return abs(fract(x + 0.5) - 0.5) * 2.0;
      }
 
      // Returns the height contribution of one click-ripple.
      // r.z < 0 means the slot is empty.
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
        vec2  p  = vec2(uv.x * ar, uv.y);   // aspect-corrected position
        float t  = uTime * uSpeed;
 
        // ── glyph clip mask ──────────────────────────────
        // Texture is y-flipped relative to gl_FragCoord, which is fine —
        // uv already matches because both start at bottom-left.
        float insideMask = texture2D(uMask, uv).r;
        float mask       = smoothstep(MASK_EDGE_LO, MASK_EDGE_HI, insideMask);
 
        // Early-out: pixels fully outside the letterforms are solid background.
        // This keeps the outer area clean and saves fragment work.
        if (mask < 0.001) {
          gl_FragColor = vec4(COLOR_BG, 1.0);
          return;
        }
 
        // ── wave field (8 base sinusoids + optional turbulence) ──
        // Generated from BASE_WAVES / TURB_WAVES in the JS constants section.
        // Schema per wave: amp * sin( fx*p.x + fy*p.y + t*ts + phase )
        float h = 0.0;
${BASE_WAVES.map(baseWaveGLSL).join("\n")}
 
        // High-frequency turbulence (self-referential: current h folds back into phase)
        if (uTurb > 0.0) {
${TURB_WAVES.map(turbWaveGLSL).join("\n")}
        }
 
        // ── mouse proximity swell ────────────────────────
        vec2  swellDelta = (uv - uMouse) * vec2(ar, 1.0);
        float swellDist  = length(swellDelta);
        h += SWELL_AMPLITUDE
           * exp(-swellDist * SWELL_DIST_FALLOFF)
           * sin(swellDist * SWELL_FREQUENCY - t * SWELL_SPEED_MUL);
 
        // ── click ripples ────────────────────────────────
        h += ripple(uR0, uv, uTime);
        h += ripple(uR1, uv, uTime);
        h += ripple(uR2, uv, uTime);
        h += ripple(uR3, uv, uTime);
 
        // ── contour rendering ────────────────────────────
        float bands     = tri(h * uDensity * CONTOUR_WAVE_SCALE);
        float aaRadius  = CONTOUR_AA_BASE + CONTOUR_AA_DENSITY * uDensity;
        float isOnLine  = 1.0 - smoothstep(CONTOUR_LINE_WIDTH - aaRadius,
                                           CONTOUR_LINE_WIDTH + aaRadius, bands);
        vec3  fluidColor = mix(COLOR_FILL, COLOR_BG, isOnLine);
 
        // Blend fluid inside glyphs / background outside
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
    window.addEventListener("resize", () => {
      renderer.setSize(innerWidth, innerHeight);
      const pr = renderer.getPixelRatio();
      uniforms.uRes.value.set(innerWidth * pr, innerHeight * pr);
      buildMask(
        document.getElementById("text-field").value || INPUT.DEFAULT_TEXT
      );
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

    window.addEventListener("mousemove", (e) => {
      cursorEl.style.left = e.clientX + "px";
      cursorEl.style.top = e.clientY + "px";
      uniforms.uMouse.value.set(
        e.clientX / innerWidth,
        1 - e.clientY / innerHeight
      );
    });
    window.addEventListener("mousedown", () => cursorEl.classList.add("big"));
    window.addEventListener("mouseup", () => cursorEl.classList.remove("big"));

    // ── click ripples ─────────────────────────────────────
    const rippleSlots = [
      uniforms.uR0,
      uniforms.uR1,
      uniforms.uR2,
      uniforms.uR3
    ];
    let rippleIndex = 0;

    window.addEventListener("click", (e) => {
      if (e.target.closest("#type-input")) return;
      rippleSlots[rippleIndex % RIPPLE.SLOT_COUNT].value.set(
        e.clientX / innerWidth,
        1 - e.clientY / innerHeight,
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
      // Slider is 0-100; shader expects 0-1
      uniforms.uSpeed.value = +e.target.value / 100;
    });
    document.getElementById("sl-t").addEventListener("input", (e) => {
      // Slider is 0-100; shader expects 0-1
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
      const dt =
        lastTimestamp === null
          ? 0
          : Math.min((timestamp - lastTimestamp) / 1000, 0.05);
      lastTimestamp = timestamp;
      if (!paused) elapsed += dt;
      uniforms.uTime.value = elapsed;
      renderer.render(scene, camera);
    })(0);
  }
})();
