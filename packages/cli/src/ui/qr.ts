/**
 * Minimal QR code generator for terminal display.
 * Uses a simple encoding approach for small data (URLs, tokens).
 *
 * For production use, consider a proper QR library.
 * This generates a text-based QR representation using Unicode block characters.
 */

// We'll use exec to call a simple Python one-liner for QR generation,
// or fall back to displaying the URL as text.
export async function renderQR(data: string): Promise<string> {
  try {
    // Try using Python's qrcode module (commonly available)
    const proc = Bun.spawn(
      [
        "python3",
        "-c",
        `
import sys
try:
    import qrcode
    qr = qrcode.QRCode(border=1)
    qr.add_data(sys.argv[1])
    qr.make()
    qr.print_ascii(out=sys.stdout, invert=True)
except ImportError:
    # Fallback: simple block representation
    print(sys.argv[1])
`,
        data,
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    if (exitCode === 0 && output.trim()) {
      return output;
    }
  } catch {
    // Python not available
  }

  // Fallback: just return the data as text
  return data;
}
