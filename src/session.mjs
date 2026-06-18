// src/session.mjs — SessionManager
import { readdirSync, readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, rmSync, statSync } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';
import { randomUUID } from 'crypto';

const DEFAULT_SESSION_DIR = join(homedir(), '.zsh-pi', 'sessions');
const CURRENT_SESSION_POINTER = join(homedir(), '.zsh-pi', 'current-session');
const MAX_CONTEXT_TURNS = 50;

export class SessionManager {
  constructor(sessionDir = null) {
    this.sessionDir = sessionDir || DEFAULT_SESSION_DIR;
    this._currentSessionFile = null;
    this._seq = 0;
    if (!existsSync(this.sessionDir)) {
      mkdirSync(this.sessionDir, { recursive: true });
    }
    // 确保 ~/.zsh-pi/ 存在（存放 current-session 指针文件）
    const piDir = homedir() + '/.zsh-pi';
    if (!existsSync(piDir)) {
      mkdirSync(piDir, { recursive: true });
    }
  }

  /**
   * 获取当前会话文件路径（惰性初始化）
   */
  getCurrentSessionFile() {
    if (this._currentSessionFile) return this._currentSessionFile;
    // Try to resume existing session from pointer file
    try {
      const savedPath = readFileSync(CURRENT_SESSION_POINTER, 'utf-8').trim();
      if (savedPath && existsSync(savedPath)) {
        this._currentSessionFile = savedPath;
        // Count existing turns to set seq correctly
        const content = readFileSync(savedPath, 'utf-8');
        this._seq = content.split('\n').filter(l => l.includes('"type":"turn"')).length;
        return savedPath;
      }
    } catch {}
    return this.start();
  }

  /**
   * 创建新的会话文件。
   * 文件名: YYYY-MM-DDTHH-mm-ss-SSS_Z_cuid.jsonl
   */
  start() {
    const now = new Date();
    const ts = now.toISOString().replace(/[:.]/g, '-');
    const id = randomUUID();
    const filename = `${ts}_${id}.jsonl`;
    const filepath = join(this.sessionDir, filename);
    this._currentSessionFile = filepath;
    this._seq = 0;

    const header = {
      type: 'session',
      version: 1,
      id,
      createdAt: now.toISOString(),
      cwd: process.cwd(),
      pid: process.pid,
    };
    writeFileSync(filepath, JSON.stringify(header) + '\n', 'utf-8');
    // Save current session pointer for cross-process resume
    try { mkdirSync(join(homedir(), '.zsh-ai'), { recursive: true }); } catch {}
    writeFileSync(CURRENT_SESSION_POINTER, this._currentSessionFile, 'utf-8');
    return filepath;
  }

  /**
   * 追加一个轮次（用户的输入 + AI 的完整交互）
   */
  appendTurn(input, turnData) {
    const filepath = this.getCurrentSessionFile();
    this._seq++;
    const turnHeader = {
      type: 'turn',
      seq: this._seq,
      input,
      timestamp: new Date().toISOString(),
    };
    appendFileSync(filepath, JSON.stringify(turnHeader) + '\n', 'utf-8');
    for (const event of turnData) {
      appendFileSync(filepath, JSON.stringify({ ...event, seq: this._seq }) + '\n', 'utf-8');
    }
    const turnEnd = { type: 'turn_end', seq: this._seq, timestamp: new Date().toISOString() };
    appendFileSync(filepath, JSON.stringify(turnEnd) + '\n', 'utf-8');
  }

  /**
   * 获取最近 N 轮互动的文本摘要，用于上下文注入。
   */
  getRecentContext(n = MAX_CONTEXT_TURNS) {
    if (!this._currentSessionFile || !existsSync(this._currentSessionFile)) return '';
    const content = readFileSync(this._currentSessionFile, 'utf-8');
    const lines = content.trim().split('\n').filter(l => l);
    const turns = [];
    let currentTurn = null;
    for (const line of lines) {
      const ev = JSON.parse(line);
      if (ev.type === 'turn') {
        currentTurn = { input: ev.input, outputs: [] };
        turns.push(currentTurn);
      } else if (ev.type === 'text' && currentTurn) {
        currentTurn.outputs.push(ev.content);
      } else if (ev.type === 'turn_end' && currentTurn) {
        currentTurn = null;
      }
    }
    const recent = turns.slice(-n);
    return recent.map(t => `用户: ${t.input}\nAI: ${t.outputs.join('\n')}`).join('\n---\n');
  }

  /**
   * 列出所有会话文件
   */
  list() {
    const files = this._getAllSessions();
    if (files.length === 0) {
      console.log('暂无会话记录。');
      return;
    }
    console.log('会话列表:');
    console.log('─'.repeat(60));
    for (const f of files) {
      const content = readFileSync(f, 'utf-8');
      const firstLine = content.split('\n')[0];
      const data = JSON.parse(firstLine);
      const age = this._ageString(new Date(data.createdAt));
      const basenameStr = f.split('/').pop().slice(0, 30);
      console.log(`  ${basenameStr.padEnd(32)} ${data.cwd.padEnd(24)} ${age}`);
    }
  }

  /**
   * 查看某个会话详情（通过文件路径或 id 前缀匹配）
   */
  show(idOrPath) {
    const files = this._getAllSessions();
    const match = files.find(f => f.includes(idOrPath));
    if (!match) {
      console.error(`未找到匹配的会话: ${idOrPath}`);
      return;
    }
    const content = readFileSync(match, 'utf-8');
    const lines = content.trim().split('\n').filter(l => l);
    for (const line of lines) {
      const ev = JSON.parse(line);
      if (ev.type === 'session') {
        console.log(`会话: ${ev.id}`);
        console.log(`创建时间: ${ev.createdAt}`);
        console.log(`工作目录: ${ev.cwd}`);
        console.log('─'.repeat(40));
      } else if (ev.type === 'turn') {
        console.log(`\n[第 ${ev.seq} 轮] 用户: ${ev.input}`);
      } else if (ev.type === 'text') {
        console.log(`  AI: ${ev.content.slice(0, 200)}${ev.content.length > 200 ? '...' : ''}`);
      }
    }
  }

  /**
   * 清理会话
   */
  clean(flags) {
    const days = flags.days || 30;
    const all = flags.all;
    const interactive = flags.interactive;
    const dryRun = flags.dryRun ?? flags['dry-run'];

    const files = this._getAllSessions();
    const cutoff = all ? null : Date.now() - days * 24 * 60 * 60 * 1000;

    const toDelete = files.filter(f => {
      if (!cutoff) return true;
      const content = readFileSync(f, 'utf-8');
      const firstLine = content.split('\n')[0];
      const data = JSON.parse(firstLine);
      const createdAt = new Date(data.createdAt).getTime();
      return createdAt < cutoff;
    });

    if (toDelete.length === 0) {
      console.log('没有需要清理的会话文件。');
      return;
    }

    if (dryRun) {
      console.log(`[模拟] 将删除 ${toDelete.length} 个会话文件:`);
      toDelete.forEach(f => console.log(`  ${basename(f)}`));
      return;
    }

    if (interactive) {
      console.log(`找到 ${toDelete.length} 个可清理的会话:`);
      toDelete.forEach((f, i) => {
        const content = readFileSync(f, 'utf-8');
        const firstLine = content.split('\n')[0];
        const data = JSON.parse(firstLine);
        console.log(`  [${i + 1}] ${basename(f)} — ${data.cwd} (${data.createdAt})`);
      });
      console.log('提示: 使用 --dry-run 预览，或直接不带 --interactive 运行以确认删除。');
      return;
    }

    for (const f of toDelete) {
      rmSync(f);
    }
    console.log(`已清理 ${toDelete.length} 个会话文件。`);
  }

  _getAllSessions() {
    if (!existsSync(this.sessionDir)) return [];
    return readdirSync(this.sessionDir)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => join(this.sessionDir, f))
      .sort()
      .reverse();
  }

  _ageString(date) {
    const diff = Date.now() - date.getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return '刚刚';
    if (hours < 24) return `${hours} 小时前`;
    const days = Math.floor(hours / 24);
    return `${days} 天前`;
  }
}
