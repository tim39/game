/** Downloads text as a file, as the browser downloads anything: to its downloads, or asking where. */
export function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  // In the page while it's clicked, which some browsers need.
  document.body.append(link);
  link.click();
  link.remove();
  // Long enough for the download to have started.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Asks for a JSON file with the browser's file picker, and resolves with what's in it, or null if
 * none was picked. Browsers only open the picker just after a key press or a touch, so a gamepad
 * press can't open it.
 */
export function pickTextFile(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = '.json,application/json';
    // Out of sight, but in the page, where every browser lets it open.
    picker.style.position = 'fixed';
    picker.style.left = '-9999px';
    document.body.append(picker);
    const done = (): void => picker.remove();
    picker.addEventListener('change', () => {
      done();
      const file = picker.files?.[0];
      if (file) file.text().then(resolve, reject);
      else resolve(null);
    });
    picker.addEventListener('cancel', () => {
      done();
      resolve(null);
    });
    picker.click();
  });
}
