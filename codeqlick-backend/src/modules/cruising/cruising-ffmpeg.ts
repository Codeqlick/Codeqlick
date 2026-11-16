import { spawn } from 'node:child_process';
import { Injectable } from '@nestjs/common';
import { parseProbe, posterArgs, transcodeArgs, type ProbeResult } from './cruising-media.rules.js';

/** How long each tool may run before it is killed. */
const PROBE_TIMEOUT_MS = 30_000;
const TRANSCODE_TIMEOUT_MS = 10 * 60_000;
const POSTER_TIMEOUT_MS = 60_000;
/** The most a tool may print on stdout (a poster frame as PNG, ffprobe's JSON). */
const MAX_STDOUT_BYTES = 40 * 1024 * 1024;

export interface RunResult {
  code: number | null;
  stdout: Buffer;
  stderr: string;
}

/**
 * Runs a program with arguments (never through a shell, so nothing in a path can become a
 * command), killing it after `timeoutMs`. `lowPriority` starts it under `nice`, so a transcode
 * never slows the API or the website down.
 */
export function run(
  program: string,
  args: string[],
  timeoutMs: number,
  lowPriority = false,
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const [command, commandArgs] = lowPriority
      ? ['nice', ['-n', '19', program, ...args]]
      : [program, args];
    const child = spawn(command, commandArgs, { stdio: ['ignore', 'pipe', 'pipe'], shell: false });
    const out: Buffer[] = [];
    let outBytes = 0;
    let err = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', (chunk: Buffer) => {
      outBytes += chunk.length;
      if (outBytes > MAX_STDOUT_BYTES) child.kill('SIGKILL');
      else out.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      // The end of the log is what explains a failure.
      err = (err + chunk.toString()).slice(-4000);
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout: Buffer.concat(out), stderr: err });
    });
  });
}

/**
 * ffprobe and ffmpeg for Cruising's videos (architecture 4.15, phase 4). Its own provider so the
 * tests can replace it.
 */
@Injectable()
export class CruisingFfmpeg {
  /** The video's duration and size, or null when it isn't a video ffprobe can read. */
  async probe(path: string): Promise<ProbeResult | null> {
    try {
      const result = await run(
        'ffprobe',
        ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path],
        PROBE_TIMEOUT_MS,
      );
      return result.code === 0 ? parseProbe(result.stdout.toString()) : null;
    } catch {
      return null;
    }
  }

  /** Transcodes `input` into an H.264/AAC MP4 at `output`; throws when ffmpeg fails. */
  async transcode(input: string, output: string): Promise<void> {
    const result = await run('ffmpeg', transcodeArgs(input, output), TRANSCODE_TIMEOUT_MS, true);
    if (result.code !== 0) throw new Error(`ffmpeg failed (${result.code}): ${result.stderr}`);
  }

  /** One frame at `at` seconds, as PNG; throws when there is none. */
  async poster(input: string, at: number): Promise<Buffer> {
    const result = await run('ffmpeg', posterArgs(input, at), POSTER_TIMEOUT_MS, true);
    if (result.code !== 0 || result.stdout.length === 0) {
      throw new Error(`No poster frame (${result.code}): ${result.stderr}`);
    }
    return result.stdout;
  }
}
