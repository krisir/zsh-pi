// src/renderer.mjs — Terminal Renderer

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const GRAY = '\x1b[90m';
const RED = '\x1b[31m';
const ERASE_LINE = '\x1b[2K';
const CURSOR_UP = '\x1b[1A';

const BANNER = `${CYAN}══════════════════ zsh-ai ══════════════════${RESET}`;

/**
 * 轻量 markdown → ANSI 终端渲染。
 * 处理常见格式：代码块、行内代码、粗体、标题、列表。
 */
const ITALIC = '\x1b[3m';
const UNDERLINE = '\x1b[4m';
const CODE_BG = '\x1b[48;5;236m';   // dark gray background for code blocks

/** 中文字符/全角字符 = 2 格宽，其余 = 1 */
function visualLen(s) {
  return [...s].reduce((n, c) => {
    const code = c.charCodeAt(0);
    return n + (code >= 0x4e00 && code <= 0x9fff || code >= 0x3400 && code <= 0x4dbf || code >= 0xff00 && code <= 0xffef || code >= 0x2e80 && code <= 0x2eff ? 2 : 1);
  }, 0);
}

function formatMarkdown(text) {
  let result = text;

  // 1) 代码块 ```...``` → 灰色背景（优先处理，避免内部格式被后续规则误匹配）
  result = result.replace(/```(\w*)\n?([\s\S]*?)```/g, (_m, _lang, code) => {
    const lines = code.replace(/^\n/, '').split('\n').map(l => ` ${l}`);
    return `${CODE_BG}${DIM}${lines.join('\n')}${RESET}`;
  });

  // 2) 行内代码 `code` → GRAY 文字
  result = result.replace(/`([^`]+)`/g, `${GRAY}$1${RESET}`);

  // 3) **粗体**
  result = result.replace(/\*\*(.+?)\*\*/g, `${BOLD}$1${RESET}`);

  // 4) *斜体*
  result = result.replace(/\B\*([^*]+)\*\B/g, `${ITALIC}$1${RESET}`);

  // 5) 标题 # ~ ######
  result = result.replace(/^(#{1,6})\s+(.+)$/gm, `${CYAN}${BOLD}$1 $2${RESET}`);

  // 6) 表格（后处理，此时单元格内的 ** ` 等已转为 ANSI）
  result = result.replace(/(^\|.+\|\n?)+/gm, (block) => {
    const lines = block.trim().split('\n').filter(l => l.trim());
    if (lines.length < 2) return block;

    // 滤掉分隔行 (|---|---|---|)
    const dataLines = lines.filter(l => !/^\|[-| :]+\|$/.test(l.trim()));
    if (dataLines.length === 0) return block;

    // 解析列
    const rows = dataLines.map(l =>
      l.split('|').filter(c => c.trim()).map(c => c.trim())
    );
    const colCount = Math.max(...rows.map(r => r.length));
    if (colCount === 0) return block;

    // 计算每列视觉宽度（不计 ANSI 转义码，中文算 2 格）
    const widths = Array(colCount).fill(0);
    for (const row of rows) {
      for (let i = 0; i < row.length; i++) {
        widths[i] = Math.max(widths[i], visualLen(row[i].replace(/\x1b\[[0-9;]*m/g, '')));
      }
    }

    const hasSeparator = lines.some(l => /^\|[-| :]+\|$/.test(l.trim()));
    return rows.map((row, ri) => {
      const cells = row.map((c, ci) => {
        const curLen = visualLen(c.replace(/\x1b\[[0-9;]*m/g, ''));
        return `${c}${' '.repeat(Math.max(0, widths[ci] - curLen))}`;
      });
      const line = `  ${cells.join('  ')}`;
      return (hasSeparator && ri === 0) ? `${BOLD}${line}${RESET}` : line;
    }).join('\n');
  });

  return result;
}

export class Renderer {
  constructor() {
    this.finalText = '';
    this.suggestions = [];
    this._started = false;
    this._lineCount = 0;          // total lines output so far
    this._thinking = '';
    this._resultFinalized = false;
  }

  /* ─── helpers ─── */

  _log(str) {
    console.log(str);
    this._lineCount += (str.match(/\n/g) || []).length + 1;
  }

  _erase(n) {
    const actual = Math.min(n, this._lineCount);
    for (let i = 0; i < actual; i++) {
      process.stdout.write(CURSOR_UP + ERASE_LINE);
    }
    this._lineCount -= actual;
  }

  _clearProcessing() {
    if (this._lineCount <= 0) return;
    this._erase(this._lineCount);
  }

  /* ─── public API ─── */

  /** 收到 AI 思考增量（不展示内容，仅累计） */
  onThinking(delta) {
    if (!this._started) {
      this._started = true;
      this._log(`\n${BANNER}`);
      this._log(`${DIM}⏳ AI 处理中...${RESET}`);
    }
    this._thinking += delta;
  }

  /** 收到工具调用 */
  onToolCall(name, args) {
    // 替换 "⏳ AI 处理中..." 为当前工具调用信息
    this._ensureStarted();
    // 擦除之前的进度行
    this._erase(1);
    const argsStr = typeof args === 'object' ? JSON.stringify(args, null, 2) : String(args);
    const shortArgs = argsStr.length > 200 ? argsStr.slice(0, 197) + '...' : argsStr;
    this._log(`${YELLOW}🔧 执行工具: ${BOLD}${name}${RESET}`);
    this._log(`${YELLOW}  参数: ${shortArgs}${RESET}`);
  }

  /** 收到工具结果 */
  onToolResult(content) {
    this._ensureStarted();
    const lines = String(content).split('\n');
    const preview = lines.slice(0, 5).join('\n');
    const truncated = lines.length > 5 ? '\n  ...' : '';
    this._log(`${GREEN}📄 结果:${RESET}`);
    this._log(`  ${preview}${truncated}`);
  }

  /** 收到 AI 文本回复（不实时输出，攒到 done() 统一展示） */
  onText(text) {
    if (!this._started) {
      this._started = true;
      this._log(`\n${BANNER}`);
    }
    this.finalText += text;
  }

  /** 收到命令建议 */
  onSuggestions(commands) {
    this.suggestions = commands;
  }

  /** 完成渲染：擦除所有中间输出，仅展示最终结果 */
  done() {
    if (!this.finalText && this._lineCount === 0) return;

    // 擦除 processing 阶段的所有输出（横幅 + 进度 + 工具调用/结果）
    this._clearProcessing();

    // 输出最终结果（含 markdown 渲染）
    const text = formatMarkdown(this.finalText.trim());
    if (text) {
      const lines = text.split('\n');
      this._log(`\n${RESET}${lines[0]}`);
      for (let i = 1; i < lines.length; i++) {
        this._log(`${lines[i]}`);
      }
    }

    // 命令建议
    if (this.suggestions.length > 0) {
      this._log(`\n${CYAN}📋 建议下一条命令:${RESET}`);
      this.suggestions.forEach(cmd => {
        const [command, ...commentParts] = cmd.split('//');
        const comment = commentParts.join('//').trim();
        if (comment) {
          this._log(`  ${BOLD}> ${command.trim()}${RESET} ${GRAY}# ${comment}${RESET}`);
        } else {
          this._log(`  ${BOLD}> ${cmd.trim()}${RESET}`);
        }
      });
    }

    this._log(`${CYAN}────────────────────────────────────────────────${RESET}\n`);
    this._resultFinalized = true;
  }

  /** 输出错误信息 */
  error(msg) {
    console.error(`\n${RED}❌ ${msg}${RESET}\n`);
  }

  /** 警告信息 */
  warn(msg) {
    console.error(`\n${YELLOW}⚠️  ${msg}${RESET}\n`);
  }

  _ensureStarted() {
    if (!this._started) {
      this._started = true;
      this._log(`\n${BANNER}`);
    }
  }
}
