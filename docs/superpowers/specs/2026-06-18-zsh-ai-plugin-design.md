# Design Spec: zsh-ai — ZSH 自然语言 AI 处理插件

## 概述

创建一个独立的 CLI 工具 `zsh-ai`，配合 ZSH ZLE Widget，在 ZSH 输入自然语言时自动拦截并交由 pi (pi-coding-agent) 处理，实时流式展示 AI 的思考过程和工具调用，并将交互上下文持久化到文件用于后续补全建议。

问题背景：当前的 `command_not_found_handler` 方案仅在命令找不到时才触发，且缺乏实时渲染和上下文持久化能力。ZLE Widget 方案能在 Enter 被按下时立即拦截，灵活性更高。

## 架构

```
┌──────────────────────────────────────────────────────────────────┐
│  ZSH (ZLE Widget)                                              │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │ intercept-accept-line()                                     ││
│  │  1. 获取 $BUFFER (当前输入行)                               ││
│  │  2. 调用 zsh-ai detect "$BUFFER"                            ││
│  │  3. 若为 NLP → BUFFER="zsh-ai process ${(q)input}" → .accept-line│
│  │  4. 若为命令 → .accept-line (原样执行)                      ││
│  └──────────────────────────────────────────────────────────────┘│
└───────────────────────────────┬──────────────────────────────────┘
                                │ stdin / exit code
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│  zsh-ai (Node.js CLI)                                          │
│                                                                  │
│  subcommand: process <text>                                      │
│  ┌─────────────────┐   ┌────────────────┐   ┌───────────────┐  │
│  │ NLP Detector     │   │ Session Manager│   │ Streaming UI  │  │
│  │ (fast heuristic) │──→│ (JSONL per     │──→│ (ANSI render) │  │
│  └─────────────────┘   │  session)       │   └───────────────┘  │
│                        └────────────────┘                       │
│  ┌─────────────────┐   ┌────────────────┐   ┌───────────────┐  │
│  │ AI Processor    │   │ Command        │   │ Session Clean │  │
│  │ (pi --mode json)│──→│ Suggester      │   │ (aged session │  │
│  └─────────────────┘   │ (AI + history) │   │  cleanup)     │  │
│                        └────────────────┘   └───────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### 关键设计决策

- **独立 CLI 工具**：zsh-ai 是一个 npm 包（Node.js CLI），不依赖 ZSH。可通过 `echo "text" | zsh-ai process` 独立使用。
- **ZSH 职责最小化**：仅负责拦截输入 + 调用 `zsh-ai detect` 做快速 NLP 判定 + 转发给 `zsh-ai process`。
- **流式渲染**：通过 pi 的 `--mode json` 获取 JSONL 事件流，逐帧解析并渲染到终端。

## 组件详述

### 1. ZLE Widget（ZSH 侧）

**文件**：`~/.oh-my-zsh/custom/plugins/zsh-ai/zsh-ai.plugin.zsh`

```zsh
# zsh-ai ZLE Widget 插件
# 安装方式：添加到 .zshrc 的 plugins=(... zsh-ai...)

# 保存原始 accept-line
zsh-ai-orig-accept-line() { zle .accept-line; }

zsh-ai-accept-line() {
    local input="$BUFFER"
    # 空输入直接放行
    [[ -z "$input" ]] && { zle .accept-line; return }

    # 调用 zsh-ai detect 快速判断
    if zsh-ai detect "$input" 2>/dev/null; then
        # 是自然语言 → 替换 BUFFER 并执行
        BUFFER="zsh-ai process ${(q)input}"
        zle .accept-line
    else
        zle .accept-line
    fi
}

zle -N accept-line zsh-ai-accept-line
```

**行为**：
- 空行放行
- `zsh-ai process "..."` 输出完成后，ZSH 回到干净 prompt
- 若 `zsh-ai detect` 超时或不可用，fallback 到原 accept-line

### 2. NLP 检测模块 (`zsh-ai detect <text>`)

复用在当前 `command_not_found_handler` 中的 heuristics，用 Node.js 实现：

```
输入文本
  ├─ 包含非 ASCII（中文等）→ 是自然语言
  ├─ 单词数 ≥ 3 且不含命令特征（-x, --flag, /, ., |, >, <）→ 是自然语言
  └─ 其他 → 不是自然语言（可能为命令或路径）
```

**性能**：同步执行，毫秒级返回。exit code 0 = 是自然语言，1 = 不是。

### 3. 会话管理器 (Session Manager)

**存储位置**：`~/.zsh-ai/sessions/`

**文件名格式**：`<timestamp>_<uuid>.jsonl`

每条会话文件记录一个终端会话（从打开终端到关闭）内的所有交互：

```jsonl
{"type":"session","version":1,"id":"uuid","createdAt":"2026-06-18T10:00:00Z","cwd":"/Users/user/project","pid":12345}
{"type":"turn","seq":1,"input":"列出当前目录的文件","timestamp":"..."}
{"type":"thinking_start","seq":1,"ts":"..."}
{"type":"thinking","seq":1,"delta":"用户的想","ts":"..."}
{"type":"thinking","seq":1,"delta":"法是要列出文件...","ts":"..."}
{"type":"tool_call","seq":1,"name":"bash","args":{"command":"ls -la"},"ts":"..."}
{"type":"tool_result","seq":1,"name":"bash","content":"total 24...","ts":"..."}
{"type":"text","seq":1,"content":"当前目录有以下文件...","ts":"..."}
{"type":"suggestions","seq":1,"commands":["cd src","git status"],"ts":"..."}
{"type":"turn_end","seq":1,"ts":"..."}
```

**关键点**：
- 每启一个终端会话 → `zsh-ai session start` 自动执行（通过 precmd hook）
- 每次 `zsh-ai process` 追加 turn 到当前会话文件
- 下次 `process` 时读取上次的会话文件用于上下文

### 4. AI 处理器 (AI Processor)

调用 `pi --mode json --provider <provider> --model <model> -p "<input>"`，通过 stdin 传入上下文，解析 stdout 的 JSONL 事件流。

#### 支持的事件类型

| JSONL 事件类型 | 渲染方式 |
|---------------|---------|
| `type: message_update, assistantMessageEvent.type: thinking_delta` | 灰色斜体逐字展示，类似 Claude Code 思考 |
| `type: message_update, assistantMessageEvent.type: tool_call` | `🔧 执行工具: <name>` + 黄色高亮参数 |
| `type: message_update, assistantMessageEvent.type: tool_result` | `📄 结果:` + 绿色预览 |
| `type: message_update, assistantMessageEvent.type: text_delta` | 普通白色文本 |

**渲染风格** — 所有输出显示在独立框中，与 ZSH prompt 区分：

```
┌─────────────────────────────────────────────────────────────┐
│ 🤔 正在思考: 用户的想要列出当前目录的文件...                  │
│                                                             │
│ 🔧 执行工具: bash                                           │
│ $ ls -la                                                    │
│                                                             │
│ 📄 结果:                                                    │
│ total 24                                                    │
│ ...                                                         │
│                                                             │
│ 💬 当前目录有以下文件和子目录：(略)                         │
│                                                             │
│ 📋 建议下一条命令:                                          │
│   cd src/        # 进入源码目录                             │
│   git status     # 查看仓库状态                             │
│   ls -la         # 查看详情                                 │
└─────────────────────────────────────────────────────────────┘
```

**上下文注入**：每次调用 pi 时，自动读取当前会话文件的前 50 条交互记录作为上下文附加到 prompt 中，让 AI 感知之前的对话。

### 5. 命令建议器 (Command Suggester)

双层建议策略：

1. **AI 生成**（主要）：在 `zsh-ai process` 结束时，AI 在响应末尾附带 2-3 条接下来的建议命令。解析 AI 回复中 `## 建议` 或 `📋` 标识后的命令列表。
2. **历史分析**（补充）：读取 `~/.zsh_history`，根据当前 cwd 过滤出高频命令（如当前目录下最近使用的前 10 条命令）。

合并输出：AI 建议在前，历史建议在后（若与 AI 建议重复则跳过）。

### 6. 会话清理 (Session Clean)

```
zsh-ai session clean [options]
```

| flag | 说明 |
|------|------|
| `--days <n>` | 清理 n 天前的会话（默认 30） |
| `--all` | 清理所有会话 |
| `--interactive` | 交互式选择删除 |
| `--dry-run` | 仅列出要删除的文件，不实际删除 |

### 7. 命令补全 / Autocomplete 集成

可选的 ZSH Tab 补全（通过 `compdef`）：
- 输入 `zsh-ai p` → Tab → `process`
- 输入 `zsh-ai s` → Tab → `session`
- `zsh-ai session c` → Tab → `clean`

## 初始化与安装

### 安装

```bash
# 全局安装 CLI
npm install -g zsh-ai

# 添加 ZSH 集成到 .zshrc
echo 'eval "$(zsh-ai init)"' >> ~/.zshrc
```

### zsh-ai init 输出的 ZSH 代码

```zsh
# zsh-ai 初始化
# 如果 zsh-ai 未安装，不报错
if command -v zsh-ai &>/dev/null; then
    # ZLE Widget：拦截 accept-line
    zsh-ai-orig-accept-line() { zle .accept-line; }
    zsh-ai-accept-line() {
        local input="$BUFFER"
        [[ -z "$input" ]] && { zle .accept-line; return }
        if zsh-ai detect "$input" 2>/dev/null; then
            BUFFER="zsh-ai process ${(q)input}"
            zle .accept-line
        else
            zle .accept-line
        fi
    }
    zle -N accept-line zsh-ai-accept-line

    # precmd hook：每次 prompt 前自动启动新会话（如果需要）
    _zsh_ai_precmd() {
        if [[ -z "$_ZSH_AI_SESSION_STARTED" ]]; then
            zsh-ai session start &>/dev/null
            _ZSH_AI_SESSION_STARTED=1
        fi
    }
    precmd_functions+=(_zsh_ai_precmd)

    # 保留 command_not_found_handler 作为备选
    function zsh-ai-fallback-handler() {
        local cmd="$1"
        # 如果 ZLE Widget 没有拦截到（比如粘贴多行），fallback 到这里
        if zsh-ai detect "$*" 2>/dev/null; then
            zsh-ai process "$*"
            return $?
        fi
        return 127
    }
    [[ -z "$_ZSH_AI_ORIG_CNF" ]] && _ZSH_AI_ORIG_CNF="$(typeset -f command_not_found_handler 2>/dev/null)"
    function command_not_found_handler() {
        zsh-ai-fallback-handler "$@" || return 127
    }
fi
```

## 命令参考

```
zsh-ai process <text>          处理自然语言输入（核心命令）
zsh-ai detect <text>          检测是否为自然语言（exit code 0/1）
zsh-ai init                   输出 ZSH 集成代码
zsh-ai session start          开始新会话（创建会话文件）
zsh-ai session list           列出所有会话
zsh-ai session show <id>      查看会话详情
zsh-ai session clean [opts]   清理历史会话
zsh-ai suggest [--cwd <dir>]  基于历史建议命令
zsh-ai --help                 帮助信息
zsh-ai --version              版本信息
```

全局 flags：
```
--provider <name>  指定 AI provider（默认使用 pi 配置）
--model <id>       指定模型（默认使用 pi 配置）
--debug            输出调试日志
--no-suggest       不显示命令建议
```

## 错误处理

| 场景 | 行为 |
|------|------|
| pi 命令不可用 | 输出 "\`pi\` 未安装，请先安装 pi" + exit 1 |
| pi 调用超时（300s） | 输出 "AI 处理超时，请重试" |
| pi 调用失败 | 输出错误信息，保留错误日志到会话文件 |
| sesison 目录不可写 | 输出警告但继续工作（跳过持久化） |
| ZLE 插件加载时 zsh-ai 不可用 | 静默 skip，不阻塞 shell 启动 |

## 非目标

- 不替换 pi-coding-agent，仅作为其前端调用者
- 不休改 ZSH 内置的 completion 系统
- 不监听命令执行后的 stdout/stderr（仅使用 zsh history）
- 不提供 GUI/TUI 界面

## 未来扩展

- 支持多轮对话（在同一终端内连续 NLP 输入形成对话）
- 支持在工具执行结果中显示全部输出（按 q 退出 pager）
- 支持自定义 system prompt
- 支持 MCP tools 集成
