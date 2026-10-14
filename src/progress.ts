// Simple progress/status indicators for long-running operations.

const SPINNERS = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

let spinnerIndex = 0;
let spinnerTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start a spinner animation for the given message.
 * Returns a function to stop the spinner and show the done message.
 */
export function status(message: string): () => void {
  process.stdout.write(`\r${message} `);
  spinnerIndex = 0;

  spinnerTimer = setInterval(() => {
    const spinner = SPINNERS[spinnerIndex % SPINNERS.length];
    spinnerIndex++;
    // Replace just the spinner character
    const base = message.replace(/.$/, "");
    process.stdout.write(`\r${base} ${spinner}`);
  }, 80);

  return () => {
    if (spinnerTimer) {
      clearInterval(spinnerTimer);
      spinnerTimer = null;
    }
    process.stdout.write(`\r${message} ✓\n`);
  };
}

/**
 * Show a simple status message without a spinner.
 */
export function statusSimple(message: string): void {
  console.log(message);
}

/**
 * Show a success message.
 */
export function statusDone(message: string): void {
  console.log(`  ✓ ${message}`);
}

/**
 * Show a warning message.
 */
export function statusWarn(message: string): void {
  console.log(`  ⚠ ${message}`);
}

/**
 * Show an error message.
 */
export function statusError(message: string): void {
  console.error(`  ✗ ${message}`);
}

/**
 * Stop any active spinner silently (e.g., for non-TTY output).
 */
export function stopSpinner(): void {
  if (spinnerTimer) {
    clearInterval(spinnerTimer);
    spinnerTimer = null;
  }
}
