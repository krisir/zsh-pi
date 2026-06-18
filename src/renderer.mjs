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
const THINKING_DEBOUNCE_MS = 60;

export class Renderer {
  constructor() {
    this.thinking = '';
    this.finalText = '';
    this.suggestions = [];
    this._started = false;
    this._lineCount = 0;          // total lines output so far
    this._thinkingRow = 0;        // 1 if thinking line is visible
    this._hasThinking = false;
    this._thinkTimer = null;
    this._thinkPending = false;
    this._toolBlocks = [];        // [{lines}] per tool-call block
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

  onThinking(delta) {
    if (!this._started) {
      this._started = true;
      process.stdout.write('\n');
      this._log(BANNER);
    }
    this.thinking += delta;
    if (!this._hasThinking) {
      this._hasThinking = true;
    }
    if (!this._thinkPending) {
      this._thinkPending = true;
      this._thinkTimer = setTimeout(() => this._flushThinking(), THINKING_DEBOUNCE_MS);
    }
  }

  _flushThinking() {
    this._thinkPending = false;
    if (!this._hasThinking) return;
    const display = this.thinking.length > 120
      ? this.thinking.slice(0, 117) + '...'
      : this.thinking;
    if (this._thinkingRow > 0) {
      process.stdout.write(CURSOR_UP + ERASE_LINE);
      this._lineCount--;
    }
    this._log(`${DIM}🤔 ${display}${RESET}`);
    this._thinkingRow = 1;
  }

  onToolCall(name, args) {
    this._flushThinkingNow();
    this._ensureStarted();
    const argsStr = typeof args === 'object' ? JSON.stringify(args, null, 2) : String(args);
    const shortArgs = argsStr.length > 200 ? argsStr.slice(0, 197) + '...' : argsStr;
    this._log(`${YELLOW}🔧 执行工具: ${BOLD}${name}${RESET}`);
    this._log(`${YELLOW}  参数: ${shortArgs}${RESET}`);
    this._toolBlocks.push({ lines: 2 });
  }

  onToolResult(content) {
    this._ensureStarted();
    const lines = String(content).split('\n');
    const preview = lines.slice(0, 5).join('\n');
    const truncated = lines.length > 5 ? '\n  ...' : '';
    this._log(`${GREEN}📄 结果:${RESET}`);
    this._log(`  ${preview}${truncated}`);
    const extraLines = 2; // header + preview line(s)
    if (this._toolBlocks.length > 0) {
      this._toolBlocks[this._toolBlocks.length - 1].lines += extraLines;
    }
  }

  /** Stream text silently; only show on done() */
  onText(text) {
    this._ensureStarted();
    this.finalText += text;
  }

  onSuggestions(commands) {
    this.suggestions = commands;
  }

  done() {
    this._flushThinkingNow();

    if (!this.finalText && this._toolBlocks.length === 0 && !this._started) {
      return;
    }

    // Erase everything (thinking, tool calls, results — the whole processing UI)
    this._clearProcessing();

    // Show final result
    const text = this.finalText.trim();
    if (text) {
      const lines = text.split('\n');
      this._log(`\n${RESET}${lines[0]}`);
      for (let i = 1; i < lines.length; i++) {
        this._log(`${lines[i]}`);
      }
    }

    // Suggestions
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

  error(msg) {
    console.error(`\n${RED}❌ ${msg}${RESET}\n`);
  }

  warn(msg) {
    console.error(`\n${YELLOW}⚠️  ${msg}${RESET}\n`);
  }

  /* ─── internals ─── */

  _ensureStarted() {
    if (!this._started) {
      this._started = true;
      this._log(`\n${BANNER}`);
    }
  }

  _flushThinkingNow() {
    if (this._thinkPending) {
      clearTimeout(this._thinkTimer);
      this._thinkPending = false;
      this._flushThinking();
    }
    if (this._thinkingRow > 0) {
      process.stdout.write(CURSOR_UP + ERASE_LINE);
      this._lineCount--;
      this._thinkingRow = 0;
    }
  }
}
