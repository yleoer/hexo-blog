---
title: Ubuntu 服务器初始化记录
excerpt: 记录新装 Ubuntu 后常用的初始化步骤：更新 APT 软件源、安装基础工具、配置 Git、Docker、SSH 密钥、Go 和 Node.js 环境。
tags:
  - ubuntu
  - git
  - docker
  - ssh
  - golang
  - nodejs
categories: Linux
abbrlink: 76ae49e7
date: 2023-07-20 08:57:39
---

每次新装 Ubuntu 服务器，都会重复做一批基础配置：换软件源、装常用工具、配置 Git、安装 Docker、准备 SSH 密钥，以及配置 Go 和 Node.js 环境。步骤不复杂，但零散命令太多，集中记录一份以后会省心很多。

这篇以服务器环境为主，桌面版 Ubuntu 也可以参考。

## 更新 APT 软件源

先确认系统版本代号，后面配置软件源时会用到。

```bash
. /etc/os-release
echo "$VERSION_CODENAME"
```

Ubuntu 24.04 及更新版本默认使用 deb822 格式，主源通常在 `/etc/apt/sources.list.d/ubuntu.sources`；旧版本更多使用 `/etc/apt/sources.list`。

备份当前配置。

```bash
sudo cp /etc/apt/sources.list /etc/apt/sources.list.bak 2>/dev/null || true
sudo cp /etc/apt/sources.list.d/ubuntu.sources /etc/apt/sources.list.d/ubuntu.sources.bak 2>/dev/null || true
```

国内服务器可以参考这些镜像站生成对应版本的软件源配置：

- [清华大学 Ubuntu 镜像站](https://mirrors.tuna.tsinghua.edu.cn/help/ubuntu/)
- [网易 Ubuntu 镜像站](https://mirrors.163.com/.help/ubuntu.html)
- [阿里云 Ubuntu 镜像站](https://developer.aliyun.com/mirror/ubuntu/)
- [中科大 Ubuntu 镜像站](https://mirrors.ustc.edu.cn/help/ubuntu.html)

修改完成后更新软件包索引，并升级系统已有软件包。

```bash
sudo apt update
sudo apt upgrade -y
```

## 安装基础工具

先安装一批常用命令，后续配置 Git、Docker、Go 都会用到。

```bash
sudo apt install -y \
  ca-certificates \
  curl \
  wget \
  vim \
  git \
  gpg \
  lsb-release \
  software-properties-common \
  unzip \
  tar \
  jq \
  htop
```

Zsh 的完整配置我单独放在了 [Linux 下安装与配置 Zsh](/posts/ccdb6587.html)。

## 配置 Git

Ubuntu 默认仓库里的 Git 通常够用。如果需要更新的稳定版，可以参考 [Git 官方 Linux 安装文档](https://git-scm.com/download/linux) 使用 `git-core/ppa`。

```bash
sudo add-apt-repository -y ppa:git-core/ppa
sudo apt update
sudo apt install -y git
```

配置用户名、邮箱和默认编辑器。

```bash
git config --global user.name "yleoer"
git config --global user.email "yleoer@163.com"
git config --global core.editor "vim"
```

我还会顺手关闭中文路径转义，并统一日志输出编码。

```bash
git config --global core.quotepath false
git config --global i18n.commitEncoding UTF-8
git config --global i18n.logOutputEncoding UTF-8
```

检查配置。

```bash
git config --global --list
```

## 安装 Docker

Docker 的安装方式以 [Docker Engine 官方 Ubuntu 文档](https://docs.docker.com/engine/install/ubuntu/) 为准。下面使用官方 APT 仓库安装，后续升级也可以继续走 `apt`。

先移除可能冲突的旧包。

```bash
for pkg in docker.io docker-doc docker-compose docker-compose-v2 podman-docker containerd runc; do
  sudo apt remove -y "$pkg"
done
```

添加 Docker 官方 GPG key 和 deb822 软件源。

```bash
sudo apt update
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

sudo apt update
```

如果官方源访问比较慢，可以改用国内镜像源。下面以清华大学 Docker CE 镜像为例，GPG key 和 APT 源都切到镜像站。

```bash
sudo apt update
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://mirrors.tuna.tsinghua.edu.cn/docker-ce/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://mirrors.tuna.tsinghua.edu.cn/docker-ce/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

sudo apt update
```

安装 Docker Engine、Buildx 和 Compose 插件。

```bash
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

启动并验证。

```bash
sudo systemctl enable --now docker
sudo docker run --rm hello-world
docker --version
docker compose version
```

### 配置 Docker 日志和镜像源

创建 `/etc/docker/daemon.json`，限制容器日志大小，并按需添加镜像加速地址。

```bash
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json >/dev/null <<'EOF'
{
  "exec-opts": ["native.cgroupdriver=systemd"],
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "100m",
    "max-file": "3"
  },
  "storage-driver": "overlay2",
  "registry-mirrors": [
    "https://docker.1ms.run",
    "https://docker.1panel.live",
    "https://docker.sparkcr.cn",
    "https://hub.rat.dev",
    "https://dockerproxy.net"
  ]
}
EOF
```

重启 Docker。

```bash
sudo systemctl daemon-reload
sudo systemctl restart docker
```

### 允许当前用户运行 Docker

如果不想每次都输入 `sudo docker`，把当前用户加入 `docker` 用户组。

```bash
sudo usermod -aG docker "$USER"
newgrp docker
docker run --rm hello-world
```

如果 `newgrp docker` 后仍然不生效，退出当前 SSH 会话并重新登录。

## 生成 SSH 密钥

先检查本机是否已经有密钥。

```bash
ls -al ~/.ssh
```

如果还没有，推荐生成 ED25519 密钥。

```bash
ssh-keygen -t ed25519 -C "yleoer@163.com"
```

生成后会得到私钥和公钥。

```text
~/.ssh/id_ed25519
~/.ssh/id_ed25519.pub
```

私钥不要泄露；公钥可以添加到 Git 平台或复制到服务器。

```bash
ssh-copy-id -i ~/.ssh/id_ed25519.pub root@xxx.xxx.xxx.xxx
```

也可以配置 `~/.ssh/config` 简化登录命令。

```text
Host demo
    HostName xxx.xxx.xxx.xxx
    User root
    IdentityFile ~/.ssh/id_ed25519
    IdentitiesOnly yes
```

之后直接登录。

```bash
ssh demo
```

## 安装 Go

如果只是使用系统仓库版本，可以直接安装。

```bash
sudo apt install -y golang-go
go version
```

如果需要官方最新稳定版，推荐从 [Go 官方下载页](https://go.dev/dl/) 下载二进制包。先移除旧的手动安装目录，再解压到 `/usr/local`。

```bash
# 将 go1.26.5.linux-amd64.tar.gz 替换成官方下载页里的实际文件名
sudo rm -rf /usr/local/go
sudo tar -C /usr/local -xzf go1.26.5.linux-amd64.tar.gz
```

把 Go 命令和 `go install` 安装的工具加入 PATH。

```bash
cat >> ~/.profile <<'EOF'

# Go
export PATH="$PATH:/usr/local/go/bin"
export PATH="$PATH:$(go env GOPATH)/bin"
export GOPROXY="https://goproxy.cn,direct"
EOF

source ~/.profile
```

验证。

```bash
go version
go env GOPATH GOPROXY
```

## 安装 Node.js

Node.js 版本更新比较快，服务器上更适合用版本管理工具安装 LTS 版本。具体命令可以参考 [Node.js 官方下载页](https://nodejs.org/en/download)，按页面选择 `fnm`、`nvm` 或二进制包方式。

如果只是临时使用系统仓库版本，可以直接安装。

```bash
sudo apt install -y nodejs npm
node --version
npm --version
```

需要多个项目切换不同 Node.js 版本时，优先使用版本管理工具；这样不会和系统包管理器互相影响。

## 常用检查命令

初始化完成后，我通常会跑一遍这些命令确认状态。

```bash
lsb_release -a
git --version
docker --version
docker compose version
ssh -V
go version
node --version
npm --version
```

如果这些命令都正常，新机器就基本可以开始使用了。
