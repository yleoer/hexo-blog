---
title: Linux 下安装与配置 Zsh
excerpt: 记录在 Ubuntu、Rocky/CentOS 上安装 Zsh、切换默认 Shell、安装 Oh My Zsh，并配置 fzf-tab、补全、命令建议、语法高亮和 kubectl 自动补全。
tags:
  - zsh
  - oh-my-zsh
  - fzf
categories: Linux
abbrlink: ccdb6587
date: 2021-11-22 11:00:00
---

Zsh 比 Bash 更适合作为日常交互式 Shell。配合 Oh My Zsh、模糊补全、命令高亮、命令建议和 kubectl 自动补全后，服务器上的命令行体验会舒服很多。

这篇记录一套我常用的安装流程，适用于 Ubuntu、Rocky Linux 和 CentOS。

## 安装 Zsh

先确认系统里已有的 Shell，以及当前正在使用的 Shell。

```bash
cat /etc/shells
echo "$SHELL"
```

Ubuntu 使用 `apt` 安装。

```bash
sudo apt update
sudo apt install -y zsh git curl wget
```

Rocky Linux、CentOS 8 及以上版本可以使用 `dnf`。

```bash
sudo dnf install -y zsh git curl wget util-linux-user
```

CentOS 7 可以使用 `yum`。

```bash
sudo yum install -y zsh git curl wget util-linux-user
```

安装完成后，将默认 Shell 切换为 Zsh。

```bash
chsh -s "$(command -v zsh)"
```

重新登录后确认是否生效。

```bash
echo "$SHELL"
zsh --version
```

> 如果 `chsh` 不存在，通常是缺少 `util-linux-user`。

## 安装 Oh My Zsh

官方推荐直接通过 `curl` 或 `wget` 执行安装脚本。

```bash
sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"
```

如果 `raw.githubusercontent.com` 访问不稳定，可以先下载脚本，确认内容后再执行。

```bash
wget https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh
sh install.sh
```

## 配置常用插件

我常用这几个外部插件：

- [fzf-tab](https://github.com/Aloxaf/fzf-tab)：用 fzf 接管 Tab 补全结果，选择目录、命令、Git 分支会更方便。
- [zsh-completions](https://github.com/zsh-users/zsh-completions)：补充更多命令的自动补全。
- [zsh-autosuggestions](https://github.com/zsh-users/zsh-autosuggestions)：根据历史命令给出灰色建议。
- [fast-syntax-highlighting](https://github.com/zdharma-continuum/fast-syntax-highlighting)：输入命令时做语法高亮。
- [zsh-history-substring-search](https://github.com/zsh-users/zsh-history-substring-search)：输入片段后按上下键搜索历史命令。

`fzf-tab` 依赖 `fzf`，先安装它。

```bash
# Ubuntu
sudo apt install -y fzf

# Rocky Linux / CentOS
sudo dnf install -y epel-release
sudo dnf install -y fzf
```

如果是 CentOS 7，可以把 `dnf` 换成 `yum`。

安装插件到 Oh My Zsh 的自定义插件目录。

```bash
ZSH_CUSTOM=${ZSH_CUSTOM:-~/.oh-my-zsh/custom}
mkdir -p "$ZSH_CUSTOM/plugins"

git clone https://github.com/Aloxaf/fzf-tab "$ZSH_CUSTOM/plugins/fzf-tab"
git clone https://github.com/zsh-users/zsh-completions "$ZSH_CUSTOM/plugins/zsh-completions"
git clone https://github.com/zsh-users/zsh-autosuggestions "$ZSH_CUSTOM/plugins/zsh-autosuggestions"
git clone https://github.com/zdharma-continuum/fast-syntax-highlighting.git "$ZSH_CUSTOM/plugins/fast-syntax-highlighting"
git clone https://github.com/zsh-users/zsh-history-substring-search "$ZSH_CUSTOM/plugins/zsh-history-substring-search"
```

编辑 `~/.zshrc`，启用插件。

```text
# zsh-completions 需要放在 source oh-my-zsh.sh 之前。
fpath+=${ZSH_CUSTOM:-${ZSH:-~/.oh-my-zsh}/custom}/plugins/zsh-completions/src

plugins=(
  git
  wd
  kubectl
  fzf-tab
  zsh-autosuggestions
  fast-syntax-highlighting
  zsh-history-substring-search
)

source "$ZSH/oh-my-zsh.sh"

# 输入命令片段后，按上下键搜索历史命令。
bindkey '^[[A' history-substring-search-up
bindkey '^[[B' history-substring-search-down
```

> `fzf-tab` 建议放在 `zsh-autosuggestions` 和 `fast-syntax-highlighting` 前面。

如果经常遇到包含通配符的命令被 Zsh 提前解析，可以加上下面这行。

```text
setopt no_nomatch
```

修改后清理补全缓存，并重新进入 Zsh。

```bash
rm -f ~/.zcompdump*
exec zsh
```

## 添加 kubectl 官方补全

如果机器上安装了 `kubectl`，且没有使用 Oh My Zsh 自带的 `kubectl` 插件，也可以把官方自动补全直接加入 `~/.zshrc`。

```bash
cat >> ~/.zshrc <<'EOF'

# kubectl completion
source <(kubectl completion zsh)
EOF
```

如果重新打开 Shell 后出现 `compdef` 相关错误，在 `~/.zshrc` 前面补上初始化配置。

```text
autoload -Uz compinit
compinit
```

重新加载后，kubectl 子命令和资源名就可以通过 Tab 补全。

```bash
source ~/.zshrc
```

## 常用检查命令

最后可以用下面几条命令确认安装结果。

```bash
zsh --version
echo "$SHELL"
echo "$ZSH"
omz version
```
