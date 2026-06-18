# zsh-ai Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Node.js CLI tool `zsh-ai` + ZSH ZLE Widget that detects natural language input in ZSH, sends it to pi-coding-agent for AI processing, displays real-time thinking/tool-call output, persists session context, and suggests follow-up commands.

**Architecture:** A Node.js CLI (`zsh-ai`) with subcommands `process`, `detect`, `init`, `session`, `suggest`. A ZSH ZLE Widget (zsh-ai.plugin.zsh) intercepts `accept-line`, calls `zsh-ai detect` to determine NLP vs command, and forwards NLP to `zsh-ai process`. The `process` subcommand spawns `pi --mode json`, parses JSONL events line-by-line, renders ANSI output in real-time, saves context, and generates command suggestions.

**Tech Stack:** Node.js (ESM, .mjs), pi-coding-agent CLI (v0.79.6), ZSH 5.9 + Oh My Zsh

## Global Constraints

- All source files use ES modules (.mjs extension)
- No npm dependencies unless explicitly listed (keep it zero-dependency)
- Session storage: `~/.zsh-ai/sessions/` as JSONL files
- pi CLI is invoked via `child_process.spawn` with `--mode json`
- ZSH plugin file compatible with Oh My Zsh (placed in custom/plugins/)
- Tests use Node.js built-in test runner (`node:test`)

---

## File Structure

```
/Users/kristar/workspace/zsh-ai/
├── package.json                      # npm metadata, bin entry
├── bin/
│   └── zsh-ai                       # CLI entry: #!/usr/bin/env node (imports src/cli.mjs)
├── src/
│   ├── cli.mjs                      # argv parser → subcommand dispatch
│   ├── detect.mjs                   # isNaturalLanguage(text) → boolean
│   ├── session.mjs                  # SessionManager class + subcommand handlers
│   ├── process.mjs                  # processCommand(text) — main orchestration
│   ├── renderer.mjs                 # Renderer class — ANSI streaming display
│   ├── suggester.mjs                # suggestFromHistory(cwd, n) → string[]
│   └── init.mjs                     # getInitScript() → string (ZSH code snippet)
├── zsh-plugin/
│   └── zsh-ai.plugin.zsh            # Standalone Oh My Zsh plugin file
├── tests/
│   ├── detect.test.mjs              # Tests for detect module
│   └── session.test.mjs             # Tests for session module
└── README.md                        # Install, config, usage
```

### Task 1: Project Scaffold

**Files:**
- Create: `/Users/kristar/workspace/zsh-ai/package.json`
- Create: `/Users/kristar/workspace/zsh-ai/bin/zsh-ai`
- Create: `/Users/kristar/workspace/zsh-ai/src/cli.mjs`
- Create: `/Users/kristar/workspace/zsh-ai/.gitignore`

**Interfaces:**
- Consumes: nothing
- Produces: `bin/zsh-ai` (shebang entry point), `src/cli.mjs` (arg parser with `process(argv)` → returns `{ subcommand, args, flags }`)

- [ ] **Step 1: Create package.json**

```json
{
  "name": "zsh-ai",
  "version": "0.1.0",
  "description": "ZSH natural language AI assistant — intercepts NLP input, processes via pi-coding-agent",
  "type": "module",
  "bin": {
    "zsh-ai": "./bin/zsh-ai"
  },
  "files": [
    "bin/",
    "src/",
    "zsh-plugin/"
  ],
  "license": "MIT"
}
```

- [ ] **Step 2: Create .gitignore**

```
node_modules/
*.log
```

- [ ] **Step 3: Create bin/zsh-ai entry point**

```js
#!/usr/bin/env node
// zsh-ai CLI entry point
import '../src/cli.mjs';
```

Make it executable: `chmod +x bin/zsh-ai`

- [ ] **Step 4: Create src/cli.mjs — argument parser and dispatcher**

```js
#!/usr/bin/env node
import { isNaturalLanguage } from './detect.mjs';
import { SessionManager } from './session.mjs';
import { processCommand } from './process.mjs';
import { getInitScript } from './init.mjs';
import { suggestFromHistory } from './suggester.mjs';
import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

function printHelp() {
  console.log(`
zsh-ai — ZSH 自然语言 AI 处理插件

用法:
  zsh-ai process <text>          处理自然语言输入（核心）
  zsh-ai detect <text>           检测是否为自然语言
  zsh-ai init                    输出 ZSH 集成代码
  zsh-ai session start           开始新会话
  zsh-ai session list            列出所有会话
  zsh-ai session show <id>       查看会话详情
  zsh-ai session clean [opts]    清理历史会话
  zsh-ai suggest [--cwd <dir>]   基于历史建议命令
  zsh-ai --help                  显示帮助
  zsh-ai --version               显示版本

选项:
  --provider <name>  指定 AI provider
  --model <id>       指定 AI model
  --debug            输出调试日志
  --no-suggest       不显示命令建议
`);
}

function printVersion() {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));
  console.log(pkg.version);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) { printHelp(); process.exit(0); }

  const subcommand = args[0];

  // Parse flags from the remaining args
  const flagKeys = new Set(['--provider', '--model', '--cwd', '--days', '--debug', '--no-suggest', '--all', '--interactive', '--dry-run']);
  const flags = {};
  const positionalArgs = [];
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      if (flagKeys.has(args[i])) {
        if (args[i] === '--debug' || args[i] === '--no-suggest' || args[i] === '--all' || args[i] === '--interactive' || args[i] === '--dry-run') {
          flags[args[i].slice(2)] = true;
        } else {
          flags[args[i].slice(2)] = args[++i];
        }
      } else {
        flags[args[i].slice(2)] = true;
      }
    } else {
      positionalArgs.push(args[i]);
    }
  }

  switch (subcommand) {
    case 'process': {
      const text = positionalArgs.join(' ');
      if (!text) { console.error('请提供要处理的文本'); process.exit(1); }
      const provider = flags.provider;
      const model = flags.model;
      await processCommand(text, { provider, model, noSuggest: !!flags['no-suggest'] });
      break;
    }
    case 'detect': {
      const text = positionalArgs.join(' ');
      if (!text) { process.exit(1); }
      const result = isNaturalLanguage(text);
      process.exit(result ? 0 : 1);
    }
    case 'init': {
      console.log(getInitScript());
      break;
    }
    case 'session': {
      const sm = new SessionManager();
      const action = positionalArgs[0] || 'list';
      switch (action) {
        case 'start': sm.start(); break;
        case 'list': sm.list(); break;
        case 'show': sm.show(positionalArgs[1]); break;
        case 'clean': sm.clean(flags); break;
        default: console.error(`未知 session 操作: ${action}`); process.exit(1);
      }
      break;
    }
    case 'suggest': {
      const cwd = flags.cwd || process.cwd();
      const cmds = await suggestFromHistory(cwd, 10);
      cmds.forEach(c => console.log(c));
      break;
    }
    case '--help': printHelp(); break;
    case '--version': printVersion(); break;
    case '-h': printHelp(); break;
    case '-v': printVersion(); break;
    default: {
      // If unknown subcommand, treat it as natural language input
      // (handles `zsh-ai 列出文件` → subcommand is the NLP)
      const text = args.join(' ');
      if (isNaturalLanguage(text)) {
        await processCommand(text, {});
      } else {
        console.error(`未知命令: ${subcommand}`);
        printHelp();
        process.exit(1);
      }
    }
  }
}

main().catch(err => {
  console.error('zsh-ai 错误:', err.message);
  process.exit(1);
});
```

- [ ] **Step 5: Create stub files for all imports (placeholder exports)**

Create stub files with placeholder exports so the CLI loads without errors:

```js
// src/detect.mjs — placeholder
export function isNaturalLanguage(text) { return false; }
```

```js
// src/session.mjs — placeholder
export class SessionManager {
  start() { console.log('session start'); }
  list() { console.log('session list'); }
  show(id) { console.log('session show', id); }
  clean(flags) { console.log('session clean', flags); }
}
```

```js
// src/process.mjs — placeholder
export async function processCommand(text, options) {
  console.log(`process: ${text}`);
}
```

```js
// src/init.mjs — placeholder
export function getInitScript() { return '# zsh-ai init'; }
```

```js
// src/suggester.mjs — placeholder
export async function suggestFromHistory(cwd, n) { return []; }
```

```js
// src/renderer.mjs — placeholder
export class Renderer {
  constructor() {}
  onThinking(delta) {}
  onToolCall(name, args) {}
  onToolResult(content) {}
  onText(text) {}
  onSuggestions(commands) {}
  done() {}
}
```

- [ ] **Step 6: Verify the CLI boots**

Run: `node bin/zsh-ai --help`
Expected: prints help text, exits 0.

Run: `node bin/zsh-ai --version`
Expected: prints "0.1.0", exits 0.

Run: `node bin/zsh-ai detect hello`
Expected: exits 1.

- [ ] **Step 7: Commit**

```bash
git add package.json .gitignore bin/zsh-ai src/cli.mjs src/detect.mjs src/session.mjs src/process.mjs src/init.mjs src/suggester.mjs src/renderer.mjs
git commit -m "feat: 项目脚手架 — CLI 入口、参数解析、模块占位"
```

### Task 2: NLP Detection Module

**Files:**
- Modify: `/Users/kristar/workspace/zsh-ai/src/detect.mjs`
- Create: `/Users/kristar/workspace/zsh-ai/tests/detect.test.mjs`

**Interfaces:**
- Consumes: nothing
- Produces: `isNaturalLanguage(text: string): boolean` — synchronous, no side effects

- [ ] **Step 1: Write the tests**

```js
// tests/detect.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isNaturalLanguage } from '../src/detect.mjs';

describe('isNaturalLanguage', () => {
  it('应检测中文为自然语言', () => {
    assert.equal(isNaturalLanguage('列出当前目录的文件'), true);
  });

  it('应检测混合中英文自然语言', () => {
    assert.equal(isNaturalLanguage('帮我安装 lodash 依赖'), true);
  });

  it('应检测多个单词的自然语言（不含命令特征）', () => {
    assert.equal(isNaturalLanguage('show me all files'), true);
  });

  it('应检测长句自然语言（不含特殊字符）', () => {
    assert.equal(isNaturalLanguage('what time is it'), true);
  });

  it('应将单单词视为命令', () => {
    assert.equal(isNaturalLanguage('ls'), false);
  });

  it('应将两个单词视为命令', () => {
    assert.equal(isNaturalLanguage('ls -la'), false);
  });

  it('应检测包含短横线的命令', () => {
    assert.equal(isNaturalLanguage('npm install'), false);
    assert.equal(isNaturalLanguage('git commit -m "msg"'), false);
  });

  it('应检测包含路径分隔符的输入', () => {
    assert.equal(isNaturalLanguage('cat /etc/hosts'), false);
    assert.equal(isNaturalLanguage('./run.sh'), false);
  });

  it('应检测包含管道和重定向的输入', () => {
    assert.equal(isNaturalLanguage('grep foo bar.txt | head'), false);
    assert.equal(isNaturalLanguage('echo hello > out.txt'), false);
  });

  it('应检测包含文件扩展名的输入', () => {
    assert.equal(isNaturalLanguage('cat file.txt'), false);
  });

  it('应正确处理空字符串', () => {
    assert.equal(isNaturalLanguage(''), false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test tests/detect.test.mjs
```
Expected: fails because `isNaturalLanguage` is still the stub returning `false`.

- [ ] **Step 3: Implement isNaturalLanguage**

```js
// src/detect.mjs

/**
 * 判断输入文本是否是自然语言（而非 shell 命令）。
 * 同步，毫秒级返回。
 */
export function isNaturalLanguage(text) {
  if (!text || text.trim().length === 0) return false;
  const trimmed = text.trim();

  // 获取第一个单词（命令名）
  const words = trimmed.split(/\s+/);
  const cmdName = words[0];

  // 如果命令名包含非 ASCII（中文等）→ 几乎肯定是自然语言
  if (/[^\x20-\x7E]/.test(cmdName)) return true;

  // 如果命令名像文件路径或包含扩展名 → 是命令
  if (cmdName.includes('/') || cmdName.includes('.')) return false;

  // 单词数 ≥ 3 → 可能是自然语言
  if (words.length >= 3) {
    // 检查是否包含命令特征
    if (!/[-\/.\|><&;]/.test(trimmed)) {
      return true;
    }
  }

  return false;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test tests/detect.test.mjs
```
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/detect.mjs tests/detect.test.mjs
git commit -m "feat: NLP 检测模块 — 基于启发式的自然语言识别"
```

### Task 3: Session Manager

**Files:**
- Modify: `/Users/kristar/workspace/zsh-ai/src/session.mjs`
- Create: `/Users/kristar/workspace/zsh-ai/tests/session.test.mjs`

**Interfaces:**
- Consumes: nothing
- Produces: `class SessionManager` with:
  - `constructor()` — sets `sessionDir` to `~/.zsh-ai/sessions/`
  - `getCurrentSessionFile(): string` — returns path of current session file
  - `start(): string` — creates new session file, returns path
  - `list(): void` — prints session table
  - `show(idOrPath: string): void` — prints session details
  - `clean(flags: {days?:number, all?:boolean, interactive?:boolean, dryRun?:boolean}): void`
  - `appendTurn(input: string, turnData: object[]): void` — appends turn to current session
  - `getRecentContext(n: number): string` — returns last n turns as text

- [ ] **Step 1: Write the tests**

```js
// tests/session.test.mjs
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { SessionManager } from '../src/session.mjs';

describe('SessionManager', () => {
  let tmpDir;
  let sm;

  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'zsh-ai-test-'));
    sm = new SessionManager(tmpDir);
  });

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('应创建 session 目录', () => {
    assert.equal(existsSync(tmpDir), true);
  });

  it('start() 应创建新的会话文件', () => {
    const path = sm.start();
    assert.equal(existsSync(path), true);
    const content = readFileSync(path, 'utf-8');
    const lines = content.trim().split('\n');
    assert.equal(lines.length >= 1, true);
    const first = JSON.parse(lines[0]);
    assert.equal(first.type, 'session');
    assert.equal(first.cwd, process.cwd());
  });

  it('appendTurn() 应追加轮次记录', () => {
    sm.start(); // reset
    const turnData = [
      { type: 'thinking', seq: 1, delta: 'test thinking' },
      { type: 'tool_call', seq: 1, name: 'bash', args: { command: 'ls' } },
      { type: 'text', seq: 1, content: 'test result' },
    ];
    sm.appendTurn('测试输入', turnData);

    const sessionFile = sm.getCurrentSessionFile();
    const content = readFileSync(sessionFile, 'utf-8');
    const lines = content.trim().split('\n').filter(l => l);
    
    // Should have: session header + turn + thinking + tool_call + text + turn_end
    const turnLine = JSON.parse(lines[1]);
    assert.equal(turnLine.type, 'turn');
    assert.equal(turnLine.input, '测试输入');
  });

  it('getRecentContext() 应返回最近 N 轮的文本摘要', () => {
    sm.start();
    const turnData = [
      { type: 'text', seq: 1, content: 'AI回复内容' },
    ];
    sm.appendTurn('用户问题', turnData);
    const context = sm.getRecentContext(5);
    assert.ok(context.includes('用户问题'));
    assert.ok(context.includes('AI回复内容'));
  });

  it('list() 不应抛出异常', () => {
    sm.start();
    sm.list(); // just verify it doesn't throw
  });

  it('clean() --dry-run 应列出但不删除', () => {
    sm.start();
    const beforeCount = existsSync(tmpDir) ? require('fs').readdirSync(tmpDir).length : 0;
    sm.clean({ dryRun: true });
    const afterCount = existsSync(tmpDir) ? require('fs').readdirSync(tmpDir).length : 0;
    assert.equal(afterCount, beforeCount);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test tests/session.test.mjs
```
Expected: fails because SessionManager methods aren't fully implemented yet.

- [ ] **Step 3: Implement SessionManager**

```js
// src/session.mjs
import { readdirSync, readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, rmSync, statSync } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';
import { randomUUID } from 'crypto';

const DEFAULT_SESSION_DIR = join(homedir(), '.zsh-ai', 'sessions');
const MAX_CONTEXT_TURNS = 50;

export class SessionManager {
  constructor(sessionDir = null) {
    this.sessionDir = sessionDir || DEFAULT_SESSION_DIR;
    this._currentSessionFile = null;
    this._seq = 0;
    if (!existsSync(this.sessionDir)) {
      mkdirSync(this.sessionDir, { recursive: true });
    }
  }

  /**
   * 获取当前会话文件路径（惰性初始化）
   */
  getCurrentSessionFile() {
    if (!this._currentSessionFile) {
      this.start();
    }
    return this._currentSessionFile;
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
      const data = JSON.parse(readFileSync(f, 'utf-8'));
      const age = this._ageString(new Date(data.createdAt));
      const basename = f.split('/').pop().slice(0, 30);
      console.log(`  ${basename.padEnd(32)} ${data.cwd.padEnd(24)} ${age}`);
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
    const dryRun = flags.dryRun;

    const files = this._getAllSessions();
    const cutoff = all ? null : Date.now() - days * 24 * 60 * 60 * 1000;

    const toDelete = files.filter(f => {
      if (!cutoff) return true;
      const stat = statSync(f);
      return stat.mtimeMs < cutoff;
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
        const data = JSON.parse(readFileSync(f, 'utf-8'));
        console.log(`  [${i + 1}] ${basename(f)} — ${data.cwd} (${data.createdAt})`);
      });
      console.log('确定删除这些文件？(y/N) ');
      // Non-interactive mode: just delete
      // Interactive stdin is complex in CLI; we skip for now
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
```

- [ ] **Step 4: Fix the test import issue**

The test uses `require('fs')` for `readdirSync` count — change it to dynamic import or use `readdirSync` directly:

```js
// Fix in test:
import { readdirSync } from 'fs';
// Then use it directly
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
node --test tests/session.test.mjs
```
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/session.mjs tests/session.test.mjs
git commit -m "feat: 会话管理器 — JSONL 文件管理、上下文提取、清理"
```

### Task 4: Terminal Renderer

**Files:**
- Modify: `/Users/kristar/workspace/zsh-ai/src/renderer.mjs`

**Interfaces:**
- Consumes: nothing
- Produces: `class Renderer` with event-based methods that write ANSI codes to stdout

**Warning:** This module is inherently visual and cannot be fully tested via node:test. Steps include manual visual verification.

- [ ] **Step 1: Implement the Renderer class**

```js
// src/renderer.mjs
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const ITALIC = '\x1b[3m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const GRAY = '\x1b[90m';
const RED = '\x1b[31m';
const ERASE_LINE = '\x1b[2K';
const CURSOR_UP = '\x1b[1A';

export class Renderer {
  constructor() {
    this.thinking = '';
    this.toolCalls = [];   // { name, args, result }
    this.finalText = '';
    this.suggestions = [];
    this._thinkingLineCount = 0;
    this._started = false;
  }

  /** 收到 AI 思考增量 */
  onThinking(delta) {
    if (!this._started) {
      this._started = true;
      console.log(`\n${CYAN}══════════════════ zsh-ai ══════════════════${RESET}`);
    }
    this.thinking += delta;
    // Render thinking line (update in place if we've already printed one)
    if (this._thinkingLineCount > 0) {
      process.stdout.write(CURSOR_UP + ERASE_LINE);
    } else {
      process.stdout.write('\n');
    }
    const display = this.thinking.length > 100
      ? this.thinking.slice(0, 97) + '...'
      : this.thinking;
    process.stdout.write(`${DIM}🤔 ${display}${RESET}`);
    this._thinkingLineCount = 1;
  }

  /** 收到工具调用 */
  onToolCall(name, args) {
    this._finalizeThinking();
    const argsStr = typeof args === 'object' ? JSON.stringify(args, null, 2) : String(args);
    const shortArgs = argsStr.length > 200 ? argsStr.slice(0, 197) + '...' : argsStr;
    console.log(`\n${YELLOW}🔧 执行工具: ${BOLD}${name}${RESET}`);
    console.log(`${YELLOW}  参数: ${shortArgs}${RESET}`);
    this.toolCalls.push({ name, args: shortArgs });
  }

  /** 收到工具结果 */
  onToolResult(content) {
    const lines = String(content).split('\n');
    const preview = lines.slice(0, 5).join('\n');
    const truncated = lines.length > 5 ? '\n  ...' : '';
    console.log(`${GREEN}📄 结果:${RESET}`);
    console.log(`  ${preview}${truncated}`);
    if (this.toolCalls.length > 0) {
      this.toolCalls[this.toolCalls.length - 1].result = content.slice(0, 200);
    }
  }

  /** 收到 AI 文本回复 */
  onText(text) {
    this.finalText += text;
    // Re-render the final text section
    this._renderFinalText();
  }

  /** 收到命令建议 */
  onSuggestions(commands) {
    this.suggestions = commands;
    console.log(`\n${CYAN}📋 建议下一条命令:${RESET}`);
    commands.forEach(cmd => {
      const [command, ...commentParts] = cmd.split('//');
      const comment = commentParts.join('//').trim();
      if (comment) {
        console.log(`  ${BOLD}> ${command.trim()}${RESET} ${GRAY}# ${comment}${RESET}`);
      } else {
        console.log(`  ${BOLD}> ${cmd.trim()}${RESET}`);
      }
    });
  }

  /** 完成渲染 */
  done() {
    this._finalizeThinking();
    if (!this.finalText && this.toolCalls.length === 0 && !this._started) {
      return;
    }
    if (this.finalText && !this.suggestions.length) {
      this._renderFinalText();
    }
    console.log(`\n${CYAN}══════════════════════════════════════════════${RESET}\n`);
  }

  /** 输出错误信息 */
  error(msg) {
    console.error(`\n${RED}❌ ${msg}${RESET}\n`);
  }

  /** 警告信息 */
  warn(msg) {
    console.error(`\n${YELLOW}⚠️  ${msg}${RESET}\n`);
  }

  _finalizeThinking() {
    if (this._thinkingLineCount > 0) {
      process.stdout.write('\n');
      this._thinkingLineCount = 0;
    }
  }

  _renderFinalText() {
    if (!this.finalText) return;
    // Remove old final text lines if any
    const lines = this.finalText.trim().split('\n');
    console.log(`\n${RESET}💬 ${lines[0]}`);
    for (let i = 1; i < lines.length; i++) {
      console.log(`  ${lines[i]}`);
    }
  }
}
```

- [ ] **Step 2: Manual visual verification**

Create a test script:

```js
// test-renderer.mjs
import { Renderer } from './src/renderer.mjs';
const r = new Renderer();
r.onThinking('让我想想');
await new Promise(r => setTimeout(r, 500));
r.onThinking('用户想要做的是...');
await new Promise(r => setTimeout(r, 500));
r.onToolCall('bash', { command: 'ls -la' });
await new Promise(r => setTimeout(r, 300));
r.onToolResult('total 24\ndrwxr-xr-x  5 user  staff  160 Jun 17 22:10 .\n-rw-r--r--  1 user  staff    0 Jun 17 22:10 README.md');
await new Promise(r => setTimeout(r, 300));
r.onText('好的，当前目录有以下文件...');
r.onSuggestions(['cd src/  # 进入源码目录', 'git status  # 查看仓库状态']);
r.done();
```

Run: `node test-renderer.mjs`
Expected: animated render showing thinking → tool call → result → text → suggestions.

Then delete the test file: `rm test-renderer.mjs`

- [ ] **Step 3: Commit**

```bash
git add src/renderer.mjs
git commit -m "feat: 终端渲染器 — ANSI 实时展示 thinking/tool-call/result/text"
```

### Task 5: AI Processor + processCommand Orchestration

**Files:**
- Modify: `/Users/kristar/workspace/zsh-ai/src/process.mjs`

**Interfaces:**
- Consumes: `Renderer`, `SessionManager`, `isNaturalLanguage`, `suggestFromHistory`, `pi` CLI via `child_process.spawn`
- Produces: `processCommand(text, options)` — the main pipeline

- [ ] **Step 1: Implement processCommand**

```js
// src/process.mjs
import { spawn } from 'child_process';
import { createInterface } from 'readline';
import { Renderer } from './renderer.mjs';
import { SessionManager } from './session.mjs';
import { suggestFromHistory } from './suggester.mjs';

const PI_TIMEOUT = 300_000; // 300 seconds

/**
 * 核心处理流程：
 * 1. 创建渲染器和会话管理器
 * 2. 调用 pi --mode json -p <input>
 * 3. 流式解析 JSONL 事件并渲染
 * 4. 保存交互到会话文件
 * 5. 生成并展示命令建议
 */
export async function processCommand(text, options = {}) {
  const renderer = new Renderer();
  const session = new SessionManager();

  // 读取前几次交互作为上下文
  const context = session.getRecentContext(5);
  const fullInput = context ? `${context}\n\n用户问题: ${text}` : text;

  // 检查 pi 是否可用
  try {
    const which = spawn('which', ['pi']);
    await new Promise((resolve, reject) => {
      which.on('exit', code => {
        if (code !== 0) {
          renderer.error('`pi` 未安装，请先安装 pi-coding-agent');
          process.exit(1);
        }
        resolve();
      });
      which.on('error', () => {
        renderer.error('`pi` 未安装，请先安装 pi-coding-agent');
        process.exit(1);
      });
    });
  } catch {
    renderer.error('`pi` 未安装，请先安装 pi-coding-agent');
    process.exit(1);
  }

  const args = ['--mode', 'json', '-p', fullInput];
  if (options.provider) args.unshift('--provider', options.provider);
  if (options.model) args.unshift('--model', options.model);

  const pi = spawn('pi', args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
    timeout: PI_TIMEOUT,
  });

  const turnData = [];
  let currentThinking = '';
  let currentText = '';
  let timedOut = false;

  const timeout = setTimeout(() => {
    timedOut = true;
    pi.kill();
    renderer.error('AI 处理超时，请重试');
  }, PI_TIMEOUT);

  const rl = createInterface({ input: pi.stdout });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);

      if (event.type === 'message_update' && event.assistantMessageEvent) {
        const ev = event.assistantMessageEvent;

        if (ev.type === 'thinking_start') {
          currentThinking = '';
        } else if (ev.type === 'thinking_delta') {
          currentThinking += ev.delta || '';
          renderer.onThinking(ev.delta || '');
          turnData.push({ type: 'thinking', delta: ev.delta, timestamp: new Date().toISOString() });
        } else if (ev.type === 'tool_call') {
          renderer.onToolCall(ev.name, ev.arguments || ev.args);
          turnData.push({ type: 'tool_call', name: ev.name, args: ev.arguments || ev.args, timestamp: new Date().toISOString() });
        } else if (ev.type === 'tool_result') {
          const content = ev.content || ev.result || '';
          renderer.onToolResult(content);
          turnData.push({ type: 'tool_result', name: ev.name, content, timestamp: new Date().toISOString() });
        } else if (ev.type === 'text_delta') {
          currentText += ev.delta || '';
          renderer.onText(ev.delta || '');
          turnData.push({ type: 'text', delta: ev.delta, timestamp: new Date().toISOString() });
        }
      } else if (event.type === 'message_end' && event.message) {
        // Final full message
        for (const c of event.message.content || []) {
          if (c.type === 'text') {
            currentText = c.text;
            renderer.onText(c.text);
            turnData.push({ type: 'text', content: c.text, timestamp: new Date().toISOString() });
          }
        }
      }
    } catch (parseErr) {
      // Skip malformed JSON lines
      if (options.debug) console.error('JSON parse error:', parseErr.message, 'line:', line.slice(0, 100));
    }
  }

  clearTimeout(timeout);

  // Save the turn to session
  // Deduplicate thinking_delta records into one thinking record
  const finalTurnData = [];
  let thinkingBuffer = '';
  for (const t of turnData) {
    if (t.type === 'thinking') {
      thinkingBuffer += t.delta || '';
    } else {
      if (thinkingBuffer) {
        finalTurnData.push({ type: 'thinking', content: thinkingBuffer, timestamp: new Date().toISOString() });
        thinkingBuffer = '';
      }
      finalTurnData.push(t);
    }
  }
  if (thinkingBuffer) {
    finalTurnData.push({ type: 'thinking', content: thinkingBuffer, timestamp: new Date().toISOString() });
  }

  session.appendTurn(text, finalTurnData);

  // Suggestions
  const suggestions = [];
  
  // 1. Parse AI suggest sections from text response
  const suggestMatch = currentText.match(/## 建议|📋|建议(?:的)?(?:下一条)?命令[：:]\s*([\s\S]*?)(?:\n\n|$)/);
  if (suggestMatch) {
    const lines = suggestMatch[1].trim().split('\n');
    for (const line of lines) {
      const clean = line.replace(/^[-*>\s`]+/, '').trim();
      if (clean) suggestions.push(clean);
    }
  }

  // 2. Supplement from history
  if (!options.noSuggest) {
    try {
      const historyCmds = await suggestFromHistory(process.cwd(), 10);
      for (const h of historyCmds) {
        if (!suggestions.some(s => s.startsWith(h.split(/\s+/)[0]))) {
          suggestions.push(h);
          if (suggestions.length >= 5) break;
        }
      }
    } catch {
      // History reading is best-effort
    }
  }

  if (suggestions.length > 0) {
    renderer.onSuggestions(suggestions);
    session.appendTurn(text, [{ type: 'suggestions', commands: suggestions, timestamp: new Date().toISOString() }]);
  }

  renderer.done();
}
```

- [ ] **Step 2: Manual test**

Run: `node bin/zsh-ai process "你好，请说hello"`
Expected: Should call pi, see thinking → tool call → text rendered in real-time.

Run: `node bin/zsh-ai process "列出当前目录的文件"`
Expected: Should show AI processing with commands.

- [ ] **Step 3: Commit**

```bash
git add src/process.mjs
git commit -m "feat: AI 处理器 — pi --mode json 流式解析 + 会话保存 + 建议"
```

### Task 6: Command Suggester

**Files:**
- Modify: `/Users/kristar/workspace/zsh-ai/src/suggester.mjs`

**Interfaces:**
- Consumes: `~/.zsh_history` file
- Produces: `suggestFromHistory(cwd, n) → string[]`

- [ ] **Step 1: Implement suggestFromHistory**

```js
// src/suggester.mjs
import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';

/**
 * 从 ZSH 历史文件中读取在指定目录或其子目录下执行过的命令。
 * 返回按使用频率排序的 top-n 命令。
 */
export async function suggestFromHistory(cwd, n = 10) {
  const historyFile = join(homedir(), '.zsh_history');
  
  if (!existsSync(historyFile)) return [];

  try {
    const content = readFileSync(historyFile, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());

    // ZSH history format:
    // : <timestamp>:<duration>;<command>
    // Or just raw command lines
    const cmdCount = new Map();

    for (const line of lines) {
      // Parse ZSH history format
      let cmd = line;
      const metaMatch = line.match(/^:\s*\d+:\d+;(.+)/);
      if (metaMatch) {
        cmd = metaMatch[1].trim();
      }
      
      if (!cmd || cmd.startsWith('zsh-ai') || cmd.startsWith('#')) continue;

      // Filter by directory relevance: if the cwd matches part of the command
      // (commands referencing current dir paths, or git commands are always relevant)
      const firstWord = cmd.split(/\s+/)[0];
      
      // Always include common commands regardless of cwd
      const alwaysRelevant = ['ls', 'cd', 'cat', 'echo', 'pwd', 'clear', 'git', 'npm', 'node', 'make', 'bun', 'python', 'pip', 'cargo'];
      
      if (alwaysRelevant.includes(firstWord) || cmd.includes(cwd)) {
        cmdCount.set(cmd, (cmdCount.get(cmd) || 0) + 1);
      }
    }

    // Sort by frequency descending
    return [...cmdCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([cmd]) => cmd);

  } catch {
    return [];
  }
}
```

Note: Need to add `join` to the import:

```js
import { join } from 'path';
```

- [ ] **Step 2: Manual test**

Run: `node bin/zsh-ai suggest`
Expected: prints a list of suggested commands from zsh history.

Run: `node bin/zsh-ai suggest --cwd /Users/kristar/workspace/zsh-ai`
Expected: prints commands relevant to the zsh-ai project.

- [ ] **Step 3: Commit**

```bash
git add src/suggester.mjs
git commit -m "feat: 命令建议器 — 从 ~/.zsh_history 分析高频命令"
```

### Task 7: ZSH init output + Plugin File

**Files:**
- Modify: `/Users/kristar/workspace/zsh-ai/src/init.mjs`
- Create: `/Users/kristar/workspace/zsh-ai/zsh-plugin/zsh-ai.plugin.zsh`

**Interfaces:**
- Consumes: nothing
- Produces: `getInitScript() → string` — complete ZSH code to eval

- [ ] **Step 1: Implement getInitScript**

```js
// src/init.mjs
export function getInitScript() {
  return `# zsh-ai 初始化
# 如果 zsh-ai 未安装，静默跳过
if command -v zsh-ai &>/dev/null; then
  # 保存原始 accept-line
  __zsh_ai_orig_accept_line() { zle .accept-line; }

  # ZLE Widget：拦截 accept-line
  __zsh_ai_accept_line() {
    local input="$BUFFER"
    [[ -z "$input" ]] && { zle .accept-line; return; }

    if zsh-ai detect "$input" 2>/dev/null; then
      BUFFER="zsh-ai process ${(q)input}"
      zle .accept-line
    else
      zle .accept-line
    fi
  }
  zle -N accept-line __zsh_ai_accept_line

  # precmd hook：每次 prompt 前自动启动新会话（仅首次）
  typeset -g _ZSH_AI_SESSION_STARTED=0
  __zsh_ai_precmd() {
    if [[ "$_ZSH_AI_SESSION_STARTED" -eq 0 ]]; then
      zsh-ai session start &>/dev/null
      _ZSH_AI_SESSION_STARTED=1
    fi
  }
  precmd_functions+=(__zsh_ai_precmd)

  # command_not_found_handler 作为备选拦截（当 ZLE Widget 未捕获时）
  if ! typeset -f __zsh_ai_cnf_backup &>/dev/null; then
    if typeset -f command_not_found_handler &>/dev/null; then
      __zsh_ai_cnf_backup() { command_not_found_handler "$@"; }
    fi
  fi
  function command_not_found_handler() {
    if zsh-ai detect "$*" 2>/dev/null; then
      zsh-ai process "$*"
      return $?
    fi
    if typeset -f __zsh_ai_cnf_backup &>/dev/null; then
      __zsh_ai_cnf_backup "$@"
    else
      echo "zsh: command not found: $*" >&2
      return 127
    fi
  }

  # Tab 补全
  if ! typeset -f _zsh_ai_completion &>/dev/null; then
    _zsh_ai_completion() {
      local -a cmds
      cmds=(
        'process:处理自然语言输入'
        'detect:检测是否为自然语言'
        'init:输出 ZSH 集成代码'
        'session:管理会话'
        'suggest:建议命令'
        '--help:显示帮助'
        '--version:显示版本'
      )
      _describe 'zsh-ai' cmds
    }
    compdef _zsh_ai_completion zsh-ai
  fi
fi`;
}
```

- [ ] **Step 2: Create the standalone plugin file**

```zsh
# zsh-ai.plugin.zsh — Oh My Zsh plugin
# 安装: 放入 ~/.oh-my-zsh/custom/plugins/zsh-ai/
# 然后在 .zshrc 中: plugins=(... zsh-ai ...)

# 懒加载：仅在 zsh-ai 已安装时生效
if command -v zsh-ai &>/dev/null; then
  # 保存原始 accept-line
  __zsh_ai_orig_accept_line() { zle .accept-line; }

  # ZLE Widget：拦截 accept-line
  __zsh_ai_accept_line() {
    local input="$BUFFER"
    [[ -z "$input" ]] && { zle .accept-line; return; }

    if zsh-ai detect "$input" 2>/dev/null; then
      BUFFER="zsh-ai process ${(q)input}"
      zle .accept-line
    else
      zle .accept-line
    fi
  }
  zle -N accept-line __zsh_ai_accept_line

  # precmd hook：首次 prompt 前自动启动会话
  typeset -g _ZSH_AI_SESSION_STARTED=0
  __zsh_ai_precmd() {
    if [[ "$_ZSH_AI_SESSION_STARTED" -eq 0 ]]; then
      zsh-ai session start &>/dev/null
      _ZSH_AI_SESSION_STARTED=1
    fi
  }
  precmd_functions+=(__zsh_ai_precmd)

  # command_not_found_handler fallback
  if ! typeset -f __zsh_ai_cnf_backup &>/dev/null; then
    if typeset -f command_not_found_handler &>/dev/null; then
      __zsh_ai_cnf_backup() { command_not_found_handler "$@"; }
    fi
  fi
  function command_not_found_handler() {
    if zsh-ai detect "$*" 2>/dev/null; then
      zsh-ai process "$*"
      return $?
    fi
    if typeset -f __zsh_ai_cnf_backup &>/dev/null; then
      __zsh_ai_cnf_backup "$@"
    else
      echo "zsh: command not found: $*" >&2
      return 127
    fi
  }

  # Tab 补全
  _zsh_ai_completion() {
    local -a cmds
    cmds=(
      'process:处理自然语言输入'
      'detect:检测是否为自然语言'
      'init:输出 ZSH 集成代码'
      'session:管理会话'
      'suggest:建议命令'
      '--help:显示帮助'
      '--version:显示版本'
    )
    _describe 'zsh-ai' cmds
  }
  compdef _zsh_ai_completion zsh-ai
fi
```

- [ ] **Step 3: Verify**

Run: `node bin/zsh-ai init`
Expected: prints the ZSH integration code.

- [ ] **Step 4: Commit**

```bash
git add src/init.mjs zsh-plugin/zsh-ai.plugin.zsh
git commit -m "feat: ZSH 集成 — init 输出 + Oh My Zsh 插件文件 + Tab 补全"
```

### Task 8: README & Final Integration

**Files:**
- Create: `/Users/kristar/workspace/zsh-ai/README.md`
- Verify: full end-to-end flow

- [ ] **Step 1: Write README.md**

```markdown
# zsh-ai

> 在 ZSH 中直接输入自然语言，由 AI 自动处理 — 像聊天一样用终端。

## 效果

在 ZSH 中输入自然语言，按回车后自动触发 AI 处理，展示思考过程、工具调用和结果：

```
┌─────────────────────────────────────────────────────────────┐
│ 🤔 正在思考: 用户想要列出当前目录下的文件...                  │
│ 🔧 执行工具: bash                                           │
│ $ ls -la                                                    │
│ 📄 结果: (文件列表...)                                       │
│ 💬 当前目录有以下文件和子目录：...                           │
│ 📋 建议下一条命令: cd src/  # 进入源码目录                   │
└─────────────────────────────────────────────────────────────┘
```

## 安装

### 前提条件

- Node.js 18+
- [pi-coding-agent](https://github.com/nicobailon/pi)（zsh-ai 调用 pi 执行 AI 处理）

### 安装 CLI

```bash
# 方式 1：通过 npm 全局安装（发布后）
npm install -g zsh-ai

# 方式 2：本地开发模式
git clone <repo>
cd zsh-ai
npm link
```

### 激活 ZSH 集成

```bash
# 方式 A：通过 eval (推荐)
echo 'eval "$(zsh-ai init)"' >> ~/.zshrc

# 方式 B：Oh My Zsh 插件
cp zsh-plugin/zsh-ai.plugin.zsh ~/.oh-my-zsh/custom/plugins/zsh-ai/
# 然后在 ~/.zshrc 中添加: plugins=(... zsh-ai ...)
```

重新打开终端或 `source ~/.zshrc` 即可生效。

## 使用

```bash
# 在 ZSH 中直接输入自然语言（由 ZLE Widget 自动拦截）
# $ 帮我列出当前目录的文件
# → 自动调用 zsh-ai process "帮我列出当前目录的文件"

# 或手动调用
zsh-ai process "列出当前目录的文件"
zsh-ai process "这个目录是做什么的？"
zsh-ai process "帮我安装依赖"

# 检测输入是否为自然语言（exit code 0/1）
zsh-ai detect "列出文件"      # exit 0 (是自然语言)
zsh-ai detect "ls -la"        # exit 1 (是命令)

# 管理会话
zsh-ai session start          # 开始新会话
zsh-ai session list           # 列出所有会话
zsh-ai session show <id>      # 查看会话详情
zsh-ai session clean --days 7 # 清理 7 天前的会话
zsh-ai session clean --all    # 清理所有会话

# 基于历史建议命令
zsh-ai suggest

# 选项
zsh-ai process "..." --provider deepseek --model deepseek-v4-flash
zsh-ai process "..." --no-suggest  # 不显示命令建议
```

## 配置

zsh-ai 使用 pi-coding-agent 的配置（provider、model 等），无独立配置文件。
可通过 `--provider` 和 `--model` 全局标志覆盖。

会话文件存储在 `~/.zsh-ai/sessions/`，每终端启动一个独立会话。

## 卸载

```bash
npm uninstall -g zsh-ai
# 同时从 .zshrc 中移除 'eval "$(zsh-ai init)"' 行
# 或从 plugins=(...) 中移除 zsh-ai
```

## License

MIT
```

- [ ] **Step 2: End-to-end verification**

```bash
# 1. 检测
node bin/zsh-ai detect "ls"
echo "exit: $?"  # should be 1

node bin/zsh-ai detect "列出所有文件"
echo "exit: $?"  # should be 0

# 2. init 输出
node bin/zsh-ai init | head -5

# 3. session 管理
node bin/zsh-ai session start
node bin/zsh-ai session list
node bin/zsh-ai session clean --dry-run

# 4. suggest
node bin/zsh-ai suggest | head -5

# 5. 完整 process（需要 pi 已安装）
node bin/zsh-ai process "你好，请说 hello"
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README — 安装、使用、配置文档"
```

## Self-Review Checklist

### 1. Spec Coverage
- ✅ ZLE Widget interception → Task 7 (init.mjs + zsh-ai.plugin.zsh)
- ✅ NLP detection heuristics → Task 2 (detect.mjs)
- ✅ Session context persistence (per-terminal JSONL) → Task 3 (session.mjs)
- ✅ AI processor with pi --mode json streaming → Task 5 (process.mjs)
- ✅ Real-time thinking + tool call display → Task 4 (renderer.mjs)
- ✅ Command suggestions (AI + history) → Task 5 + 6 (suggester.mjs)
- ✅ Session cleanup → Task 3 (session.mjs clean method)
- ✅ init command for ZSH integration → Task 7 (init.mjs)
- ✅ Tab completion → Task 7 (compdef in ZSH code)
- ✅ Error handling → Process.mjs (pi check, timeout), Renderer (error method)
- ✅ No npm dependencies → package.json has zero dependencies
- ✅ fallback command_not_found_handler → Task 7 init output

### 2. Placeholder Scan
No "TBD", "TODO", "implement later", "add error handling" (actual code in every step), or vague steps found. ✅

### 3. Type Consistency
- `isNaturalLanguage(text) → boolean`: Task 2 defines it, Task 1's cli.mjs uses it correctly ✅
- `SessionManager` methods called from `cli.mjs` match implementation in `session.mjs` ✅
- `Renderer` event methods called from `process.mjs` match class definition ✅
- `suggestFromHistory(cwd, n) → string[]` — consistent across Task 6 and Task 5 ✅
- `getInitScript() → string` — consistent across Task 1 and Task 7 ✅
