// src/process.mjs — AI Processor
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

  // 构建上下文
  let contextParts = [];

  // 1. 读取最近的 shell 命令历史
  try {
    const recentCmds = await suggestFromHistory(process.cwd(), 15);
    if (recentCmds.length > 0) {
      contextParts.push('你最近在终端执行的命令（按时间从近到远）:\n' + recentCmds.join('\n'));
    }
  } catch {}

  // 2. 读取之前 AI 对话上下文
  const sessionContext = session.getRecentContext(5);
  if (sessionContext) {
    contextParts.push(sessionContext);
  }

  const fullInput = contextParts.length > 0
    ? `${contextParts.join('\n\n')}\n\n用户问题: ${text}`
    : text;

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
  });
  // 立即关闭 stdin，否则 pi 会等待 stdin EOF 而不输出
  pi.stdin.end();

  const turnData = [];
  let currentText = '';

  const timeout = setTimeout(() => {
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
          // No-op: thinking state tracked via turnData
        } else if (ev.type === 'thinking_delta') {
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
        // 取完整文本（仅用于 session 保存和提建议，renderer 已从 text_delta 获取）
        for (const c of event.message.content || []) {
          if (c.type === 'text') {
            currentText = c.text;
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

  // Suggestions — 仅在 AI 回复中自然包含时展示
  const suggestions = [];

  const suggestMatch = currentText.match(/## 建议|📋|建议(?:的)?(?:下一条)?命令[：:]\s*([\s\S]*?)(?:\n\n|$)/);
  if (suggestMatch && suggestMatch[1]) {
    const lines = suggestMatch[1].trim().split('\n');
    for (const line of lines) {
      const clean = line.replace(/^[-*>\s`]+/, '').trim();
      if (clean) suggestions.push(clean);
    }
  }

  if (suggestions.length > 0) {
    renderer.onSuggestions(suggestions);
    session.appendTurn(text, [{ type: 'suggestions', commands: suggestions, timestamp: new Date().toISOString() }]);
  }

  renderer.done();
}
