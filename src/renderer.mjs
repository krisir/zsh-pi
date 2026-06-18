// src/renderer.mjs — Terminal Renderer

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const GRAY = '\x1b[90m';
const RED = '\x1b[31m';

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * 轻量 markdown → ANSI 终端渲染。
 */
const ITALIC = '\x1b[3m';
const CODE_BG = '\x1b[48;5;236m';

function visualLen(s) {
  return [...s].reduce((n, c) => {
    const code = c.charCodeAt(0);
    return n + (code >= 0x4e00 && code <= 0x9fff || code >= 0x3400 && code <= 0x4dbf || code >= 0xff00 && code <= 0xffef || code >= 0x2e80 && code <= 0x2eff ? 2 : 1);
  }, 0);
}

function formatMarkdown(text) {
  let result = text;
  result = result.replace(/```(\w*)\n?([\s\S]*?)```/g, (_m, _lang, code) => {
    const lines = code.replace(/^\n/, '').split('\n').map(l => ` ${l}`);
    return `${CODE_BG}${DIM}${lines.join('\n')}${RESET}`;
  });
  result = result.replace(/`([^`]+)`/g, `${GRAY}$1${RESET}`);
  result = result.replace(/\*\*(.+?)\*\*/g, `${BOLD}$1${RESET}`);
  result = result.replace(/\B\*([^*]+)\*\B/g, `${ITALIC}$1${RESET}`);
  result = result.replace(/^(#{1,6})\s+(.+)$/gm, `${CYAN}${BOLD}$1 $2${RESET}`);
  // Tables
  result = result.replace(/(^\|.+\|\n?)+/gm, (block) => {
    const lines = block.trim().split('\n').filter(l => l.trim());
    if (lines.length < 2) return block;
    const dataLines = lines.filter(l => !/^\|[-| :]+\|$/.test(l.trim()));
    if (dataLines.length === 0) return block;
    const rows = dataLines.map(l => l.split('|').filter(c => c.trim()).map(c => c.trim()));
    const colCount = Math.max(...rows.map(r => r.length));
    if (colCount === 0) return block;
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
    this._done = false;
    this._thinking = '';
    this._userInputShown = false;
  }

  /** 展示用户输入 */
  showUserInput(text) {
    if (this._userInputShown) return;
    this._userInputShown = true;
    process.stdout.write(`\n${DIM}${'─'.repeat(40)}${RESET}\n`);
    console.log(`💬 ${text}`);
    process.stdout.write(`${DIM}${'─'.repeat(40)}${RESET}\n`);
  }

  /** 收到 AI 思考增量（单行动画） */
  onThinking(delta) {
    this._thinking += delta;
    const frame = SPINNER[this._thinking.length % SPINNER.length];
    process.stdout.write(`\r${DIM}${frame} 思考中${RESET}`);
  }

  /** 收到工具调用 */
  onToolCall(name, args) {
    // 擦掉 spinner 行，输出工具调用
    process.stdout.write(`\r${DIM}🔧 ${name}${RESET}\n`);
    const argsStr = typeof args === 'object' ? JSON.stringify(args, null, 2) : String(args);
    const shortArgs = argsStr.length > 200 ? argsStr.slice(0, 197) + '...' : argsStr;
    process.stdout.write(`${DIM}  ${shortArgs}${RESET}\n`);
  }

  /** 收到工具结果 */
  onToolResult(content) {
    const lines = String(content).split('\n');
    const preview = lines.slice(0, 3).join('\n');
    const truncated = lines.length > 3 ? ' …' : '';
    process.stdout.write(`${GREEN}📄${RESET} ${preview}${truncated}\n`);
  }

  /** 收到 AI 文本回复 */
  onText(text) {
    this.finalText += text;
  }

  /** 收到命令建议 */
  onSuggestions(commands) {
    this.suggestions = commands;
  }

  /** 完成渲染 */
  done() {
    if (this._done) return;
    this._done = true;

    // 擦掉 spinner 行（如果还在）
    process.stdout.write(`\r\x1b[K`);

    const text = formatMarkdown(this.finalText.trim());
    if (text) {
      const lines = text.split('\n');
      console.log(`\n${lines[0]}`);
      for (let i = 1; i < lines.length; i++) {
        console.log(`${lines[i]}`);
      }
    }

    if (this.suggestions.length > 0) {
      console.log(`${DIM}─${RESET}`);
      this.suggestions.forEach(cmd => {
        const parts = cmd.split('//');
        const command = parts[0].trim();
        const comment = parts.slice(1).join('//').trim();
        if (comment) {
          console.log(`${GRAY}>${RESET} ${command}  ${DIM}# ${comment}${RESET}`);
        } else {
          console.log(`${GRAY}>${RESET} ${command}`);
        }
      });
    }
  }

  error(msg) {
    process.stdout.write(`\r\x1b[K`);
    console.error(`\n${RED}✘ ${msg}${RESET}\n`);
  }

  warn(msg) {
    console.error(`\n${YELLOW}⚠ ${msg}${RESET}\n`);
  }
}
