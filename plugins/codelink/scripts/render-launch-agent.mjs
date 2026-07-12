#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function renderLaunchAgent(template, values) {
  let rendered = template;
  for (const [placeholder, value] of Object.entries(values)) {
    rendered = rendered.replaceAll(`__${placeholder}__`, escapeXml(value));
  }
  return rendered;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function main(args) {
  const [
    templatePath,
    outputPath,
    label,
    nodeBin,
    codexBin,
    cliPath,
    workdir,
    logDir,
    stateDir,
  ] = args;
  if (!stateDir) throw new Error("render-launch-agent.mjs 参数不完整");
  const template = fs.readFileSync(templatePath, "utf8");
  fs.writeFileSync(
    outputPath,
    renderLaunchAgent(template, {
      LABEL: label,
      NODE_BIN: nodeBin,
      CODEX_BIN: codexBin,
      CLI_PATH: cliPath,
      WORKDIR: workdir,
      LOG_DIR: logDir,
      STATE_DIR: stateDir,
    }),
    "utf8",
  );
}

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
