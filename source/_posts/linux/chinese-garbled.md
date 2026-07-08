---
title: Linux 终端中文乱码排查
excerpt: 记录 git status、git log 和 ls 在终端中显示中文异常时的处理方法，包括 Git 编码配置和系统 locale 设置。
tags:
  - linux
  - ubuntu
  - git
  - locale
categories: Linux
abbrlink: 3dd87ec
date: 2023-11-02 10:40:21
---

在服务器上操作文件时，偶尔会遇到中文显示异常：`git status` 把中文文件名显示成转义字符，`git log` 里的提交信息看起来像乱码，或者 `ls` 直接无法正常显示中文。

这类问题通常分成两块：Git 自己的输出配置，以及系统终端的 locale 配置。

## Git 文件名显示异常

`git status` 默认可能会把非 ASCII 文件名转成带反斜杠的八进制转义。关闭 `core.quotepath` 后，中文文件名会按原样显示。

```bash
git config --global core.quotepath false
```

如果只想对当前仓库生效，去掉 `--global` 即可。

```bash
git config core.quotepath false
```

## Git 日志中文乱码

如果 `git log`、`git show` 里的中文提交信息显示异常，可以明确设置提交编码和日志输出编码。

```bash
git config --global i18n.commitEncoding UTF-8
git config --global i18n.logOutputEncoding UTF-8
```

配置后检查一下当前 Git 全局配置。

```bash
git config --global --list | grep -E 'quotepath|i18n'
```

预期能看到类似输出。

```text
core.quotepath=false
i18n.commitencoding=UTF-8
i18n.logoutputencoding=UTF-8
```

## ls 中文乱码

`ls` 显示中文异常时，先检查当前终端的 locale。

```bash
locale
locale -a | grep -Ei 'C.UTF-8|en_US.utf8|zh_CN.utf8'
```

如果系统里已经有 `C.UTF-8`，可以先在当前终端临时验证。

```bash
export LANG=C.UTF-8
export LC_CTYPE=C.UTF-8
```

再次执行 `ls`，如果中文已经正常显示，再把配置写入 Shell 配置文件。

```bash
cat >> ~/.zshrc <<'EOF'

# Locale
export LANG=C.UTF-8
export LC_CTYPE=C.UTF-8
EOF

source ~/.zshrc
```

使用 Bash 的话写入 `~/.bashrc`。

```bash
cat >> ~/.bashrc <<'EOF'

# Locale
export LANG=C.UTF-8
export LC_CTYPE=C.UTF-8
EOF

source ~/.bashrc
```

## 生成 UTF-8 locale

如果 `locale -a` 没有可用的 UTF-8 locale，可以在 Ubuntu 上生成一个。

```bash
sudo apt update
sudo apt install -y locales
sudo locale-gen en_US.UTF-8
sudo update-locale LANG=en_US.UTF-8 LC_CTYPE=en_US.UTF-8
```

重新登录后确认结果。

```bash
locale
```

## 小结

我一般按这个顺序处理：

1. `git status` 中文路径异常，先设置 `core.quotepath=false`。
2. `git log` 中文提交信息异常，再设置 `i18n.commitEncoding` 和 `i18n.logOutputEncoding`。
3. `ls` 或终端整体中文异常，检查并修复 `LANG`、`LC_CTYPE`。

`LC_ALL` 会覆盖其他 locale 配置，除非临时排查问题，一般不建议长期写入 Shell 配置文件。
