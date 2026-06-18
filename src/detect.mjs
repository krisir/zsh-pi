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
