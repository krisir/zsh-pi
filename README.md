# zsh-ai

> 在 ZSH 中直接输入自然语言，由 AI 自动处理 — 像聊天一样用终端。

## 效果

在 ZSH 中输入自然语言，按回车后自动触发 AI 处理，展示思考过程、工具调用和结果：

```
┌─────────────────────────────────────────────────────────────┐
│ 🤔 正在思考: 用户想要列出当前目录下的文件...                  │
│ 🔧 执行工具: bash                                           │
│ $ ls -la                                                    │
│ 📄 结果: (文件列表...)                                       │
│ 💬 当前目录有以下文件和子目录：...                           │
│ 📋 建议下一条命令: cd src/  # 进入源码目录                   │
└─────────────────────────────────────────────────────────────┘
```

## 安装

### 前提条件

- Node.js 18+
- [pi-coding-agent](https://github.com/nicobailon/pi)（zsh-ai 调用 pi 执行 AI 处理）

### 安装 CLI

```bash
# 方式 1：通过 npm 全局安装（发布后）
npm install -g zsh-ai

# 方式 2：本地开发模式
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

## 配置

zsh-ai 使用 pi-coding-agent 的配置（provider、model 等），无独立配置文件。
可通过 `--provider` 和 `--model` 全局标志覆盖。

会话文件存储在 `~/.zsh-ai/sessions/`，每终端启动一个独立会话。

## 卸载

```bash
npm uninstall -g zsh-ai
# 同时从 .zshrc 中移除 'eval "$(zsh-ai init)"' 行
# 或从 plugins=(...) 中移除 zsh-ai
```

## License

MIT
