export interface Format {
  bold: (text: string) => string;
  dim: (text: string) => string;
  green: (text: string) => string;
  red: (text: string) => string;
  yellow: (text: string) => string;
  blue: (text: string) => string;
  cyan: (text: string) => string;
}

const identity = (text: string) => text;

function ansi(open: number, close: number): (text: string) => string {
  return (text) => `\x1b[${open}m${text}\x1b[${close}m`;
}

const plainFormat: Format = {
  bold: identity,
  dim: identity,
  green: identity,
  red: identity,
  yellow: identity,
  blue: identity,
  cyan: identity,
};

const colorFormat: Format = {
  bold: ansi(1, 22),
  dim: ansi(2, 22),
  green: ansi(32, 39),
  red: ansi(31, 39),
  yellow: ansi(33, 39),
  blue: ansi(34, 39),
  cyan: ansi(36, 39),
};

export function createFormat(colorEnabled: boolean): Format {
  return colorEnabled ? colorFormat : plainFormat;
}

export function detectColorSupport(): boolean {
  if (process.env["NO_COLOR"]) return false;
  if (process.env["FORCE_COLOR"]) return true;
  return process.stdout.isTTY ?? false;
}
