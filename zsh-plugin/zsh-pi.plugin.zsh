# zsh-pi.plugin.zsh — Oh My Zsh plugin
if command -v zsh-pi &>/dev/null; then
  __zsh_pi_accept_line() {
    local input="$BUFFER"
    [[ -z "$input" ]] && { zle .accept-line; return; }
    if zsh-pi detect "$input" 2>/dev/null; then
      BUFFER="zsh-pi process ${(q)input}"
      zle .accept-line
    else
      zle .accept-line
    fi
  }
  zle -N accept-line __zsh_pi_accept_line

  typeset -g _ZSH_PI_SESSION_STARTED=0
  __zsh_pi_precmd() {
    if [[ "$_ZSH_PI_SESSION_STARTED" -eq 0 ]]; then
      zsh-pi session start &>/dev/null
      _ZSH_PI_SESSION_STARTED=1
    fi
  }
  precmd_functions+=(__zsh_pi_precmd)

  if ! typeset -f __zsh_pi_cnf_backup &>/dev/null; then
    if typeset -f command_not_found_handler &>/dev/null; then
      __zsh_pi_cnf_backup() { command_not_found_handler "$@"; }
    fi
  fi
  function command_not_found_handler() {
    if zsh-pi detect "$*" 2>/dev/null; then
      zsh-pi process "$*"
      return $?
    fi
    if typeset -f __zsh_pi_cnf_backup &>/dev/null; then
      __zsh_pi_cnf_backup "$@"
    else
      echo "zsh: command not found: $*" >&2
      return 127
    fi
  }

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
