---
title: 初始化 Ubuntu
excerpt: 重新部署了台虚拟机，发现初始化的步骤很多很杂，于是集中记录下。
tags:
  - ubuntu
categories: Linux
abbrlink: 76ae49e7
date: 2023-07-20 08:57:39
---

当虚拟机安装好以后，我的步骤一般是先更新 apt 软件源，再安装 zsh，git, docker 等软件。

## 更新 apt 软件源

首先将软件源配置文件备份。

```bash
sudo mv /etc/apt/sources.list /etc/apt/sources.list.bak
```

然后在 [清华大学 Ubuntu 镜像站](https://mirrors.tuna.tsinghua.edu.cn/help/ubuntu/) 复制对应版本的软件源配置并更新。

```bash
sudo apt update
```

其他常用镜像站：
- [网易镜像站](https://mirrors.163.com/.help/ubuntu.html)
- [阿里云镜像站](https://developer.aliyun.com/mirror/ubuntu/)
- [中科大镜像站](https://mirrors.ustc.edu.cn/help/ubuntu.html)

## Git

### 安装最新版本

Ubuntu apt 安装的 git 版本都很低，现将其卸载，然后参考 [官方文档](https://git-scm.com/download/linux) 安装最新版本。

```bash
sudo apt remove -y git
sudo add-apt-repository ppa:git-core/ppa
sudo apt install -y git
```

### 初始配置

安装 Git 后需要更新用户信息和文本编辑器，根据 [官方文档](https://git-scm.com/book/zh/v2/%E8%B5%B7%E6%AD%A5-%E5%88%9D%E6%AC%A1%E8%BF%90%E8%A1%8C-Git-%E5%89%8D%E7%9A%84%E9%85%8D%E7%BD%AE) 更新。

```bash
git config --global user.name "{name}"
git config --global user.email "{email}"
# 将默认编辑器改为 vim
git config --global core.editor "vim"
# 配置 log 和 diff 等命令使用的分页器，默认是 less，可配置 more
git config --global core.pager ""
```

检查配置信息。

```bash
$ git config --global --list
user.name={name}
user.email={email}
core.editor=vim
core.pager=less
```

## Docker

Docker 的安装以 [官方文档](https://docs.docker.com/engine/install/ubuntu) 为准。

### 卸载旧版本

旧版本的 Docker 被称为 docker，docker.io 或 docker-engine。如果安装了它们，需要先卸载。

```bash
for pkg in docker.io docker-doc docker-compose podman-docker containerd runc; do sudo apt remove $pkg; done
```

另外需要删除旧版本的数据文件，否则有可能会出现 containerd 无法启动的问题。

```bash
sudo rm -rf /var/lib/docker
sudo rm -rf /var/lib/containerd
```

### 配置软件库

更新 apt 的包索引，然后安装软件包允许 apt 通过 HTTPS 使用软件库。

```bash
sudo apt update

sudo apt install ca-certificates curl gnupg
```

添加 Docker 官方 GPG 密钥。

```bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
```

设置 Docker 软件库。

```bash
echo \
  "deb [arch="$(dpkg --print-architecture)" signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  "$(. /etc/os-release && echo "$VERSION_CODENAME")" stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
```

### 安装

更新 apt 包索引，然后安装最新版的 Docker 和 containerd。

```bash
sudo apt update
sudo apt install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```
使用以下命令测试是否安装成功。

```sh
$ docker --version
Docker version 24.0.2, build cb74dfc
```

### 更新国内源

创建 `/etc/docker/daemon.json` 文件并填入以下内容，也可以在 [阿里云镜像加速](https://cr.console.aliyun.com/cn-hangzhou/instances/mirrors) 获取专属地址加入其中。

```bash
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json <<-'EOF'
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "http://hub-mirror.c.163.com",
    "https://registry.docker-cn.com"
  ]
}
EOF
```

重启 Docker 并测试镜像下载速度。

```bash
sudo systemctl daemon-reload
sudo systemctl restart docker
docker run --rm hello-world
```

## 生成 SSH 公钥

服务器使用 SSH 公钥进行认证，所以需要使用 `ssh-keygen` 生成 SSH 公钥认证所需的公钥和私钥文件。

### 检查密钥目录

默认情况下，用户的 SSH 密钥存储在 `~/.ssh` 目录下，先检查是否有该目录，该目录下使用已有密钥。

```bash
$ ls ~/.ssh
authorized_keys  id_ed25519  id_ed25519.pub  known_hosts
```

其中 `id_ed25519` 是私钥文件，对应算法是 ed25519，另一个带有 `.pub` 扩展名的文件是公钥。

### 生成 RSA 类型密钥对

`ssh-keygen` 默认会在密钥目录生成 RSA 类型密钥对，`-C` 参数用来添加注释，一般使用自己的邮箱。

```bash
ssh-keygen -C foo@bar.com
```

生成的密钥文件 `id_rsa` 和 `id_rsa.pub`。

```bash
$ ls ~/.ssh
authorized_keys  id_rsa  id_dsa.pub  known_hosts
```

### 生成 ED25519 类型密钥对

`ssh-keygen` 可以使用 `-t` 参数指定密钥类型。

```bash
ssh-keygen -t ed25519 -C foo@bar.com
```

生成的密钥文件 `id_ed25519` 和 `id_ed25519.pub`。

```bash
$ ls ~/.ssh
authorized_keys  id_ed25519  id_ed25519.pub  known_hosts
```

### 免密登录

使用 `ssh-copy-id` 将公钥发送到服务器，之后就可以直接登录，而不用输入密码。

```bash
ssh-copy-id -i ~/.ssh/id_ed25519.pub root@xxx.xxx.xxx.xxx
```

另外可以配置 `~/.ssh/config` 更快捷的登录服务器。

```
Host demo
    HostName xxx.xxx.xxx.xxx
    User root
    IdentifyFile ~/.ssh/id_ed25519
    IdentitiesOnly yes
```

之后就可以直接 `ssh demo` 登录服务器。

## Golang

### apt 安装最新版本

> 不清楚该方法 GOPATH 需要怎么配置。

添加 apt 源。

```bash
sudo add-apt-repository ppa:longsleep/golang-backports
sudo apt update
```

安装最新版本 Golang 或指定版本。

```bash
# 最新版本
sudo apt install -y golang-go
# 指定 1.19
sudo apt install -y golang-1.19-go
```

如果不需要了想删除源。

```bash
sudo add-apt-repository -r ppa:longsleep/golang-backports
sudo apt update
```

### 二进制文件安装

在 [官方下载页面](https://go.dev/dl/) 下载对应版本的二进制压缩包，解压到指定目录，推荐 `/usr/local/` 或 `/opt/`。

```bash
tar -zxvf go1.19.4.linux-amd64.tar.gz -C /usr/local
```

在 `~/.bashrc` 或 `~/.zshrc` 更新 PATH。

```bash
# Go 配置
export GOPATH="/root/go"
export GOROOT="/usr/local/go"
export GO111MODULE="on"
export GOPROXY="https://goproxy.cn,direct"
# PATH
export PATH=$GOPATH/bin:$GOROOT/bin:$PATH
```

### 初始配置

除了直接写入文件的配置方式外，还可以使用 `go env -w` 进行配置，首先修改 PATH。

```bash
export PATH=/root/go/bin:/usr/local/go/bin:$PATH
```

再使用 `go env` 配置其他。

```bash
go env GOPATH="/root/go"
go env GOROOT="/usr/local/go"
go env -w GO111MODULE="on"
go env -w GOPROXY="https://goproxy.cn,direct"
```

可以使用 `go env` 验证是否修改成功。

```bash
$ go env
GO111MODULE="on"
GOARCH="amd64"
GOBIN=""
GOOS="linux"
GOPATH="/root/go"
GOPROXY="https://goproxy.cn,direct"
GOROOT="/usr/local/go"
```

## Nodejs

### apt 安装最新版本

首先到 [Nodejs 官网](https://nodejs.org/zh-cn) 找到最新的版本号，按照对应的版本修改并添加源。

```bash
# 当前 LTS 版本为 18.17.0，所以 setup_{version} 为 setup_18
curl -sL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
```

在我的虚拟机 Ubuntu 18.04 发现无法安装 18.17.0，错误提示为：

```txt
The following packages have unmet dependencies:
 nodejs : Depends: libc6 (>= 2.28) but 2.27-3ubuntu1.6 is to be installed
E: Unable to correct problems, you have held broken packages.
```

于是我安装了上一个 LTS 版本：16.20.1。

```bash
curl -sL https://deb.nodesource.com/setup_16.x | sudo -E bash -
sudo apt install -y nodejs
```

如果不需要了想删除源。

```bash
sudo rm -rf /etc/apt/sources.list.d/nodesource.list
sudo apt update
```

### 二进制文件安装

在 [官方下载页面](https://nodejs.org/zh-cn/download) 下载二进制压缩包，解压到指定目录，推荐 `/usr/local/` 或 `/opt/`。

```bash
tar -xvf node-v18.17.0-linux-x64.tar.xz
sudo mv node-v18.17.0-linux-x64 /usr/local/node
```

在 `~/.bashrc` 或 `~/.zshrc` 更新 PATH。

```bash
export PATH=/usr/local/node/bin:$PATH
```

### 更新源

更新 npm 为国内源，并安装 yarn。

```bash
npm config set registry https://registry.npm.taobao.org/
npm install -g yarn
yarn config set registry https://registry.npm.taobao.org/
```

### 安装 hexo

全局安装 hexo-cli

```bash
yarn install -g hexo-cli
```


[^1]: [ssh-keygen 命令生成RSA、ed25519类型密钥对](https://blog.csdn.net/qq_27818541/article/details/125567360)
[^2]: [Ubuntu 安装最新版本 Node.js](https://learnku.com/articles/42581)