// src/init.mjs — ZSH init script
export function getInitScript() {
  return `# zsh-ai 初始化
# 如果 zsh-ai 未安装，静默跳过
if command -v zsh-ai &>/dev/null; then
  # ZLE Widget：拦截 accept-line
  __zsh_ai_accept_line() {
    local input="$BUFFER"
    [[ -z "$input" ]] && { zle .accept-line; return; }

    if zsh-ai detect "$input" 2>/dev/null; then
      BUFFER="zsh-ai process \${(q)input}"
      zle .accept-line
    else
      zle .accept-line
    fi
  }
  zle -N accept-line __zsh_ai_accept_line

  # precmd hook：每次 prompt 前自动启动新会话（仅首次）
  typeset -g _ZSH_AI_SESSION_STARTED=0
  __zsh_ai_precmd() {
    if [[ "$_ZSH_AI_SESSION_STARTED" -eq 0 ]]; then
      zsh-ai session start &>/dev/null
      _ZSH_AI_SESSION_STARTED=1
    fi
  }
  precmd_functions+=(__zsh_ai_precmd)

  # command_not_found_handler 作为备选拦截（当 ZLE Widget 未捕获时）
  if ! typeset -f __zsh_ai_cnf_backup &>/dev/null; then
    if typeset -f command_not_found_handler &>/dev/null; then
      __zsh_ai_cnf_backup() { command_not_found_handler "$@"; }
    fi
  fi
  function command_not_found_handler() {
    if zsh-ai detect "$*" 2>/dev/null; then
      zsh-ai process "$*"
      return $?
    fi
    if typeset -f __zsh_ai_cnf_backup &>/dev/null; then
      __zsh_ai_cnf_backup "$@"
    else
      echo "zsh: command not found: $*" >&2
      return 127
    fi
  }

  # Tab 补全
  if ! typeset -f _zsh_ai_completion &>/dev/null; then
    _zsh_ai_completion() {
      local -a cmds
      cmds=(
        'process:处理自然语言输入'
        'detect:检测是否为自然语言'
        'init:输出 ZSH 集成代码'
        'session:管理会话'
        'suggest:建议命令'
        '--help:显示帮助'
        '--version:显示版本'
      )
      _describe 'zsh-ai' cmds
    }
    compdef _zsh_ai_completion zsh-ai
  fi
fi`;
}
