import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
const mats = new Map();
const mat = (c) => {
  if (!mats.has(c))
    mats.set(c, new T.MeshStandardMaterial({ color: c, roughness: 0.83 }));
  return mats.get(c);
};
let seed = 19;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
function mesh(g, geo, c, x = 0, y = 0, z = 0) {
  let m = new T.Mesh(geo, mat(c));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return m;
}
const box = (g, x, y, z, w, h, d, c) =>
  mesh(g, new T.BoxGeometry(w, h, d), c, x, y, z);
const cyl = (g, x, y, z, r, h, c, n = 12) =>
  mesh(g, new T.CylinderGeometry(r, r, h, n), c, x, y, z);
function line(g, a, b, r, c) {
  let av = new T.Vector3(...a),
    bv = new T.Vector3(...b),
    d = bv.clone().sub(av),
    m = mesh(g, new T.CylinderGeometry(r, r, d.length(), 6), c);
  m.position.copy(av.add(bv).multiplyScalar(0.5));
  m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
  return m;
}
function label(g, text, x, y, z, w = 8, color = "#f4e4c7", bg = "#183137") {
  let c = document.createElement("canvas");
  c.width = 1024;
  c.height = 160;
  let a = c.getContext("2d");
  a.fillStyle = bg;
  a.fillRect(0, 0, 1024, 160);
  a.fillStyle = color;
  a.textAlign = "center";
  a.textBaseline = "middle";
  a.font = "bold 72px Georgia";
  a.fillText(text, 512, 82, 980);
  let t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  let m = new T.Mesh(
    new T.PlaneGeometry(w, (w * 160) / 1024),
    new T.MeshStandardMaterial({ map: t, roughness: 1 }),
  );
  m.position.set(x, y, z);
  g.add(m);
  return m;
}
function ground(g, c = "#d7c5a5") {
  box(g, 0, -0.5, 0, 110, 1, 110, c);
}
function sea(g, c = "#397c86") {
  let m = box(g, 0, -0.24, 0, 170, 0.18, 170, c);
  m.material = mat(c);
  let ripples = new T.Group();
  ripples.userData.water = true;
  g.add(ripples);
  for (let i = 0; i < 130; i++) {
    let x = (rnd() - 0.5) * 110,
      z = (rnd() - 0.5) * 110;
    box(ripples, x, -0.13, z, 0.3 + rnd() * 3, 0.012, 0.018, "#93b4b0");
  }
  return m;
}
function jetty(g, x, z, l = 27) {
  for (let i = 0; i < Math.ceil(l / 0.45); i++)
    box(
      g,
      x,
      0.18,
      z + i * 0.45,
      3.2,
      0.3,
      0.41,
      i % 3 ? "#9b7857" : "#b8946a",
    );
  for (let i = 0; i < l; i += 3) {
    for (let side of [-1, 1]) {
      cyl(g, x + side * 1.45, 0.12, z + i, 0.16, 2.5, "#624d3c");
      cyl(g, x + side * 1.45, 0.91, z + i, 0.24, 0.12, "#453c34");
    }
  }
}
function boat(g, x, z, scale = 1, rot = 0) {
  let b = new T.Group();
  b.position.set(x, 0, z);
  b.rotation.y = Math.PI + rot;
  b.scale.setScalar(scale);
  g.add(b);
  // Bow flares above a keel, with a continuous tapered stern-to-bow hull.
  let sh = new T.Shape();
  sh.moveTo(-2, -5.5);
  sh.lineTo(2, -5.5);
  sh.bezierCurveTo(2.8, -2, 2.4, 3, 0, 6);
  sh.bezierCurveTo(-2.4, 3, -2.8, -2, -2, -5.5);
  let h = new T.ExtrudeGeometry(sh, {
    depth: 1.55,
    bevelEnabled: true,
    bevelSize: 0.25,
    bevelThickness: 0.22,
    bevelSegments: 2,
    steps: 1,
  });
  h.rotateX(-Math.PI / 2);
  mesh(b, h, "#16798e", 0, 0.05, 0);
  let deck = mesh(b, new T.ShapeGeometry(sh), "#c6baa0", 0, 1.69, 0);
  deck.rotation.x = -Math.PI / 2;
  box(b, 0, 2.75, -1.1, 3.4, 2.1, 3.4, "#e3dfca");
  box(b, 0, 3.91, -1.1, 3.9, 0.22, 3.9, "#f3e7ca");
  for (let k of [-1, 0, 1])
    box(b, k * 0.95, 3.05, 0.62, 0.73, 0.75, 0.04, "#1d414e");
  for (let side of [-1, 1])
    for (let k = 0; k < 3; k++)
      box(b, side * 1.72, 3.04, -2.15 + k * 0.98, 0.03, 0.75, 0.72, "#234851");
  for (let zz of [-4.8, 1.7, 3.7])
    for (let side of [-1, 1]) {
      cyl(b, side * 1.95, 1.5, zz, 0.12, 0.8, "#f1e6c5");
      line(b, [side * 1.95, 1.9, zz], [side * 1.4, 2.0, 4.6], 0.035, "#ddd8c6");
    }
  line(b, [0, 3.9, -1.2], [0, 8.4, -1.2], 0.08, "#dbb060");
  line(b, [-2, 5, -2.8], [2, 5, -2.8], 0.095, "#bf8b39");
  line(b, [-1.8, 2.2, -4.2], [0, 7, -2], 0.06, "#c69845");
  line(b, [1.8, 2.2, -4.2], [0, 7, -2], 0.06, "#c69845");
  line(b, [-2, 5, -2.8], [-1, 6.3, 2.7], 0.07, "#c69845");
  line(b, [2, 5, -2.8], [1, 6.3, 2.7], 0.07, "#c69845");
  for (let xx of [-1, 1])
    line(b, [xx, 6.3, 2.7], [xx, 2.1, 2.7], 0.025, "#303f3d");
  for (let i = 0; i < 4; i++) {
    let t = mesh(
      b,
      new T.TorusGeometry(0.43, 0.13, 5, 12),
      "#283538",
      -2.2,
      1.2,
      -3 + i * 1.65,
    );
    t.rotation.y = Math.PI / 2;
  }
  for (let i = 0; i < 3; i++) {
    box(b, 0.2, 1.95, 2.1 + i * 0.8, 1.8, 0.5, 0.65, "#927c52");
    for (let j = 0; j < 5; j++)
      box(
        b,
        -0.55 + j * 0.35,
        2.23,
        2.1 + i * 0.8,
        0.025,
        0.03,
        0.65,
        "#534c3d",
      );
  }
  return b;
}
function harbour() {
  let g = new T.Group();
  sea(g);
  box(g, 0, -0.35, -19, 80, 0.7, 8, "#a89c83");
  for (let i = 0; i < 20; i++)
    box(g, -40 + i * 4, 0.08, -15.3, 3.8, 0.55, 1.8, "#c1b69e");
  jetty(g, 2, -13, 28);
  jetty(g, -14, -13, 16);
  boat(g, -3, 0, 1.1, 0.04);
  boat(g, 8, -5, 0.86, -0.03);
  boat(g, -9, -7, 0.7, 0.1);
  boat(g, 14, -10, 0.7, -0.12);
  for (let x = -32; x < 33; x += 9) {
    box(g, x, 2, -23, 8, 4, 8, "#d4c3a0");
    let roof = new T.Shape();
    roof.moveTo(-4.4, 0);
    roof.lineTo(0, 2.5);
    roof.lineTo(4.4, 0);
    roof.closePath();
    mesh(
      g,
      new T.ExtrudeGeometry(roof, { depth: 8.8, bevelEnabled: false }),
      "#776958",
      x,
      4,
      -27.4,
    );
    for (let j = 0; j < 4; j++)
      box(g, x - 2.7 + j * 1.8, 2.4, -18.95, 1.1, 1.6, 0.05, "#374d4d");
  }
  for (let x of [-18, 20]) {
    line(g, [x, 0, -14], [x, 10, -14], 0.09, "#72736c");
    line(g, [x, 10, -14], [x + 2, 10.2, -14], 0.06, "#72736c");
  }
  return g;
}
function arch(g, x, y, z, w, h, c, depth = 0.4) {
  const sh = new T.Shape();
  sh.moveTo(-w / 2, 0);
  sh.lineTo(-w / 2, h - w / 2);
  sh.absarc(0, h - w / 2, w / 2, Math.PI, 0, true);
  sh.lineTo(w / 2, 0);
  sh.closePath();
  let a = mesh(
    g,
    new T.ExtrudeGeometry(sh, { depth, bevelEnabled: false }),
    c,
    x,
    y,
    z,
  );
  return a;
}
function roundhouse() {
  let g = new T.Group();
  sea(g, "#4d8587");
  let geo = new T.PlaneGeometry(43, 38, 40, 40);
  geo.rotateX(-Math.PI / 2);
  let pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i),
      z = pos.getZ(i);
    let edge = Math.max(0, 1 - Math.pow(x / 23, 4) - Math.pow(z / 21, 4));
    let y = Math.min(3, Math.max(-0.4, (20 - Math.hypot(x, z)) * 0.65));
    if (z > 8) y = Math.min(y, Math.max(-0.4, 3 - (z - 8) * 0.34));
    pos.setY(i, y);
  }
  geo.computeVertexNormals();
  mesh(g, geo, "#b6a280");
  for (let i = 0; i < 120; i++) {
    let a = rnd() * Math.PI * 2,
      r = 15 + rnd() * 5;
    let q = mesh(
      g,
      new T.DodecahedronGeometry(0.3 + rnd() * 0.8, 0),
      "#b6a789",
      Math.cos(a) * r,
      rnd() * 1.6,
      Math.sin(a) * r,
    );
    q.scale.y = 0.6;
  }
  let b = new T.Group();
  b.position.y = 3;
  g.add(b);
  let R = 7.3,
    H = 4.5;
  // Twelve separate masonry faces leave a real open courtyard and a doorway on the near face.
  for (let k = 0; k < 12; k++) {
    let a = (k * Math.PI) / 6;
    let face = new T.Group();
    face.position.set(Math.sin(a) * R, 0, Math.cos(a) * R);
    face.rotation.y = a;
    let fw = 2 * R * Math.tan(Math.PI / 12);
    for (let row = 0; row < 10; row++)
      for (let col = 0; col < 6; col++) {
        let xx = ((col - 2.5) * fw) / 6 + (row % 2 ? 0.16 : 0);
        if (k === 0 && Math.abs(xx) < 0.86 && row < 7) continue;
        box(
          face,
          xx,
          0.23 + row * 0.445,
          0,
          fw / 6 - 0.045,
          0.408,
          0.64,
          ["#c6b99c", "#b4a88d", "#d3c9af", "#a99d82"][Math.floor(rnd() * 4)],
        );
      }
    box(face, 0, 4.58, 0, fw + 0.16, 0.26, 0.93, "#a99b7d");
    b.add(face);
  }
  box(b, -1.1, 1.53, 7.38, 0.21, 3.1, 0.77, "#e2d5b9");
  box(b, 1.1, 1.53, 7.38, 0.21, 3.1, 0.77, "#e2d5b9");
  box(b, 0, 3.12, 7.38, 2.4, 0.25, 0.8, "#e2d5b9");
  box(b, 0, 3.65, 7.75, 1.05, 0.42, 0.035, "#353a33");
  label(b, "ROUND HOUSE", 0, 3.66, 7.78, 0.9);
  box(b, 0, 4.95, 7.3, 2.2, 0.65, 0.8, "#c0b394");
  line(b, [0, 4.9, 7.3], [0, 10.8, 7.3], 0.045, "#b9b9a5");
  for (let i = 0; i < 15; i++)
    box(g, 0, 0.16 + i * 0.2, 18.7 - i * 0.65, 4, 0.22, 0.65, "#c5b79b");
  for (let side of [-1, 1]) {
    line(g, [side * 2, 1, 18.8], [side * 2, 3.9, 9.5], 0.075, "#706d5e");
    for (let z = 10; z < 20; z += 2)
      line(
        g,
        [side * 2, 0.2 + (19 - z) * 0.2, z],
        [side * 2, 1.1 + (19 - z) * 0.2, z],
        0.045,
        "#706d5e",
      );
  }
  // Small planted coastal ground rather than a generic tropical island.
  for (let i = 0; i < 40; i++) {
    let a = rnd() * Math.PI * 2,
      r = 11 + rnd() * 7;
    if (Math.abs(Math.sin(a)) < 0.25 && Math.cos(a) > 0.3) continue;
    let q = mesh(
      g,
      new T.IcosahedronGeometry(0.4 + rnd() * 0.7),
      "#75806b",
      Math.sin(a) * r,
      2,
      Math.cos(a) * r,
    );
    q.scale.y = 0.45;
  }
  return g;
}
function market() {
  let g = new T.Group();
  ground(g, "#bca88c");
  for (let i = 0; i < 35; i++)
    for (let j = 0; j < 12; j++)
      box(
        g,
        -23 + i * 1.35,
        0.025,
        2 + j * 1.3,
        1.3,
        0.04,
        1.23,
        (i + j) % 3 ? "#b9ab96" : "#c4b7a3",
      );
  let facade = new T.Group();
  g.add(facade);
  box(facade, 0, 4.1, -5, 29, 8.2, 1, "#914b37");
  box(facade, 0, 3, -10, 29, 6, 10, "#8f503e");
  // Mortar joints and alternating brick courses wrap the front and side returns.
  for (let y = 0.25; y < 8.3; y += 0.42) {
    box(facade, 0, y, -4.47, 29, 0.035, 0.025, "#c5a38a");
    for (let x = -14.4; x < 14.5; x += 1)
      box(
        facade,
        x + (Math.round(y / 0.42) % 2) * 0.48,
        y + 0.2,
        -4.45,
        0.026,
        0.39,
        0.03,
        "#bd9a7d",
      );
  }
  for (let y of [1.3, 6.8, 7.1, 8.1])
    box(facade, 0, y, -4.25, 29.6, 0.18, 0.6, "#d5c6a9");
  for (let x of [-10, -5, 0, 5, 10]) {
    arch(facade, x, 0, -4.15, 4.1, 5.7, "#d7c9ae", 0.2);
    arch(facade, x, 0, -3.91, 3.4, 5.22, "#263d3b", 0.07);
    for (let xx = -1.4; xx < 1.5; xx += 0.38)
      box(facade, x + xx, 2.2, -3.8, 0.055, 4.3, 0.05, "#3c4440");
    box(facade, x, 2.4, -3.75, 3.4, 0.07, 0.08, "#7c8478");
  }
  // Stepped central parapet, cream stone bands and a deliberate port-city silhouette.
  for (let i = 0; i < 5; i++)
    box(facade, 0, 8.1 + i * 0.46, -5, 8 - i * 1.35, 0.5, 1.2, "#9f533d");
  for (let x of [-4.2, 4.2]) {
    cyl(facade, x, 8.6, -4.8, 0.38, 3.7, "#a7573d", 8);
    cyl(facade, x, 10.5, -4.8, 0.5, 0.3, "#d8c7aa", 8);
    for (let y of [7.5, 8.7, 9.3])
      cyl(facade, x, y, -4.8, 0.46, 0.3, "#d8c7aa", 8);
  }
  label(facade, "FREMANTLE", 0, 7.75, -3.86, 7.4, "#703e32", "#ded1b4");
  label(facade, "MARKETS", 0, 6.7, -3.84, 4.9, "#e9dcc1", "#28443c");
  for (let side of [-1, 1]) {
    let x = side * 9;
    box(g, x, 3, -0.1, 7.5, 0.15, 6.7, "#345849");
    for (let i = 0; i < 15; i++)
      box(g, x - 3.5 + i * 0.5, 3.11, -0.1, 0.24, 0.03, 6.7, "#c8b792");
    for (let xx of [x - 3.5, x + 3.5]) cyl(g, xx, 1.5, 3, 0.07, 3, "#3a5144");
    box(g, x, 0.65, 1, 5, 1.3, 1.8, "#8f6f46");
    for (let i = 0; i < 7; i++)
      for (let j = 0; j < 3; j++)
        mesh(
          g,
          new T.IcosahedronGeometry(0.23, 1),
          i % 2 ? "#c99936" : "#7e963c",
          x - 2 + i * 0.65,
          1.45 + j * 0.11,
          0.6 + j * 0.36,
        );
  }
  return g;
}
function beach() {
  let g = new T.Group();
  sea(g, "#445d70");
  let sh = new T.Shape();
  sh.moveTo(-70, 16);
  sh.bezierCurveTo(-25, 4, 5, 5, 22, 11);
  sh.bezierCurveTo(35, 16, 45, 20, 70, 10);
  sh.lineTo(70, 70);
  sh.lineTo(-70, 70);
  sh.closePath();
  let sand = mesh(g, new T.ShapeGeometry(sh, 60), "#c4aa8e", 0, 0.05, 0);
  sand.rotation.x = Math.PI / 2;
  sand.material = sand.material.clone();
  sand.material.side = T.DoubleSide;
  for (let k = 0; k < 4; k++) {
    let points = [];
    for (let i = 0; i <= 80; i++) {
      let x = -55 + i * 1.4,
        z = 8 + Math.sin(x * 0.045) * 3 + k * 1.4;
      points.push(new T.Vector3(x, 0.1 + k * 0.002, z));
    }
    let c = new T.CatmullRomCurve3(points);
    mesh(
      g,
      new T.TubeGeometry(c, 90, 0.04 + k * 0.012, 4, false),
      k % 2 ? "#d7c5b4" : "#9eaaad",
    );
  }
  box(g, -16, 1.5, 22, 12, 3, 13, "#ad9d87");
  for (let i = 0; i < 30; i++) {
    let r = mesh(
      g,
      new T.DodecahedronGeometry(0.4 + rnd() * 0.7),
      "#8d8979",
      -11 + rnd() * 3,
      0.2 + rnd() * 0.5,
      14 + rnd() * 17,
    );
    r.scale.y = 0.7;
  }
  let sun = mesh(g, new T.SphereGeometry(2.9, 32, 16), "#f6c88d", 0, 7, -62);
  sun.material = new T.MeshBasicMaterial({
    color: "#f3c18e",
    fog: false,
    toneMapped: false,
  });
  for (let i = 0; i < 30; i++)
    box(
      g,
      0 + (rnd() - 0.5) * (3 + i * 0.3),
      -0.11,
      -45 + i * 1.6,
      0.2 + rnd() * 2,
      0.01,
      0.07,
      "#be9885",
    );
  for (let i = 0; i < 9; i++) {
    let x = 6 + i * 2.0,
      z = 24 + Math.sin(i) * 1.1;
    box(g, x, 0.4, z, 0.25, 0.8, 0.25, "#6e6052");
    if (i)
      line(
        g,
        [x - 2, 0.72, 24 + Math.sin(i - 1) * 1.1],
        [x, 0.72, z],
        0.025,
        "#9f8d75",
      );
  }
  return g;
}
function batch(g) {
  g.updateMatrixWorld(true);
  let by = new Map(),
    remove = [];
  g.traverse((o) => {
    if (
      !o.isMesh ||
      o.parent.userData.water ||
      o.material.map ||
      o.material.type === "MeshBasicMaterial"
    )
      return;
    let geo = o.geometry.clone();
    geo.applyMatrix4(o.matrixWorld);
    let a = by.get(o.material) || [];
    a.push(geo);
    by.set(o.material, a);
    remove.push(o);
  });
  for (let o of remove) o.parent.remove(o);
  for (let [m, geos] of by) {
    let merged = mergeGeometries(geos, false);
    if (!merged) continue;
    let o = new T.Mesh(merged, m);
    o.castShadow = ![
      "#c4aa8e",
      "#d7c5b4",
      "#9eaaad",
      "#93b4b0",
      "#be9885",
    ].includes("#" + m.color.getHexString());
    o.receiveShadow = true;
    g.add(o);
    geos.forEach((x) => x.dispose());
  }
}
export function createLandscapes() {
  let scenes = [harbour(), roundhouse(), market(), beach()];
  scenes.forEach(batch);
  let descriptors = [
    [
      "Fishing Boat Harbour",
      "Blue hulls. Timber jetties. Working water.",
      ["#b0c4c3", "#e3d7bd"],
      [22, 16, 30],
      [0, 2, 0],
    ],
    [
      "The Round House",
      "Twelve sides of limestone, above the sea.",
      ["#91b5bc", "#e7d7b9"],
      [13, 11, 35],
      [0, 3.5, 3],
    ],
    [
      "Fremantle Markets",
      "Brick, ironwork and the colour of produce.",
      ["#a8babe", "#e9d5b5"],
      [9, 12, 40],
      [0, 4, 0],
    ],
    [
      "Bathers Beach",
      "The last light belongs to the water.",
      ["#465975", "#d7a994"],
      [2, 8, 38],
      [0, 2, -6],
    ],
  ];
  let animated = [];
  scenes.forEach((g) =>
    g.traverse((o) => {
      if (o.userData.water)
        animated.push({
          o,
          type: "water",
          base: o.position.clone(),
          j: animated.length,
        });
    }),
  );
  return { scenes, descriptors, animated };
}
