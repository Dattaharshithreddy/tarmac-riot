/* ---------- post-processing: HDR scene -> bloom -> grade (three.js, no add-ons) ----------
   The scene renders into a multisampled half-float target (linear light). A dual-filter blur builds
   the bloom from bright pixels at quarter resolution, then one composite pass applies ACES tone
   mapping, per-track colour grading, vignette, heat haze, nitro speed blur and the sRGB conversion. */
const GRADES = {
  // gain tints the highlights, lift the shadows; thr is the HDR level where bloom starts
  sealink: { exp: 1.0,  sat: 1.1,  con: 1.08, lift: [0.01, 0.0, 0.03],  gain: [1.03, 0.99, 0.95], bloom: 0.42, thr: 1.35, vig: 0.38, haze: 0 },
  ladakh:  { exp: 0.98, sat: 1.1,  con: 1.1,  lift: [0.0, 0.005, 0.02], gain: [0.98, 1.0, 1.04],  bloom: 0.3,  thr: 1.6,  vig: 0.3,  haze: 0 },
  thar:    { exp: 0.86, sat: 1.1,  con: 1.12, lift: [0.01, 0.0, 0.0],   gain: [1.03, 1.0, 0.94],  bloom: 0.3,  thr: 1.7,  vig: 0.34, haze: 1 },
  kerala:  { exp: 1.04, sat: 0.95, con: 1.06, lift: [0.0, 0.01, 0.015], gain: [0.97, 1.0, 1.01],  bloom: 0.5,  thr: 1.1,  vig: 0.42, haze: 0 },
};

function createPostFX(gl, W, H, trackId) {
  const T3 = THREE, caps = gl.capabilities, ext = gl.extensions;
  const half = caps.isWebGL2 && (ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float'));
  const type = half ? T3.HalfFloatType : T3.UnsignedByteType;
  const opts = { type: type, minFilter: T3.LinearFilter, magFilter: T3.LinearFilter, depthBuffer: false, stencilBuffer: false };
  const sceneRT = new T3.WebGLRenderTarget(W, H, { type: type, depthBuffer: true, stencilBuffer: false, samples: caps.isWebGL2 ? 4 : 0 });
  const levels = [];
  let w = W, h = H;
  for (let i = 0; i < 4; i++) { w = Math.max(2, w >> 1); h = Math.max(2, h >> 1); levels.push(new T3.WebGLRenderTarget(w, h, opts)); }
  const ups = levels.slice(0, 3).map((l) => new T3.WebGLRenderTarget(l.width, l.height, opts));
  const g = GRADES[trackId] || GRADES.sealink;

  const quadCam = new T3.OrthographicCamera(-1, 1, 1, -1, 0, 1), quadScene = new T3.Scene();
  const quad = new T3.Mesh(new T3.PlaneGeometry(2, 2), null); quad.frustumCulled = false; quadScene.add(quad);
  const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const mk = (fs, uniforms) => new T3.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms: uniforms, depthTest: false, depthWrite: false });

  // bright pass + first downsample (13-tap box keeps fireflies down)
  const bright = mk(`uniform sampler2D tSrc; uniform vec2 texel; uniform float thr; varying vec2 vUv;
    vec3 s(vec2 o){ return texture2D(tSrc, vUv + o * texel).rgb; }
    void main(){
      vec3 c = s(vec2(0.0)) * 0.25 + (s(vec2(-1.0,-1.0)) + s(vec2(1.0,-1.0)) + s(vec2(-1.0,1.0)) + s(vec2(1.0,1.0))) * 0.125
             + (s(vec2(-2.0,0.0)) + s(vec2(2.0,0.0)) + s(vec2(0.0,-2.0)) + s(vec2(0.0,2.0))) * 0.0625;
      float l = max(c.r, max(c.g, c.b));
      float k = max(l - thr, 0.0); k = k * k / (k + 0.25 + 1e-4);
      gl_FragColor = vec4(c * (k / max(l, 1e-4)), 1.0);
    }`, { tSrc: { value: null }, texel: { value: new T3.Vector2() }, thr: { value: g.thr } });
  // dual-filter (Kawase) down and up
  const down = mk(`uniform sampler2D tSrc; uniform vec2 texel; varying vec2 vUv;
    void main(){ vec2 o = texel * 0.5;
      vec3 c = texture2D(tSrc, vUv).rgb * 4.0 + texture2D(tSrc, vUv - o).rgb + texture2D(tSrc, vUv + o).rgb
             + texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb + texture2D(tSrc, vUv - vec2(o.x, -o.y)).rgb;
      gl_FragColor = vec4(c / 8.0, 1.0); }`, { tSrc: { value: null }, texel: { value: new T3.Vector2() } });
  const up = mk(`uniform sampler2D tSrc; uniform sampler2D tAdd; uniform vec2 texel; varying vec2 vUv;
    void main(){ vec2 o = texel * 0.5;
      vec3 c = texture2D(tSrc, vUv + vec2(-o.x * 2.0, 0.0)).rgb + texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb * 2.0
             + texture2D(tSrc, vUv + vec2(0.0, o.y * 2.0)).rgb + texture2D(tSrc, vUv + vec2(o.x, o.y)).rgb * 2.0
             + texture2D(tSrc, vUv + vec2(o.x * 2.0, 0.0)).rgb + texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb * 2.0
             + texture2D(tSrc, vUv + vec2(0.0, -o.y * 2.0)).rgb + texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb * 2.0;
      gl_FragColor = vec4(c / 12.0 + texture2D(tAdd, vUv).rgb, 1.0); }`, { tSrc: { value: null }, tAdd: { value: null }, texel: { value: new T3.Vector2() } });
  const comp = mk(`uniform sampler2D tScene; uniform sampler2D tBloom; uniform float exposure, bloom, sat, con, vig, haze, speed, time, flash, hdr;
    uniform vec3 lift, gain; uniform vec2 res; varying vec2 vUv;
    vec3 rrt(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
    vec3 aces(vec3 c){   // same curve as three.js ACESFilmicToneMapping
      const mat3 I = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
      const mat3 O = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
      return clamp(O * rrt(I * (c / 0.6)), 0.0, 1.0); }
    vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      // desert heat shimmer, strongest just below the horizon band
      if (haze > 0.0) { float band = smoothstep(0.38, 0.5, uv.y) * (1.0 - smoothstep(0.5, 0.58, uv.y));
        uv.x += sin(uv.y * 220.0 + time * 7.0) * 0.0016 * band * haze; uv.y += cos(uv.x * 180.0 + time * 5.0) * 0.001 * band * haze; }
      vec3 c;
      if (speed > 0.01) {   // radial blur and a touch of chromatic split when the nitro kicks in
        vec2 d = (uv - vec2(0.5, 0.45)) * speed * 0.026; c = vec3(0.0);
        for (int i = 0; i < 6; i++) { float t = float(i) / 5.0; c += texture2D(tScene, uv - d * t).rgb; }
        c /= 6.0; c.r = mix(c.r, texture2D(tScene, uv + d * 0.6).r, 0.5); c.b = mix(c.b, texture2D(tScene, uv - d * 0.6).b, 0.5);
      } else c = texture2D(tScene, uv).rgb;
      c += texture2D(tBloom, uv).rgb * bloom;
      c = hdr > 0.5 ? aces(c * exposure) : c;
      c = c * gain + lift * (1.0 - c);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, sat);
      c = (c - 0.5) * con + 0.5;
      vec2 q = vUv - 0.5; q.x *= res.x / res.y * 0.75;
      c *= 1.0 - vig * smoothstep(0.35, 1.0, length(q) * 1.25);
      c += flash * vec3(1.0, 0.95, 0.85);
      c = clamp(c, 0.0, 1.0);
      c = toSRGB(c) + (hash(vUv * res + time) - 0.5) / 255.0 * 1.5;   // dither against banding in the sky
      gl_FragColor = vec4(c, 1.0);
    }`, {
    tScene: { value: sceneRT.texture }, tBloom: { value: null }, exposure: { value: g.exp * 1.05 }, bloom: { value: g.bloom }, sat: { value: g.sat }, con: { value: g.con },
    vig: { value: g.vig }, haze: { value: g.haze }, speed: { value: 0 }, time: { value: 0 }, flash: { value: 0 }, hdr: { value: 1 },
    lift: { value: new T3.Vector3().fromArray(g.lift) }, gain: { value: new T3.Vector3().fromArray(g.gain) }, res: { value: new T3.Vector2(W, H) },
  });
  const pass = (m, target) => { quad.material = m; gl.setRenderTarget(target); gl.render(quadScene, quadCam); };

  return {
    enabled: true, grade: g, comp: comp,
    resize(w2, h2) { sceneRT.setSize(w2, h2); let a = w2, b = h2; for (let i = 0; i < levels.length; i++) { a = Math.max(2, a >> 1); b = Math.max(2, b >> 1); levels[i].setSize(a, b); if (ups[i]) ups[i].setSize(a, b); } comp.uniforms.res.value.set(w2, h2); },
    render(scene, camera, fx) {
      fx = fx || {};
      const tm = gl.toneMapping, enc = gl.outputEncoding;
      gl.setRenderTarget(sceneRT); gl.clear(); gl.render(scene, camera);
      // bloom chain
      bright.uniforms.tSrc.value = sceneRT.texture; bright.uniforms.texel.value.set(1 / sceneRT.width, 1 / sceneRT.height); pass(bright, levels[0]);
      for (let i = 1; i < levels.length; i++) { down.uniforms.tSrc.value = levels[i - 1].texture; down.uniforms.texel.value.set(1 / levels[i - 1].width, 1 / levels[i - 1].height); pass(down, levels[i]); }
      let src = levels[levels.length - 1];
      for (let i = levels.length - 2; i >= 0; i--) {
        up.uniforms.tSrc.value = src.texture; up.uniforms.tAdd.value = levels[i].texture; up.uniforms.texel.value.set(1 / src.width, 1 / src.height); pass(up, ups[i]); src = ups[i];
      }
      const u = comp.uniforms;
      u.tBloom.value = src.texture; u.time.value = fx.time || 0; u.speed.value = fx.speed || 0; u.flash.value = fx.flash || 0;
      u.bloom.value = g.bloom * (fx.bloomMul || 1);
      gl.toneMapping = T3.NoToneMapping; gl.outputEncoding = T3.LinearEncoding;
      pass(comp, null);
      gl.toneMapping = tm; gl.outputEncoding = enc;
    },
    dispose() { sceneRT.dispose(); levels.concat(ups).forEach((t) => t.dispose()); [bright, down, up, comp].forEach((m) => m.dispose()); quad.geometry.dispose(); },
  };
}
