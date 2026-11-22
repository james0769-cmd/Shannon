import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import type { TerminalInfo } from '../../shared/types.js';

const MAX_BUFFER_CHARS = 128_000;

const PTY_HELPER_SCRIPT = `
import base64
import errno
import fcntl
import json
import os
import pty
import select
import signal
import struct
import sys
import termios

shell = sys.argv[1]
cols = max(2, int(sys.argv[2]))
rows = max(2, int(sys.argv[3]))

master_fd, slave_fd = pty.openpty()
fcntl.ioctl(slave_fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))

pid = os.fork()
if pid == 0:
    os.close(master_fd)
    os.setsid()
    fcntl.ioctl(slave_fd, termios.TIOCSCTTY, 0)
    os.dup2(slave_fd, 0)
    os.dup2(slave_fd, 1)
    os.dup2(slave_fd, 2)
    if slave_fd > 2:
        os.close(slave_fd)
    try:
        os.execvp(shell, [shell, "-l"])
    except OSError:
        os.execvp(shell, [shell])

os.close(slave_fd)

stdin_fd = sys.stdin.fileno()
stdin_buf = b""
stdin_open = True
exit_code = 0

try:
    while True:
        watch = [master_fd] + ([stdin_fd] if stdin_open else [])
        try:
            rlist, _, _ = select.select(watch, [], [], 0.1)
        except InterruptedError:
            continue

        if master_fd in rlist:
            try:
                data = os.read(master_fd, 16384)
            except OSError as err:
                if err.errno in (errno.EIO, errno.EBADF):
                    break
                raise
            if not data:
                break
            sys.stdout.buffer.write(data)
            sys.stdout.buffer.flush()

        if stdin_fd in rlist:
            try:
                chunk = os.read(stdin_fd, 16384)
            except OSError:
                stdin_open = False
                break
            if not chunk:
                stdin_open = False
                break
            stdin_buf += chunk
            while b"\\n" in stdin_buf:
                line, stdin_buf = stdin_buf.split(b"\\n", 1)
                if not line:
                    continue
                try:
                    msg = json.loads(line.decode("utf-8"))
                except Exception:
                    continue
                kind = msg.get("t")
                if kind == "i":
                    raw = base64.b64decode(msg.get("d", ""))
                    view = memoryview(raw)
                    written = 0
                    while written < len(view):
                        try:
                            n = os.write(master_fd, view[written:])
                            if n <= 0:
                                break
                            written += n
                        except OSError as err:
                            if err.errno == errno.EAGAIN:
                                continue
                            break
                elif kind == "r":
                    c = max(2, int(msg.get("c", 80)))
                    r = max(2, int(msg.get("r", 24)))
                    try:
                        fcntl.ioctl(master_fd, termios.TIOCSWINSZ, struct.pack("HHHH", r, c, 0, 0))
                        os.killpg(os.getpgid(pid), signal.SIGWINCH)
                    except OSError:
                        pass

        try:
            waited_pid, status = os.waitpid(pid, os.WNOHANG)
            if waited_pid == pid:
                if os.WIFEXITED(status):
                    exit_code = os.WEXITSTATUS(status)
                elif os.WIFSIGNALED(status):
                    exit_code = 128 + os.WTERMSIG(status)
                pid = 0
                break
        except ChildProcessError:
            pid = 0
            break
finally:
    try:
        os.close(master_fd)
    except OSError:
        pass
    if pid:
        for sig in (signal.SIGHUP, signal.SIGTERM):
            try:
                os.killpg(os.getpgid(pid), sig)
            except OSError:
                try:
                    os.kill(pid, sig)
                except OSError:
                    pass
        try:
            _, status = os.waitpid(pid, 0)
            if os.WIFEXITED(status):
                exit_code = os.WEXITSTATUS(status)
            elif os.WIFSIGNALED(status):
                exit_code = 128 + os.WTERMSIG(status)
        except ChildProcessError:
            pass

sys.exit(exit_code)
`;

interface TerminalEntry {
  info: TerminalInfo;
  process: ChildProcessWithoutNullStreams;
  isPtyBridge: boolean;
  buffer: string;
}

function resolveDirectory(dir?: string): string {
  if (dir) {
    try {
      if (existsSync(dir) && statSync(dir).isDirectory()) {
        return dir;
      }
    } catch {
      // Fallback below
    }
  }
  return homedir();
}

function resolveDefaultShell(): string {
  if (process.platform === 'win32') {
    if (process.env.COMSPEC && existsSync(process.env.COMSPEC)) {
      return process.env.COMSPEC;
    }
    return 'powershell.exe';
  }
  if (process.env.SHELL && existsSync(process.env.SHELL)) {
    return process.env.SHELL;
  }
  if (process.platform === 'darwin' && existsSync('/bin/zsh')) {
    return '/bin/zsh';
  }
  if (existsSync('/bin/bash')) {
    return '/bin/bash';
  }
  return '/bin/sh';
}

function resolvePythonBinary(): string | null {
  if (process.platform === 'win32') return null;
  if (process.platform === 'darwin' && existsSync('/usr/bin/python3')) {
    return '/usr/bin/python3';
  }
  const candidates = ['/usr/bin/python3', '/usr/local/bin/python3', '/opt/homebrew/bin/python3'];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return 'python3';
}

export class TerminalHub {
  private readonly terminals = new Map<string, TerminalEntry>();
  private counter = 0;

  constructor(
    private readonly onData: (terminalId: string, data: string) => void,
    private readonly onExit: (terminalId: string, exitCode: number | null) => void,
  ) {}

  list(): TerminalInfo[] {
    return Array.from(this.terminals.values()).map((entry) => ({ ...entry.info }));
  }

  create(options?: { cwd?: string; cols?: number; rows?: number; title?: string }): TerminalInfo {
    this.counter += 1;
    const id = `term-${Date.now().toString(36)}-${this.counter}`;
    const cwd = resolveDirectory(options?.cwd);
    const shell = resolveDefaultShell();
    const cols = Math.max(2, Math.floor(options?.cols ?? 80));
    const rows = Math.max(2, Math.floor(options?.rows ?? 24));
    const title = options?.title?.trim() || basename(cwd) || basename(shell) || `Terminal ${this.counter}`;

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      TERM_PROGRAM: 'Shannon',
      LANG: process.env.LANG || 'en_US.UTF-8',
    };

    const pythonBin = resolvePythonBinary();
    const usePtyBridge = Boolean(pythonBin && process.platform !== 'win32');
    let child: ChildProcessWithoutNullStreams;

    if (usePtyBridge && pythonBin) {
      child = spawn(pythonBin, ['-u', '-c', PTY_HELPER_SCRIPT, shell, String(cols), String(rows)], {
        cwd,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } else {
      const shellArgs = process.platform === 'win32' ? [] : ['-i'];
      child = spawn(shell, shellArgs, {
        cwd,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    }

    const info: TerminalInfo = {
      id,
      title,
      cwd,
      shell,
      createdAt: new Date().toISOString(),
      exited: false,
    };

    const entry: TerminalEntry = {
      info,
      process: child,
      isPtyBridge: usePtyBridge,
      buffer: '',
    };
    this.terminals.set(id, entry);

    const stdoutDecoder = new StringDecoder('utf8');
    const stderrDecoder = new StringDecoder('utf8');

    const appendData = (chunk: string) => {
      if (!chunk) return;
      entry.buffer += chunk;
      if (entry.buffer.length > MAX_BUFFER_CHARS) {
        entry.buffer = entry.buffer.slice(-MAX_BUFFER_CHARS);
      }
      this.onData(id, chunk);
    };

    child.stdout.on('data', (raw: Buffer) => {
      appendData(stdoutDecoder.write(raw));
    });

    child.stderr.on('data', (raw: Buffer) => {
      appendData(stderrDecoder.write(raw));
    });

    child.on('error', (err) => {
      appendData(`\r\n[Terminal error: ${err.message}]\r\n`);
    });

    child.on('close', (code) => {
      const restOut = stdoutDecoder.end();
      const restErr = stderrDecoder.end();
      if (restOut) appendData(restOut);
      if (restErr) appendData(restErr);

      if (!entry.info.exited) {
        entry.info.exited = true;
        entry.info.exitCode = code ?? undefined;
        this.onExit(id, code);
      }
    });

    return { ...info };
  }

  write(terminalId: string, data: string): void {
    const entry = this.terminals.get(terminalId);
    if (!entry || entry.info.exited || !entry.process.stdin.writable) return;

    if (entry.isPtyBridge) {
      const payload = JSON.stringify({
        t: 'i',
        d: Buffer.from(data, 'utf8').toString('base64'),
      });
      entry.process.stdin.write(`${payload}\n`);
    } else {
      entry.process.stdin.write(data);
    }
  }

  resize(terminalId: string, cols: number, rows: number): void {
    const entry = this.terminals.get(terminalId);
    if (!entry || entry.info.exited || !entry.isPtyBridge || !entry.process.stdin.writable) return;

    const safeCols = Math.max(2, Math.floor(cols));
    const safeRows = Math.max(2, Math.floor(rows));
    const payload = JSON.stringify({ t: 'r', c: safeCols, r: safeRows });
    entry.process.stdin.write(`${payload}\n`);
  }

  getBuffer(terminalId: string): string {
    return this.terminals.get(terminalId)?.buffer ?? '';
  }

  kill(terminalId: string): void {
    const entry = this.terminals.get(terminalId);
    if (!entry) return;
    this.terminals.delete(terminalId);
    this.terminateEntry(entry);
  }

  disposeAll(): void {
    const entries = Array.from(this.terminals.values());
    this.terminals.clear();
    for (const entry of entries) {
      this.terminateEntry(entry);
    }
  }

  private terminateEntry(entry: TerminalEntry): void {
    entry.info.exited = true;
    const child = entry.process;

    try {
      if (child.stdin.writable) {
        child.stdin.end();
      }
    } catch {
      // Ignore
    }

    if (child.exitCode !== null || child.killed) return;

    try {
      child.kill('SIGTERM');
    } catch {
      // Ignore
    }

    const forceTimer = setTimeout(() => {
      if (child.exitCode === null && !child.killed) {
        try {
          child.kill('SIGKILL');
        } catch {
          // Ignore
        }
      }
    }, 600);
    forceTimer.unref?.();
  }
}
