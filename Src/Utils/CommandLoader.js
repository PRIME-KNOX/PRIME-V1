import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

function getCommandFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...getCommandFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(fullPath);
    }
  }

  return files;
}

export async function loadCommands(commandsDir) {
  const commands = new Map();
  const files = getCommandFiles(commandsDir);

  for (const file of files) {
    const mod = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
    const cmd = mod.default;
    if (!cmd?.name || typeof cmd.execute !== "function") continue;

    const primaryName = cmd.name.toLowerCase();
    commands.set(primaryName, cmd);

    if (Array.isArray(cmd.aliases)) {
      for (const alias of cmd.aliases) {
        commands.set(String(alias).toLowerCase(), cmd);
      }
    }
  }

  return commands;
}