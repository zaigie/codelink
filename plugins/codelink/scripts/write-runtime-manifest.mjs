#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import {
  RUNTIME_MANIFEST_FILE,
  RUNTIME_PAYLOAD_FILES,
} from "./setup-lib.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(SCRIPT_DIR, "..", "dist");
const files = {};

for (const name of RUNTIME_PAYLOAD_FILES) {
  const filePath = path.join(DIST_DIR, name);
  files[name] = createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex");
}

const target = path.join(DIST_DIR, RUNTIME_MANIFEST_FILE);
const temp = `${target}.${process.pid}.tmp`;
fs.writeFileSync(
  temp,
  `${JSON.stringify({ schemaVersion: 1, files }, null, 2)}\n`,
);
fs.renameSync(temp, target);
