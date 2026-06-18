// tests/session.test.mjs
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, rmSync, readdirSync } from 'fs';
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
    const beforeCount = readdirSync(tmpDir).length;
    sm.clean({ dryRun: true });
    const afterCount = readdirSync(tmpDir).length;
    assert.equal(afterCount, beforeCount);
  });
});
