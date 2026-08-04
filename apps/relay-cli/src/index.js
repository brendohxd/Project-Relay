#!/usr/bin/env node

import process from "node:process";
import { pathToFileURL } from "node:url";
import { createInterface } from "node:readline/promises";

import { TOOL_CATALOG } from "./catalog.js";
import { scanTools } from "./scanner.js";
import { renderCatalog, renderDiscoveryReport, renderScanStart, terminalCapabilities } from "./terminal-ui.js";

function usage() {
  return `Project Relay CLI 0.1

Usage:
  relay catalog [--json]
  relay scan [--scope standard|broad] [--add-location PATH] [--json]
             [--confirm-broad] [--max-depth N] [--max-entries N]

Safety:
  Standard scan checks documented candidates, PATH, and bounded program roots.
  Broad scan also checks Desktop, Documents, Downloads, and application-data roots.
  No file contents are read. No configuration, conversation store, process, or app is changed.
`;
}

function parseArguments(argv) {
  const [command = "help", ...tokens] = argv;
  const options = { customLocations: [], json: false, scope: "standard", confirmBroad: false };
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "--json") options.json = true;
    else if (token === "--confirm-broad") options.confirmBroad = true;
    else if (token === "--no-confirm") options.noConfirm = true;
    else if (token === "--scope") options.scope = tokens[++index];
    else if (token === "--add-location") options.customLocations.push(tokens[++index]);
    else if (token === "--max-depth") options.maxDepth = Number(tokens[++index]);
    else if (token === "--max-entries") options.maxEntries = Number(tokens[++index]);
    else throw new Error(`unknown option: ${token}`);
  }
  if (options.customLocations.some((value) => !value)) throw new Error("--add-location requires a path");
  return { command, options };
}

function printCatalog(json, capabilities = terminalCapabilities()) {
  const result = {
    catalogue_version: "relay-tools/0.1",
    tools: TOOL_CATALOG.map(({ processNames, ...tool }) => ({ ...tool, process_names: processNames }))
  };
  console.log(json ? JSON.stringify(result, null, 2) : renderCatalog(result, capabilities));
}

function printReport(report, json, capabilities = terminalCapabilities()) {
  console.log(json ? JSON.stringify(report, null, 2) : renderDiscoveryReport(report, capabilities));
}

async function askYesNo(terminal, question) {
  return (await terminal.question(`${question} [y/N] `)).trim().toLowerCase() === "y";
}

async function runScan(options, io = process) {
  const capabilities = terminalCapabilities({ stdout: io.stdout, environment: process.env });
  const terminal = io.stdin.isTTY && !options.json
    ? createInterface({ input: io.stdin, output: io.stdout })
    : null;
  try {
    let broadAuthorized = options.confirmBroad;
    if (options.scope === "broad" && !broadAuthorized) {
      if (!terminal) throw new Error("Broad scan requires --confirm-broad in non-interactive mode");
      broadAuthorized = await askYesNo(terminal, "Broad scan examines bounded Desktop, Documents, Downloads, and application-data paths. Continue?");
      if (!broadAuthorized) return 2;
    }

    const customLocations = [...options.customLocations];
    while (true) {
      if (!options.json) console.log(renderScanStart(options.scope, capabilities));
      const report = await scanTools({
        scope: options.scope,
        broadAuthorized,
        customLocations,
        ...(options.maxDepth === undefined ? {} : { maxDepth: options.maxDepth }),
        ...(options.maxEntries === undefined ? {} : { maxEntries: options.maxEntries })
      });
      printReport(report, options.json, capabilities);
      if (!terminal || options.noConfirm) return 0;

      const answer = (await terminal.question("Is this discovery correct? [y]es / [a]dd custom location / [n]o: ")).trim().toLowerCase();
      if (answer === "y") {
        console.log("Discovery confirmed for this session. No configuration changes were applied.");
        return 0;
      }
      if (answer !== "a") {
        console.log("Discovery not confirmed. No changes were applied.");
        return 2;
      }
      const custom = (await terminal.question("Custom application or data location: ")).trim();
      if (custom) customLocations.push(custom);
    }
  } finally {
    terminal?.close();
  }
}

export async function run(argv = process.argv.slice(2), io = process) {
  try {
    const { command, options } = parseArguments(argv);
    if (command === "help" || command === "--help" || command === "-h") {
      console.log(usage());
      return 0;
    }
    if (command === "catalog") {
      printCatalog(options.json);
      return 0;
    }
    if (command === "scan") return await runScan(options, io);
    throw new Error(`unknown command: ${command}`);
  } catch (error) {
    console.error(`relay: ${error.message}`);
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await run();
}
