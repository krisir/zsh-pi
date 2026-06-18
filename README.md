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

- **Node.js 18+**
- **[pi-coding-agent](https://github.com/nicobailon/pi)** — zsh-ai 底层调用 pi 执行 AI 处理
- **AI Provider API Key** — pi 需要配置一个 AI 服务商（如 DeepSeek、OpenAI、Anthropic 等）

```bash
# 检查前置条件
node --version            # 需要 >= 18
which pi                  # 确认 pi 已安装
pi --version              # 确认版本

# 如果没有 pi，通过 brew 安装：
# brew install pi

# 配置 API Key（以 DeepSeek 为例）
export DEEPSEEK_API_KEY="sk-your-key-here"
# 或写入 ~/.pi/agent/settings.json 持久化
```

### 安装 zsh-ai

```bash
# 1. 克隆项目
git clone <仓库地址>
cd zsh-ai

# 2. 注册 CLI 命令
npm link

# 3. 验证 CLI 可用
zsh-ai --version     # 应输出 0.1.0
zsh-ai --help        # 应显示帮助

# 4. 验证 AI 通路
zsh-ai process "你好，请说 hello"
# 应看到 spinner 动画 + AI 回答，说明 AI 通路正常

# 5. 激活 ZSH 集成（二选一）
# 方式 A：通过 eval（推荐）
echo 'eval "$(zsh-ai init)"' >> ~/.zshrc

# 方式 B：Oh My Zsh 插件
mkdir -p ~/.oh-my-zsh/custom/plugins/zsh-ai
cp zsh-plugin/zsh-ai.plugin.zsh ~/.oh-my-zsh/custom/plugins/zsh-ai/
# 然后在 ~/.zshrc 的 plugins=(...) 中添加 zsh-ai

# 6. 生效
source ~/.zshrc
```

### 确认生效

```bash
# 输入自然语言 → 应自动触发 AI
你好

# 正常命令 → 应正常执行，不经过 AI
ls
pwd

# 命令行检测
zsh-ai detect 你好    # exit 0（自然语言）
zsh-ai detect ls      # exit 1（命令）
```

> **首次使用**：`zsh-ai process` 第一次调用时 pi 需要冷启动，初始响应约 2-3 秒，后续更快。

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
