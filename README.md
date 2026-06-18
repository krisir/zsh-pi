# zsh-ai

> 在 ZSH 中直接输入自然语言，由 AI 自动处理 — 像聊天一样用终端。

## 效果

```
$ 帮我列出当前目录的文件
$ zsh-ai process 帮我列出当前目录的文件    ← ZLE Widget 自动拦截
⠙ 思考中                                  ← spinner 动画
🔧 bash                                    ← 工具调用
  { "command": "ls -la" }
📄 total 24
  drwxr-xr-x ...

当前目录有以下文件：
  - src/
  - tests/
  - README.md
─
> ls -la
> cd src
```

- 输入 **自然语言** → 自动调用 AI 处理（展示 spinner、工具调用链、最终结果）
- 输入 **shell 命令** → 正常执行，完全不经过 AI
- 输出支持 **Markdown 渲染**（表格对齐、粗体、代码块）

## 安装

### 前提条件

- Node.js 18+
- [pi-coding-agent](https://github.com/nicobailon/pi)（zsh-ai 调用 pi 执行 AI 处理）

### 安装 CLI

```bash
# 本地开发模式
git clone <repo>
cd zsh-ai
npm link
```

### 激活 ZSH 集成

```bash
# 方式 A：通过 eval (推荐)
echo 'eval "$(zsh-ai init)"' >> ~/.zshrc

# 方式 B：Oh My Zsh 插件
cp zsh-plugin/zsh-ai.plugin.zsh ~/.oh-my-zsh/custom/plugins/zsh-ai/
# 然后在 ~/.zshrc 中添加: plugins=(... zsh-ai ...)
```

重新打开终端或 `source ~/.zshrc` 即可生效。

## 使用

```bash
# 在 ZSH 中直接输入自然语言（由 ZLE Widget 自动拦截）
# $ 帮我列出当前目录的文件
# → 自动调用 zsh-ai process "帮我列出当前目录的文件"

# 或手动调用
zsh-ai process "列出当前目录的文件"
zsh-ai process "这个目录是做什么的？"
zsh-ai process "帮我安装依赖"

# 检测输入是否为自然语言（exit code 0/1）
zsh-ai detect "列出文件"      # exit 0 (是自然语言)
zsh-ai detect "ls -la"        # exit 1 (是命令)

# 管理会话
zsh-ai session start          # 开始新会话
zsh-ai session list           # 列出所有会话
zsh-ai session show <id>      # 查看会话详情
zsh-ai session clean --days 7 # 清理 7 天前的会话
zsh-ai session clean --all    # 清理所有会话

# 基于历史建议命令
zsh-ai suggest

# 选项
zsh-ai process "..." --provider deepseek --model deepseek-v4-flash
```

## 工作原理

1. **ZLE Widget** 拦截 `accept-line`，调用 `zsh-ai detect` 判断输入是否为自然语言
2. 若为自然语言 → 替换 `$BUFFER` 为 `zsh-ai process <输入>` 并执行
3. `zsh-ai process` 调用 `pi --mode json -p`，流式解析 JSONL 事件
4. 终端输出 spinner 动画 → 工具调用 → 工具结果 → AI 回复
5. 回复内容经过 Markdown→ANSI 渲染（表格对齐、粗体、代码块等）
6. 每次交互保存到 `~/.zsh-ai/sessions/` 的 JSONL 文件中
7. 向 AI 注入最近 shell 命令历史和之前对话上下文

## 配置

zsh-ai 使用 pi-coding-agent 的配置（provider、model 等），无独立配置文件。
可通过 `--provider` 和 `--model` 全局标志覆盖。

会话文件存储在 `~/.zsh-ai/sessions/`，每终端启动一个独立会话。

## 命令参考

```
💬 zsh-ai process <text>         处理自然语言输入
  zsh-ai detect <text>          检测是否为自然语言
  zsh-ai init                   输出 ZSH 集成代码
  zsh-ai session start          开始新会话
  zsh-ai session list           列出所有会话
  zsh-ai session show <id>      查看会话详情
  zsh-ai session clean [opts]   清理历史会话
  zsh-ai suggest [--cwd <dir>]  基于历史建议命令
  zsh-ai --help                 显示帮助
  zsh-ai --version              显示版本
```

## 会话管理

```bash
# 清理 30 天前的会话
zsh-ai session clean --days 30

# 预览要清理的文件（不实际删除）
zsh-ai session clean --dry-run

# 清理所有
zsh-ai session clean --all
```

## 卸载

```bash
npm uninstall -g zsh-ai
# 同时从 .zshrc 中移除 'eval "$(zsh-ai init)"' 行
# 或从 plugins=(...) 中移除 zsh-ai
```

## License

MIT
