import { spawn } from 'node:child_process';
import crypto from 'node:crypto';

export class CompressionError extends Error {
  constructor(message: string, public readonly code = 'COMPRESSION_FAILED') {
    super(message);
    this.name = 'CompressionError';
  }
}

/**
 * Calculates SHA-256 checksum of a buffer.
 */
export function sha256(data: Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Compresses a buffer using bzip2 (-c -9) with stream safety and timeout limits.
 */
export async function compressBz2(input: Buffer, timeoutMs = 60000): Promise<Buffer> {
  if (input.length === 0) {
    // Empty bzip2 stream magic + header
    // Running bzip2 on empty stdin returns valid bzip2 stream
  }

  return new Promise((resolve, reject) => {
    let cp: ReturnType<typeof spawn>;
    try {
      cp = spawn('bzip2', ['-c', '-9'], { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err: any) {
      return reject(new CompressionError(`Failed to spawn bzip2: ${err.message}`));
    }

    if (!cp.stdout || !cp.stderr || !cp.stdin) {
      return reject(new CompressionError('Failed to initialize bzip2 streams'));
    }

    const chunks: Buffer[] = [];
    const errors: Buffer[] = [];
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        cp.kill('SIGKILL');
      } catch {
        // ignore
      }
      reject(new CompressionError(`bzip2 compression timed out after ${timeoutMs}ms`, 'COMPRESSION_TIMEOUT'));
    }, timeoutMs);

    cp.stdout.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    cp.stderr.on('data', (chunk) => {
      errors.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    cp.on('error', (err) => {
      clearTimeout(timer);
      if (!timedOut) reject(new CompressionError(`bzip2 process error: ${err.message}`));
    });

    cp.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) return;
      if (code !== 0) {
        const msg = Buffer.concat(errors).toString('utf8').trim() || `Exit code ${code}`;
        return reject(new CompressionError(`bzip2 compression failed: ${msg}`));
      }
      resolve(Buffer.concat(chunks));
    });

    cp.stdin.on('error', () => {
      // Avoid unhandled EPIPE if process exited early
    });

    cp.stdin.end(input);
  });
}

/**
 * Decompresses a bzip2 buffer using bunzip2 or bzip2 -d -c.
 */
export async function decompressBz2(input: Buffer, timeoutMs = 60000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let cp: ReturnType<typeof spawn>;
    try {
      cp = spawn('bzip2', ['-d', '-c'], { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err: any) {
      return reject(new CompressionError(`Failed to spawn bunzip2: ${err.message}`));
    }

    if (!cp.stdout || !cp.stderr || !cp.stdin) {
      return reject(new CompressionError('Failed to initialize bzip2 streams'));
    }

    const chunks: Buffer[] = [];
    const errors: Buffer[] = [];
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        cp.kill('SIGKILL');
      } catch {
        // ignore
      }
      reject(new CompressionError(`bunzip2 decompression timed out after ${timeoutMs}ms`, 'DECOMPRESSION_TIMEOUT'));
    }, timeoutMs);

    cp.stdout.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    cp.stderr.on('data', (chunk) => {
      errors.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    cp.on('error', (err) => {
      clearTimeout(timer);
      if (!timedOut) reject(new CompressionError(`bunzip2 process error: ${err.message}`));
    });

    cp.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) return;
      if (code !== 0) {
        const msg = Buffer.concat(errors).toString('utf8').trim() || `Exit code ${code}`;
        return reject(new CompressionError(`bunzip2 decompression failed: ${msg}`));
      }
      resolve(Buffer.concat(chunks));
    });

    cp.stdin.on('error', () => {});
    cp.stdin.end(input);
  });
}
