// src/renderer.mjs — Terminal Renderer

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

const BANNER = `\n${CYAN}══════════════════ zsh-ai ══════════════════${RESET}`;

export class Renderer {
  constructor() {
    this.thinking = '';
    this.toolCalls = [];   // { name, args, result }
    this.finalText = '';
    this.suggestions = [];
    this._thinkingLineCount = 0;
    this._started = false;
    this._textLineCount = 0;
    this._textRendered = false;
  }

  /** 确保起始横幅已输出 */
  _ensureStarted() {
    if (!this._started) {
      this._started = true;
      console.log(BANNER);
    }
  }

  /** 收到 AI 思考增量 */
  onThinking(delta) {
    this._ensureStarted();
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
    this._ensureStarted();
    this._finalizeThinking();
    const argsStr = typeof args === 'object' ? JSON.stringify(args, null, 2) : String(args);
    const shortArgs = argsStr.length > 200 ? argsStr.slice(0, 197) + '...' : argsStr;
    console.log(`${YELLOW}🔧 执行工具: ${BOLD}${name}${RESET}`);
    console.log(`${YELLOW}  参数: ${shortArgs}${RESET}`);
    this.toolCalls.push({ name, args: shortArgs });
  }

  /** 收到工具结果 */
  onToolResult(content) {
    this._ensureStarted();
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
    this._ensureStarted();
    this.finalText += text;
    // Re-render the final text section (supports incremental updates)
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
    if (this.finalText && !this.suggestions.length && !this._textRendered) {
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
      console.log();
      this._thinkingLineCount = 0;
    }
  }

  _renderFinalText() {
    if (!this.finalText) return;

    // Erase previously rendered lines for incremental update
    for (let i = 0; i < this._textLineCount; i++) {
      process.stdout.write(CURSOR_UP + ERASE_LINE);
    }

    const lines = this.finalText.trim().split('\n');
    console.log(`\n${RESET}💬 ${lines[0]}`);
    for (let i = 1; i < lines.length; i++) {
      console.log(`  ${lines[i]}`);
    }
    this._textLineCount = lines.length + 1; // blank line + content lines
    this._textRendered = true;
  }
}
