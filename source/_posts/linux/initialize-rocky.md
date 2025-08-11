---
title: 初始化 Rocky
excerpt: 重新部署了台虚拟机，发现初始化的步骤很多很杂，于是集中记录下。
tags:
  - rocky
categories: Linux
date: 2025-08-05 12:00:00
---

当虚拟机安装好以后，我的步骤一般是先更新 apt 软件源，再安装 zsh，git, docker 等软件。

更新镜像源
```bash
sed -e 's|^mirrorlist=|#mirrorlist=|g' \
    -e 's|^#baseurl=http://dl.rockylinux.org/$contentdir|baseurl=https://mirrors.aliyun.com/rockylinux|g' \
    -i.bak \
    /etc/yum.repos.d/rocky-*.repo

dnf makecache
```

安装 zsh
```bash
dnf install -y zsh util-linux-user
chsh -s /bin/zsh

dnf install -y wget jq psmisc vim net-tools telnet yum-utils device-mapper-persistent-data lvm2 git
export http_proxy=http://192.168.157.50:7890
export https_proxy=http://192.168.157.50:7890
wget https://raw.githubusercontent.com/robbyrussell/oh-my-zsh/master/tools/install.sh

安装字体
git clone https://github.com/powerline/fonts.git
cd fonts && sh install.sh

安装插件
cd ~/.oh-my-zsh/custom/plugins
git clone https://github.com/zsh-users/zsh-syntax-highlighting.git
git clone https://github.com/zsh-users/zsh-autosuggestions.git

编辑 ~/.zshrc 文件：

plugins=(git wd zsh-syntax-highlighting zsh-autosuggestions)

# 不解析通配符 *
setopt no_nomatch
```

关闭防火墙、selinux、dnsmasq、swap
```bash
systemctl disable --now firewalld
systemctl disable --now dnsmasq

setenforce 0
sed -i 's#SELINUX=enforcing#SELINUX=disabled#g' /etc/sysconfig/selinux
sed -i 's#SELINUX=enforcing#SELINUX=disabled#g' /etc/selinux/config

swapoff -a && sysctl -w vm.swappiness=0
sed -ri '/^[^#]*swap/s@^@#@' /etc/fstab
```

安装 Docker
```bash
dnf install -y dnf-plugins-core
dnf config-manager --add-repo https://mirrors.aliyun.com/docker-ce/linux/centos/docker-ce.repo
dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

cat <<EOF | tee /etc/modules-load.d/containerd.conf
overlay
br_netfilter
EOF

modprobe overlay
modprobe br_netfilter

cat <<EOF | tee /etc/sysctl.d/99-kubernetes-cri.conf
net.bridge.bridge-nf-call-iptables  = 1
net.ipv4.ip_forward                 = 1
net.bridge.bridge-nf-call-ip6tables = 1
EOF

sysctl --system

mkdir -p /etc/containerd
containerd config default | tee /etc/containerd/config.toml
sed -i 's#SystemdCgroup = false#SystemdCgroup = true#g' /etc/containerd/config.toml
sed -i 's#k8s.gcr.io/pause#registry.aliyuncs.com/google_containers/pause#g' /etc/containerd/config.toml
sed -i 's#registry.gcr.io/pause#registry.aliyuncs.com/google_containers/pause#g' /etc/containerd/config.toml
sed -i 's#registry.k8s.io/pause#registry.aliyuncs.com/google_containers/pause#g' /etc/containerd/config.toml

systemctl daemon-reload
systemctl enable --now docker
```

k8s 集群初始化
```bash
cat <<EOF | tee /etc/yum.repos.d/kubernetes.repo
[kubernetes]
name=Kubernetes
baseurl=https://mirrors.aliyun.com/kubernetes-new/core/stable/v1.33/rpm/
enabled=1
gpgcheck=1
gpgkey=http://mirrors.aliyun.com/kubernetes-new/core/stable/v1.33/rpm/repodata/repomd.xml.key
EOF

dnf install -y kubeadm-1.33.* kubelet-1.33.* kubectl-1.33.*
systemctl enable --now kubelet

kubeadm config images pull --image-repository registry.aliyuncs.com/google_containers --kubernetes-version 1.33.3

kubeadm init --apiserver-advertise-address 172.0.14.18 --image-repository registry.aliyuncs.com/google_containers --cri-socket "unix:///var/run/containerd/containerd.sock" --kubernetes-version 1.33.3

kubectl taint node -l node-role.kubernetes.io/control-plane node-role.kubernetes.io/control-plane:NoSchedule-
```

zsh 添加 kubectl 补全
```bash
mkdir ~/.oh-my-zsh/custom/plugins/kubectl
kubectl completion zsh > ~/.oh-my-zsh/custom/plugins/kubectl/kubectl.zsh

vim ~/.zshrc
# 在 plugins 加上 kubectl
```

安装 calico
- https://docs.tigera.io/calico/latest/getting-started/kubernetes/quickstart
- https://github.com/kubernetes-sigs/metrics-server
