import { spawn } from 'node:child_process';

export interface RunOpts {
  /** Toplam süre (sn) verilirse `-progress` çıktısından 0–1 ilerleme bildirilir. */
  duration?: number;
  onProgress?: (p: number) => void;
  cwd?: string;
  stdin?: NodeJS.ReadableStream;
}

export function run(cmd: string, args: string[], opts: RunOpts = {}, o2: { fullStderr?: boolean } = {}): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const withProgress = cmd === 'ffmpeg' && opts.duration && opts.onProgress;
    const a = withProgress ? ['-progress', 'pipe:2', '-nostats', ...args] : args;
    const p = spawn(cmd, a, { cwd: opts.cwd });
    let stdout = '',
      stderr = '';
    p.stdout.on('data', (d) => (stdout += d));
    p.stderr.on('data', (d) => {
      const s = d.toString();
      if (withProgress) {
        const m = [...s.matchAll(/out_time_us=(\d+)/g)].pop();
        if (m) opts.onProgress!(Math.min(1, Number(m[1]) / 1e6 / opts.duration!));
      }
      stderr = o2.fullStderr ? stderr + s : (stderr + s).slice(-20000);
    });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`${cmd} ${code}: ${stderr.split('\n').filter((l) => l && !l.includes('=')).slice(-4).join(' | ')}`))));
  });
}

export async function probe(file: string) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file]);
  const j = JSON.parse(stdout);
  const v = j.streams.find((s: any) => s.codec_type === 'video');
  if (!v) throw Object.assign(new Error('Video akışı bulunamadı'), { statusCode: 422 });
  const [n, d] = String(v.avg_frame_rate || v.r_frame_rate || '30/1').split('/').map(Number);
  const sdRot = (v.side_data_list || []).find((s: any) => s.rotation !== undefined)?.rotation;
  const rotation = Number(sdRot ?? v.tags?.rotate ?? 0);
  return {
    duration: Number(j.format.duration ?? v.duration ?? 0),
    width: v.width,
    height: v.height,
    fps: d ? Math.round((n / d) * 100) / 100 : 30,
    rotation,
    codec: v.codec_name,
    hasAudio: j.streams.some((s: any) => s.codec_type === 'audio'),
  };
}
