import { Experience } from "./core/Experience.js";
try {
  new Experience(document.querySelector("canvas"));
} catch (e) {
  document.querySelector("#status").textContent =
    "The 3D harbour could not start. Please reload in a WebGL-capable browser.";
  console.error(e);
}
