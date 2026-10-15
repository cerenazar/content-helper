import { spawn, type ChildProcess } from 'node:child_process';

/**
 * Tek seferlik `claude -p` çalıştırması (analiz ve araştırma için). Proje paneli `claude.ts`'de; burada oturum,
 * snapshot ya da dosya izleme yok. Araçlar `--tools` ile sınırlanır, kullanıcının MCP sunucuları yüklenmez.
 */
export interface ClaudeRun {
  child: ChildProcess;
  done: Promise<{ text: string; error?: string; cost?: number; stopped: boolean }>;
  stop(): void;
}

export function runClaude(opts: {
  cwd: string;
  prompt: string;
  tools: string[];
  onTool?: (name: string, input: any) => void;
  onText?: (text: string) => void;
}): ClaudeRun {
  const tools = opts.tools.join(',');
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--tools', tools, '--allowedTools', tools, '--strict-mcp-config'];
  const child = spawn('claude', args, { cwd: opts.cwd, env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: 'cerenbuilds-editor' } });
  child.stdin.end(opts.prompt);
  let stopped = false;

  const done = new Promise<{ text: string; error?: string; cost?: number; stopped: boolean }>((resolve) => {
    let buf = '';
    let stderr = '';
    let result = '';
    let lastText = '';
    let resultError: string | undefined;
    let cost: number | undefined;
    child.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        let m: any;
        try {
          m = JSON.parse(line);
        } catch {
          continue;
        }
        if (m.type === 'assistant') {
          for (const b of m.message?.content ?? []) {
            if (b.type === 'text' && b.text?.trim()) {
              lastText = b.text;
              opts.onText?.(b.text);
            }
            if (b.type === 'tool_use') opts.onTool?.(b.name, b.input);
          }
        }
        if (m.type === 'result') {
          cost = m.total_cost_usd;
          if (typeof m.result === 'string') result = m.result;
          if (m.is_error || m.subtype !== 'success') resultError = (typeof m.result === 'string' && m.result) || m.subtype;
        }
      }
    });
    child.stderr.on('data', (d) => (stderr = (stderr + d).slice(-4000)));
    child.on('close', (code) => {
      const err = stopped ? undefined : (resultError ?? (code !== 0 ? stderr.trim().split('\n').slice(-3).join(' ') || `claude çıkış kodu ${code}` : undefined));
      resolve({ text: result || lastText, error: err, cost, stopped });
    });
    child.on('error', (e) => resolve({ text: '', error: 'claude başlatılamadı: ' + e.message + ' (Claude Code kurulu ve girişli mi?)', stopped: false }));
  });

  return {
    child,
    done,
    stop() {
      stopped = true;
      child.kill('SIGINT');
      // SIGINT'e cevap vermezse
      setTimeout(() => child.exitCode === null && child.kill('SIGTERM'), 3000);
    },
  };
}
