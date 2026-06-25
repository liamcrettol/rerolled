import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const ICONS_DIR = join(process.cwd(), "public", "icons");

const svgFiles = readdirSync(ICONS_DIR).filter((f) => f.endsWith(".svg"));

describe("public/icons SVG assets", () => {
  it("contains SVG files to validate", () => {
    expect(svgFiles.length).toBeGreaterThan(0);
  });

  it.each(svgFiles)(
    "%s is a real SVG, not an HTML checkpoint page",
    (file) => {
      const content = readFileSync(join(ICONS_DIR, file), "utf8").trimStart();

      // Guards against the root-cause corruption: svgrepo's Vercel
      // Security Checkpoint HTML page saved with a .svg extension.
      expect(content).not.toMatch(/^<!doctype html/i);
      expect(content).not.toContain("Vercel Security Checkpoint");

      // Must actually be an SVG document.
      expect(content).toMatch(/^(<\?xml[^>]*\?>\s*)?<svg[\s>]/i);
    }
  );
});
