// Chạy cùng lúc máy chủ API (cổng 4000) và trang web (cổng 5173) bằng một lệnh: npm run dev
// Tắt cửa sổ / Ctrl+C → tắt cả hai.
import { spawn } from 'node:child_process';

const procs = [
  { name: 'máy chủ', color: '\x1b[33m', args: ['run', 'dev', '-w', 'server'] },
  { name: 'web', color: '\x1b[36m', args: ['run', 'dev', '-w', 'client'] },
].map(({ name, color, args }) => {
  const p = spawn('npm', args, { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const tag = `${color}[${name}]\x1b[0m `;
  const pipe = (stream, out) => {
    let buf = '';
    stream.on('data', (d) => {
      buf += d;
      const lines = buf.split(/\r?\n/);
      buf = lines.pop();
      for (const l of lines) out.write(tag + l + '\n');
    });
  };
  pipe(p.stdout, process.stdout);
  pipe(p.stderr, process.stderr);
  p.on('exit', (code) => {
    console.log(`${tag}đã dừng (mã ${code}) – dừng luôn phần còn lại`);
    stopAll(code ?? 0);
  });
  return p;
});

let stopping = false;
function stopAll(code) {
  if (stopping) return;
  stopping = true;
  for (const p of procs) {
    if (p.exitCode !== null) continue;
    // Windows: tắt cả cây tiến trình (npm → node)
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(p.pid), '/T', '/F'], { stdio: 'ignore' });
    else p.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 500);
}
process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
