/* global process,console,document,getComputedStyle,window,setTimeout */
import puppeteer from "puppeteer-core";
import fs from "node:fs";
(async () => {
  const b = await puppeteer.launch({
    executablePath: "/usr/bin/google-chrome",
    headless: "new",
    args: [
      "--no-sandbox",
      "--use-gl=swiftshader",
      "--enable-unsafe-swiftshader",
      "--hide-scrollbars",
    ],
  });
  const root = process.env.OUT || "verification/contrast";
  fs.mkdirSync(root, { recursive: true });
  const records = [];
  for (const [w, h] of JSON.parse(process.env.SIZES || "[[390,844]]"))
    for (const ch of JSON.parse(process.env.CHAPTERS || "[0,1,2,3]")) {
      const p = await b.newPage();
      await p.setViewport({
        width: w,
        height: h,
        deviceScaleFactor: w < 600 ? 2 : 1,
      });
      await p.emulateMediaFeatures([
        { name: "prefers-reduced-motion", value: "reduce" },
      ]);
      await p.goto(process.env.BASE_URL || "http://127.0.0.1:8797/");
      await p.waitForFunction(() => window.__world);
      await p.evaluate(() => document.fonts.ready);
      await p.evaluate((ch) => window.__world.select(ch), ch);
      await new Promise((r) => setTimeout(r, 500));

      if (process.env.HOVER_RESET) await p.hover("#reset");
      await p.addStyleTag({
        content:
          "*{transition:none!important}.chrome,.hint{opacity:1!important;animation:none!important}",
      });
      await p.evaluate(() => {
        window.requestAnimationFrame = () => 0;
      });
      await new Promise((r) => setTimeout(r, 300));
      const prefix = `${root}/${w}-${ch}`;
      const els = await p.evaluate(() =>
        [
          "h1",
          "#scene-name",

          "#view",
          "#reset",
          "#pause",
          "#sound",
          "#about",
          ".hint",
        ].map((sel, i) => {
          const e = document.querySelector(sel),
            r = e.getBoundingClientRect(),
            c = getComputedStyle(e);
          e.setAttribute("data-contrast-id", i);
          return {
            sel,
            i,
            rect: { x: r.x, y: r.y, width: r.width, height: r.height },
            ink: c.color,
            opacity: c.opacity,
            font: c.fontSize,
          };
        }),
      );
      await p.screenshot({ path: prefix + "-original.png" });
      const st = await p.addStyleTag({
        content:
          "[data-contrast-id]{color:transparent!important;text-shadow:none!important}",
      });
      await p.screenshot({ path: prefix + "-backdrop.png" });
      await st.evaluate(
        (e) =>
          (e.textContent =
            "[data-contrast-id]{color:#000!important;text-shadow:none!important}"),
      );
      await p.screenshot({ path: prefix + "-black.png" });
      await st.evaluate(
        (e) =>
          (e.textContent =
            "[data-contrast-id]{color:#fff!important;text-shadow:none!important}"),
      );
      await p.screenshot({ path: prefix + "-white.png" });
      records.push({ w, h, ch, prefix, els });
      let previous = [];
      try {
        previous = JSON.parse(fs.readFileSync(root + `/records-${w}.json`));
      } catch {
        /* No previous run recorded. */
      }
      previous = previous.filter((r) => r.ch !== ch);
      previous.push({ w, h, ch, prefix, els });
      fs.writeFileSync(
        root + `/records-${w}.json`,
        JSON.stringify(previous, null, 2),
      );
      await p.close();
    }
  fs.writeFileSync(root + "/records.json", JSON.stringify(records, null, 2));
  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
