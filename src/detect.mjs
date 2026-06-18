// src/detect.mjs

/**
 * 判断输入文本是否是自然语言（而非 shell 命令）。
 * 同步，毫秒级返回。
 */

import { execSync } from 'child_process';

/**
 * 检查命令是否存在于系统 PATH 中。
 * 使用 `command -v` 而非硬编码列表，自动适应用户环境。
 */
function commandExists(cmd) {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'ignore', timeout: 500 });
    return true;
  } catch {
    return false;
  }
}

/**
 * 检查文本中是否包含非 ASCII 字符（中文等）。
 */
function hasNonAscii(text) {
  return /[^\x20-\x7E]/.test(text);
}

export function isNaturalLanguage(text) {
  if (!text || text.trim().length === 0) return false;
  const trimmed = text.trim();
  const words = trimmed.split(/\s+/);
  const cmdName = words[0];

  // 首词就是中文 → 自然语言（如 "列出文件"、"帮我安装git"）
  if (hasNonAscii(cmdName)) return true;

  // 像文件路径或包含扩展名 → 命令
  if (cmdName.includes('/') || cmdName.includes('.')) return false;

  // 首词后面有中文 → 虽然是已知命令但实际上是提问（如 "gh auth login 是什么意思"）
  if (words.length > 1 && words.slice(1).some(hasNonAscii)) return true;

  // 首词是系统中已安装的命令 → 肯定是命令，不拦截
  if (commandExists(cmdName)) return false;

  // 命令不存在 → 很可能是自然语言
  return true;
}
