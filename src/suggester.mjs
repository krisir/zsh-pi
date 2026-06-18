// src/suggester.mjs
import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

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
