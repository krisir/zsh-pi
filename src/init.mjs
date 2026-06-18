// src/init.mjs — ZSH init script for zsh-pi
export function getInitScript() {
  return `# zsh-pi 初始化
if command -v zsh-pi &>/dev/null; then
  # 不拦截 accept-line：先当作正常命令执行
  # 只有命令不存在时，command_not_found_handler 才会触发 AI

  # precmd hook：首次 prompt 前自动启动会话
  typeset -g _ZSH_PI_SESSION_STARTED=0
  __zsh_pi_precmd() {
    if [[ "$_ZSH_PI_SESSION_STARTED" -eq 0 ]]; then
      zsh-pi session start &>/dev/null
      _ZSH_PI_SESSION_STARTED=1
    fi
  }
  precmd_functions+=(__zsh_pi_precmd)

  # command_not_found_handler fallback
  if ! typeset -f __zsh_pi_cnf_backup &>/dev/null; then
    if typeset -f command_not_found_handler &>/dev/null; then
      __zsh_pi_cnf_backup() { command_not_found_handler "$@"; }
    fi
  fi
  function command_not_found_handler() {
    # 先去执行 AI 处理
    zsh-pi process "$*"
    local ret=$?
    if [[ $ret -ne 0 ]] || typeset -f __zsh_pi_cnf_backup &>/dev/null; then
      # AI 处理失败，走原有 handler
      if typeset -f __zsh_pi_cnf_backup &>/dev/null; then
        __zsh_pi_cnf_backup "$@"
      else
        echo "zsh: command not found: $*" >&2
        return 127
      fi
    fi
    return 0
  }

  # Tab 补全
  if ! typeset -f _zsh_pi_completion &>/dev/null; then
    _zsh_pi_completion() {
      local -a cmds; cmds=(
        'process:处理自然语言输入'
        'detect:检测是否为自然语言'
        'init:输出 ZSH 集成代码'
        'session:管理会话'
        'suggest:建议命令'
        '--help:显示帮助'
        '--version:显示版本'
      )
      _describe 'zsh-pi' cmds
    }
    compdef _zsh_pi_completion zsh-pi
  fi
fi`;
}
