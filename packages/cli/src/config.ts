import { readFile, writeFile, mkdir } from "fs/promises";
import { dirname, join } from "path";
import { homedir } from "os";

export interface Config {
  workerUrl: string;
  adminApiKey: string;
}

const DEFAULT_CONFIG: Config = {
  workerUrl: "",
  adminApiKey: "",
};

export function defaultConfigPath(): string {
  return join(homedir(), ".magi", "config.json");
}

export async function readConfig(path: string): Promise<Config> {
  try {
    const raw = await readFile(path, "utf-8");
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function writeConfig(path: string, config: Config): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(config, null, 2) + "\n");
}
