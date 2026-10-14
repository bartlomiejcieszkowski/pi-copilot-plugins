// Color utilities for CLI output. Respects NO_COLOR environment variable.

const envNoColor = process.env.NO_COLOR;
export const colorEnabled = envNoColor === undefined || envNoColor === "";

const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
} as const;

export function colorize(text: string, ...colors: (keyof typeof COLORS)[]): string {
  if (!colorEnabled) return text;
  const prefix = colors.map((c) => COLORS[c]).join("");
  return `${prefix}${text}${COLORS.reset}`;
}

export function green(text: string): string {
  return colorize(text, "green");
}

export function red(text: string): string {
  return colorize(text, "red");
}

export function yellow(text: string): string {
  return colorize(text, "yellow");
}

export function cyan(text: string): string {
  return colorize(text, "cyan");
}

export function bold(text: string): string {
  return colorize(text, "bold");
}

export function gray(text: string): string {
  return colorize(text, "gray");
}
