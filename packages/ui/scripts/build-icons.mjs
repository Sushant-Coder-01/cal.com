// this script is based on https://github.com/epicweb-dev/epic-stack/blob/main/other/build-icons.ts
//
import { $ } from "execa";
import glob from "fast-glob";
import fsExtra from "fs-extra";
import { parse } from "node-html-parser";
import * as path from "node:path";

import { copyIcons, removeTempDir } from "./generate-icons.mjs";

const cwd = process.cwd();
const inputDir = path.join(cwd, "svg-icons");
const inputDirRelative = path.relative(cwd, inputDir);
const typesDir = path.join(cwd, "components", "icon");
const outputDir = path.join(cwd, "../../", "apps", "web", "public", "icons");

const shouldVerboseLog = process.argv.includes("--log=verbose");
const logVerbose = shouldVerboseLog ? console.log : () => {};

async function generateIconFiles() {
  const files = glob
    .sync("**/*.svg", {
      cwd: inputDir,
    })
    .sort((a, b) => a.localeCompare(b));

  await fsExtra.ensureDir(outputDir);

  const spriteFilepath = path.join(outputDir, "sprite.svg");
  const typeOutputFilepath = path.join(typesDir, "icon-names.ts");
  const currentSprite = await fsExtra.readFile(spriteFilepath, "utf8").catch(() => "");
  const currentTypes = await fsExtra.readFile(typeOutputFilepath, "utf8").catch(() => "");

  const iconNames = files.map((file) => iconName(file));

  const spriteUpToDate = iconNames.every((name) => currentSprite.includes(`id=${name}`));
  const typesUpToDate = iconNames.every((name) => currentTypes.includes(`"${name}"`));

  if (spriteUpToDate && typesUpToDate) {
    logVerbose(`Icons are up to date`);
    return;
  }

  logVerbose(`Generating sprite for ${inputDirRelative}`);

  const spriteChanged = await generateSvgSprite({
    files,
    inputDir,
    outputPath: spriteFilepath,
  });

  for (const file of files) {
    logVerbose("✅", file);
  }
  logVerbose(`Saved to ${path.relative(cwd, spriteFilepath)}`);

  const stringifiedIconNames = iconNames.map((name) => JSON.stringify(name));

  const typeOutputContent = `// This file is generated by yarn run build:icons

export type IconName =
\t| ${stringifiedIconNames.join("\n\t| ")};
`;
  const typesChanged = await writeIfChanged(typeOutputFilepath, typeOutputContent);

  logVerbose(`Manifest saved to ${path.relative(cwd, typeOutputFilepath)}`);

  if (spriteChanged || typesChanged) {
    console.log(`Generated ${files.length} icons`);
  }
}

function iconName(file) {
  return file.replace(/\.svg$/, "");
}

/**
 * Creates a single SVG file that contains all the icons
 */
async function generateSvgSprite({ files, inputDir, outputPath }) {
  // Each SVG becomes a symbol and we wrap them all in a single SVG
  const symbols = await Promise.all(
    files.map(async (file) => {
      const input = await fsExtra.readFile(path.join(inputDir, file), "utf8");
      const root = parse(input);

      const svg = root.querySelector("svg");
      if (!svg) throw new Error("No SVG element found");

      svg.tagName = "symbol";
      svg.setAttribute("id", iconName(file));
      svg.setAttribute("fill", "inherit");
      svg.removeAttribute("xmlns");
      svg.removeAttribute("xmlns:xlink");
      svg.removeAttribute("version");
      svg.removeAttribute("width");
      svg.removeAttribute("height");

      return svg.toString().trim();
    })
  );

  const output = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!-- This file is generated by npm run build:icons -->`,
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="0" height="0">`,
    `<defs>`, // for semantics: https://developer.mozilla.org/en-US/docs/Web/SVG/Element/defs
    ...symbols,
    `</defs>`,
    `</svg>`,
    "", // trailing newline
  ].join("\n");

  return writeIfChanged(outputPath, output);
}

async function writeIfChanged(filepath, newContent) {
  const currentContent = await fsExtra.readFile(filepath, "utf8").catch(() => "");
  if (currentContent === newContent) return false;
  await fsExtra.writeFile(filepath, newContent, "utf8");
  await $`prettier --write ${filepath} --ignore-unknown`;
  return true;
}

await copyIcons();
await generateIconFiles();
await removeTempDir();
