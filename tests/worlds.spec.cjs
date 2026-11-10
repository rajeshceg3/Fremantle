const { test, expect } = require("@playwright/test");
for (const width of [320, 390, 1440])
  for (const motion of ["reduce", "no-preference"])
    test(`${width}px ${motion} four places and controls`, async ({ page }) => {
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.setViewportSize({ width, height: 844 });
      await page.emulateMedia({ reducedMotion: motion });
      await page.goto("/");
      await page.waitForFunction(() => window.__world);
      expect(await page.evaluate(() => window.__world.state.audio)).toBe(
        "not-created",
      );
      expect(await page.evaluate(() => window.__world.state.paused)).toBe(
        motion === "reduce",
      );
      for (let i = 0; i < 4; i++) {
        await page.selectOption("#view", String(i));
        await expect(page.locator("#scene-name")).toHaveText(
          [
            "Fishing Boat Harbour",
            "The Round House",
            "Fremantle Markets",
            "Bathers Beach",
          ][i],
        );
        const before = await page.evaluate(() => window.__world.state.camera);
        await page.mouse.move(width * 0.45, 360);
        await page.mouse.down();
        await page.mouse.move(width * 0.65, 425, { steps: 8 });
        await page.mouse.up();
        expect(
          await page.evaluate(() => window.__world.state.camera),
        ).not.toEqual(before);
        await page.click("#reset");
        const after = await page.evaluate(() => window.__world.state.camera);
        expect(after.every((n, j) => Math.abs(n - before[j]) < 1e-7)).toBe(
          true,
        );
        await page.waitForTimeout(100);
        expect(await page.evaluate(() => window.__world.state.camera)).toEqual(
          after,
        );
        await page.locator("canvas").focus();
        await page.keyboard.press("ArrowLeft");
        expect(
          await page.evaluate(() => window.__world.state.camera),
        ).not.toEqual(before);
        await page.click("#reset");
        expect(
          (await page.evaluate(() => window.__world.state.camera)).every(
            (n, j) => Math.abs(n - before[j]) < 1e-7,
          ),
        ).toBe(true);
        await page.screenshot({
          path: `verification/${width}-${motion}-${i}.png`,
        });
      }
      if (!(await page.evaluate(() => window.__world.state.paused)))
        await page.click("#pause");
      const t = await page.evaluate(() => window.__world.state.time);
      await page.waitForTimeout(160);
      expect(await page.evaluate(() => window.__world.state.time)).toBe(t);
      await page.click("#pause");
      await expect
        .poll(() => page.evaluate(() => window.__world.state.time), {
          timeout: 10000,
        })
        .toBeGreaterThan(t);
      await page.click("#sound");
      await expect(page.locator("#sound")).toHaveText("Sound on");
      await page.waitForTimeout(100);
      expect(await page.evaluate(() => window.__world.state.audio)).toBe(
        "running",
      );
      await page.click("#sound");
      await page.waitForTimeout(80);
      expect(await page.evaluate(() => window.__world.state.audio)).toBe(
        "suspended",
      );
      await page.click("#about");
      await expect(page.locator("dialog")).toBeVisible();
      await page.screenshot({
        path: `verification/${width}-${motion}-about.png`,
      });
      await page.click("#close-info");
      await expect(page.locator("dialog")).not.toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(errors).toEqual([]);
    });
