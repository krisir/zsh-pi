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
