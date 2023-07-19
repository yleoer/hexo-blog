---
title: Linux 安装 zsh
excerpt: 如何在 CentOS 或 Ubuntu 系统中安装 zsh，并进行简单配置。
categories: Linux
target:
  - zsh
abbrlink: 36753
date: 2021-11-22 11:00:00
---

## 安装 zsh

```sh
# 查看服务器有哪些 shell 可用
cat /etc/shells

# 查看当前使用的 shell
echo $SHELL

# CentOS 下安装 zsh
yum -y install zsh

# Ubuntu 下安装 zsh
apt -y install zsh

# 设置为默认 shell
chsh -s /bin/zsh
```

## 安装 oh-my-zsh

获取安装脚本

```sh
wget https://raw.githubusercontent.com/robbyrussell/oh-my-zsh/master/tools/install.sh
```

> 如果无法下载，也可以使用国内镜像
>
> ```sh
> wget https://gitee.com/mirrors/oh-my-zsh/raw/master/tools/install.sh
> ```
>
> 需要对 *install.sh* 文件进行修改：
> ```sh
> REPO=${REPO:-mirrors/oh-my-zsh}
> REMOTE=${REMOTE:-https://gitee.com/${REPO}.git}
> ```

执行脚本

```sh
sh install.sh
```

## 添加插件

安装字体

```sh
git clone https://github.com/powerline/fonts.git
cd fonts && sh install.sh
```

安装插件

```sh
cd ~/.oh-my-zsh/custom/plugins
git clone https://github.com/zsh-users/zsh-syntax-highlighting.git
git clone https://github.com/zsh-users/zsh-autosuggestions.git
```

编辑 *~/.zshrc* 文件：

```
plugins=(
	git
	wd
	zsh-syntax-highlighting
	zsh-autosuggestions
)
```