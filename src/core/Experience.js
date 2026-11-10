import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createLandscapes } from "./Landscapes.js";
import { AudioSystem } from "./AudioSystem.js";
export class Experience {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(
      42,
      innerWidth / innerHeight,
      0.1,
      250,
    );
    this.renderer = new T.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.scene.add(new T.HemisphereLight("#d7ebe7", "#9a8050", 2.1));
    const sun = new T.DirectionalLight("#fff0c9", 3.1);
    sun.position.set(-12, 24, 16);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, {
      left: -32,
      right: 32,
      top: 32,
      bottom: -32,
      near: 1,
      far: 100,
    });
    sun.shadow.bias = -0.001;
    sun.shadow.normalBias = 0.05;
    this.scene.add(sun);
    const { scenes, animated, descriptors } = createLandscapes();
    Object.assign(this, { scenes, animated, descriptors });
    scenes.forEach((g) => this.scene.add(g));
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enablePan = false;
    this.controls.enableDamping = false;
    this.controls.minDistance = 12;
    this.controls.maxDistance = 90;
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.minPolarAngle = 0.18;
    this.controls.addEventListener("change", () => this.render());
    this.audio = new AudioSystem();
    this.index = 0;
    this.time = 0;
    this.paused = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.raf = 0;
    this.last = 0;
    const skyGeo = new T.SphereGeometry(110, 32, 20);
    this.skyMat = new T.ShaderMaterial({
      side: T.BackSide,
      uniforms: {
        top: { value: new T.Color() },
        bottom: { value: new T.Color() },
      },
      vertexShader:
        "varying float h;void main(){h=position.y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader:
        "varying float h;uniform vec3 top;uniform vec3 bottom;void main(){gl_FragColor=vec4(mix(bottom,top,smoothstep(-3.,60.,h)),1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}",
    });
    this.scene.add(new T.Mesh(skyGeo, this.skyMat));
    document.querySelector("#view").onchange = (e) =>
      this.select(Number(e.target.value));
    document.querySelector("#reset").onclick = () => {
      this.controls.reset();
      this.reset();
      document.querySelector("#status").textContent = "View reset";
    };
    document.querySelector("#pause").onclick = () =>
      this.setPaused(!this.paused);
    document.querySelector("#sound").onclick = async () => {
      try {
        const on = await this.audio.toggle();
        const b = document.querySelector("#sound");
        b.textContent = on ? "Sound on" : "Sound off";
        b.setAttribute("aria-pressed", String(on));
        this.audio.updateVolumes(this.index);
      } catch (e) {
        document.querySelector("#status").textContent = e.message;
      }
    };
    const dialog = document.querySelector("#info");
    document.querySelector("#about").onclick = () => dialog.showModal();
    document.querySelector("#close-info").onclick = () => dialog.close();
    canvas.addEventListener("keydown", (e) => {
      const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
      if (!keys.includes(e.key)) return;
      e.preventDefault();
      const o = this.camera.position.clone().sub(this.controls.target),
        s = new T.Spherical().setFromVector3(o);
      s.theta +=
        e.key === "ArrowLeft" ? 0.09 : e.key === "ArrowRight" ? -0.09 : 0;
      s.phi = T.MathUtils.clamp(
        s.phi +
          (e.key === "ArrowUp" ? -0.06 : e.key === "ArrowDown" ? 0.06 : 0),
        0.18,
        Math.PI * 0.48,
      );
      this.camera.position
        .copy(this.controls.target)
        .add(new T.Vector3().setFromSpherical(s));
      this.controls.update();
      this.render();
    });
    window.addEventListener("resize", () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
      this.reset();
    });
    document.addEventListener("visibilitychange", () => {
      this.audio.sync();
      if (document.hidden) this.stop();
      else if (!this.paused) this.start();
    });
    this.audio.paused = this.paused;
    this.select(0);
    this.setPaused(this.paused);
    window.__world = {
      select: (i) => {
        document.querySelector("#view").value = i;
        this.select(i);
      },
      get state() {
        return {
          index: this.owner.index,
          paused: this.owner.paused,
          time: this.owner.time,
          camera: this.owner.camera.position.toArray(),
          target: this.owner.controls.target.toArray(),
          audio: this.owner.audio.context?.state || "not-created",
        };
      },
      owner: this,
    };
  }
  select(i) {
    this.renderer.shadowMap.needsUpdate = true;
    this.index = i;
    this.scenes.forEach((g, n) => (g.visible = n === i));
    const d = this.descriptors[i];
    document.querySelector("#scene-name").textContent = d[0];
    document.querySelector("#scene-note").textContent = d[1];
    const facts = [
      [
        "The harbour's blue fishing vessels and timber jetties belong to a working port, officially established in 1924. Migrant fishing communities shaped its identity.",
        "fishing-boat-harbour",
      ],
      [
        "Built in 1830-31 as a gaol, the Round House has twelve sides surrounding a central courtyard. It stands on Arthur Head above Bathers Beach, in Manjaree, an important Whadjuk meeting and trading place. Its history includes Aboriginal incarceration and dispossession.",
        "round-house-and-arthur-head-reserve",
      ],
      [
        "Built in 1897-98, the market hall opened in June 1898. Its red brick, pale stone trim and ironwork still frame a place for produce and local makers.",
        "fremantle-markets",
      ],
      [
        "Bathers Beach lies beside Arthur Head in Manjaree. The land and water have long been places of meeting, trading and connection for Whadjuk Noongar people. The sunset here is illustrative, not a forecast.",
        "round-house-and-arthur-head-reserve",
      ],
    ];
    document.querySelector("#fact-title").textContent = d[0];
    document.querySelector("#fact-copy").textContent = facts[i][0];
    document.querySelector("#fact-link").href =
      "https://www.wa.gov.au/government/document-collections/" + facts[i][1];
    this.skyMat.uniforms.top.value.set(d[2][0]);
    this.skyMat.uniforms.bottom.value.set(d[2][1]);
    this.scene.fog = new T.Fog(d[2][0], 70, 180);
    this.audio.updateVolumes(i);
    this.reset();
  }
  reset() {
    const d = this.descriptors[this.index];
    this.controls.target.fromArray(d[4]);
    const p = new T.Vector3().fromArray(d[3]);
    if (innerWidth < 600) {
      p.sub(this.controls.target)
        .multiplyScalar(
          this.index === 2
            ? innerWidth < 350
              ? 2.7
              : 2.2
            : this.index === 3
              ? 1.4
              : innerWidth < 350
                ? 1.85
                : 1.6,
        )
        .add(this.controls.target);
      this.controls.target.y += 1.2;
    }
    this.camera.position.copy(p);
    this.camera.lookAt(this.controls.target);
    this.controls.update();
    this.controls.saveState();
    this.render();
  }
  setPaused(p) {
    this.paused = p;
    this.audio.paused = p;
    this.audio.sync();
    const b = document.querySelector("#pause");
    b.textContent = p ? "Play" : "Pause";
    b.setAttribute("aria-pressed", String(p));
    p ? this.stop() : this.start();
    this.render();
  }
  stop() {
    clearTimeout(this.timer);
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.last = 0;
  }
  start() {
    if (this.raf) return;
    const frame = (now) => {
      this.raf = 0;
      if (this.paused || document.hidden) return;
      this.time += this.last ? Math.min((now - this.last) / 1000, 0.05) : 0;
      this.last = now;
      for (const a of this.animated) {
        if (!a.o.parent.visible) continue;
        if (a.type === "water") {
          a.o.position.x = Math.sin(this.time * 0.35 + a.j) * 0.28;
          a.o.position.z = Math.sin(this.time * 0.2 + a.j) * 0.18;
        } else if (a.type === "steam") {
          a.o.position.x =
            a.base.x + Math.sin(this.time * 0.45 + a.j) * (0.05 + a.j * 0.006);
          a.o.position.y =
            a.base.y + Math.sin(this.time * 0.9 + a.j * 0.3) * 0.11;
          a.o.material.opacity = 0.24 + 0.06 * Math.sin(this.time + a.j);
        } else
          a.o.position.x = a.base.x + Math.sin(this.time * 0.2 + a.j) * 0.4;
      }
      if (this.index === 0 || this.index === 3) this.render();
      this.timer = setTimeout(() => {
        this.raf = requestAnimationFrame(frame);
      }, 80);
    };
    this.raf = requestAnimationFrame(frame);
  }
  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
