---
title: Tailscale 中转和子网路由
excerpt: 通过 docker 搭建 tailscale 中转站，并解决子网冲突。
tags:
  - docker
categories: Linux
abbrlink: 1c7b32dc
date: 2025-09-12 10:38:22
---

> 注：此文章由 Gemini 2.5 Flash 生成，已通过腾讯云服务器和极空间验证成功。

---

**核心思路：**

1.  **云服务器**：作为Tailscale网络中的一个稳定节点，它将负责中转一部分流量（如果NAS与公司电脑之间无法直接P2P连接时，Tailscale会通过云服务器的DERP中继）。它也可以被配置为出口节点（Exit Node），但在这个场景中，它更像是Tailscale流量的“稳定锚点”。
2.  **NAS**：它将成为Tailscale的子网路由器 (Subnet Router)。它会向Tailscale网络宣告它拥有 `192.168.51.0/24` 这个网段的路由。
3.  **电脑**：安装Tailscale客户端后，通过Tailscale连接到NAS提供的 `192.168.51.0/24` 网段，从而避免与本地 `192.168.50.x` 网段冲突。

---

### 第一步：Tailscale 预备工作

1.  **注册 Tailscale 账号**：
    如果还没有Tailscale账号，请前往 [https://tailscale.com/register/](https://tailscale.com/register/) 注册一个。
2.  **熟悉 Tailscale 管理界面**：
    登录 Tailscale 管理后台 [https://login.tailscale.com/admin/machines](https://login.tailscale.com/admin/machines)，你会在这里授权和管理你的机器。

---

### 第二步：在云服务器上搭建 Tailscale

#### 1. 检查和开启 IP 转发 (如果 docker compose 的 tailscale 是 host network mode，则不需要手动开启)

Tailscale Docker 镜像通常会自动处理大部分网络配置。但是，如果后续你计划将此云服务器用作出口节点 (Exit Node) 或子网路由 (Subnet Router) 并将流量导出到云服务器的公网接口，你需要确保IP转发已启用。

```bash
# 检查当前状态
cat /proc/sys/net/ipv4/ip_forward

# 如果返回0，则需要启用
sudo sysctl -w net.ipv4.ip_forward=1
sudo sysctl -p

# 使设置永久生效
echo "net.ipv4.ip_forward=1" | sudo tee -a /etc/sysctl.conf
```

#### 2. 创建 `docker-compose.yml` 文件

在云服务器上创建 `docker-compose.yml` 文件。

```yaml
services:
  tailscale:
    # 使用官方的 tailscale/tailscale-git 镜像更常用，因为它包含了 tailscale CLI
    # 或者如果你只需要 daemon，则可以使用 tailscale/tailscale
    image: tailscale/tailscale:latest
    container_name: tailscale-cloud-server
    hostname: tencent-cloud # 为你的云服务器在Tailscale网络中设置一个主机名
    network_mode: host # 使用 host 网络模式，让容器直接使用宿主机的网络接口
    cap_add:
      - NET_ADMIN # 必须，允许修改网络接口
      - SYS_MODULE # 允许加载内核模块，有时需要
    environment:
      TS_HOSTNAME: tencent-cloud # 再次指定主机名
    volumes:
      - ./tailscale/data:/var/lib/tailscale # 持久化Tailscale状态和密钥
      - /dev/net/tun:/dev/net/tun # 必须，Tailscale需要TUN设备
    restart: unless-stopped
```

#### 3. 启动 Tailscale 容器并认证

```bash
docker compose up -d
```

容器启动后，查看日志会提示进行认证：

```bash
docker compose logs tailscale
```

你会看到类似这样的输出：

```
...
To authenticate, visit:
https://login.tailscale.com/a/aBcDeFgHiJkL
...
```

复制这个 URL，在你的浏览器中打开并登录你的 Tailscale 账号，然后授权这台云服务器。

#### 4. 在 Tailscale 管理界面中检查

登录 Tailscale 管理后台 [https://login.tailscale.com/admin/machines](https://login.tailscale.com/admin/machines)。你应该能看到名为 `cloud-ts` 的机器已经在线。

---

### 第三步：在 NAS 上搭建 Tailscale 并配置子网路由

#### 1. 检查和开启 IP 转发

NAS 也需要开启IP转发，因为它是你子网路由的出口。

```bash
# 检查当前状态
cat /proc/sys/net/ipv4/ip_forward

# 如果返回0，则需要启用
sudo sysctl -w net.ipv4.ip_forward=1
sudo sysctl -p

# 使设置永久生效
echo "net.ipv4.ip_forward=1" | sudo tee -a /etc/sysctl.conf
```

**重要说明：**
*   **对于群晖NAS**：如果NAS是Docker运行，且Docker是host网络模式，通常`sysctl`的修改会直接影响到宿主机。
*   **如果NAS上的服务在Docker中运行**：为了让 `192.168.51.x` 段的流量正确转发到这些Docker服务，你可能需要配置`iptables`规则或者让这些服务也在host网络模式下运行，或者使用`macvlan`网络。更简单的方法是，Tailscale容器在host模式下，然后NAS宿主机本身就作为网关，将 `192.168.51.x` 的流量路由到其内部的Docker网桥。

#### 2. 创建 `docker-compose.yml` 文件

在NAS上创建 `docker-compose.yml` 文件。

```yaml
services:
  tailscale:
    image: tailscale/tailscale:latest
    container_name: tailscale-nas
    hostname: zspace # 为你的NAS在Tailscale网络中设置一个主机名
    network_mode: host # 使用 host 网络模式，让容器直接使用宿主机的网络接口
    cap_add:
      - NET_ADMIN
      - SYS_MODULE
    environment:
      TS_HOSTNAME: zspace
      # ！！！ 关键配置：宣告 NAS 作为子网路由器，并提供 192.168.51.0/24 网段 ！！！
      TS_EXTRA_ARGS: --advertise-routes=192.168.51.0/24
    volumes:
      - ./tailscale/data:/var/lib/tailscale
    restart: unless-stopped
```

#### 3. 启动 Tailscale 容器并认证

```bash
docker compose up -d
```

容器启动后，查看日志会提示进行认证：

```bash
docker compose logs tailscale
```

复制 URL，在你的浏览器中打开并登录你的 Tailscale 账号，然后授权这台NAS。

#### 4. 在 Tailscale 管理界面中授权子网路由

认证后，登录 Tailscale 管理后台 [https://login.tailscale.com/admin/machines](https://login.tailscale.com/admin/machines)。

*   你会看到 `zsapce` 机器在线。
*   在 `zsapce` 机器的条目旁边，点击右侧的 `...` 菜单，选择 "Edit route settings..."。
*   在弹出的窗口中，你应该能看到 `192.168.51.0/24` 的路由。**勾选它**，然后点击 "Save"。

#### 5. 配置 NAS 的 IP 地址或服务 IP 地址

现在，`zsapce` 已经向 Tailscale 网络宣告它可以路由 `192.168.51.0/24` 网段。但是，NAS 本身以及其提供的服务实际上是在 `192.168.50.x` 网段上运行的。

为了让公司电脑可以通过 `192.168.51.x` 访问 NAS 服务，你需要**虚拟一个 `192.168.51.x` 的IP地址到 NAS 的网络接口**，或者更常见的做法是**修改 NAS 上服务的监听地址或通过 iptables 进行NAT转换**。

**在NAS宿主机上，添加一个虚拟IP地址：**

这将让NAS的网卡知道它也"拥有" `192.168.51.x` 网段中的某个IP。

```bash
# 例如，我们让NAS在 192.168.51.x 网段的IP是 192.168.51.180
# 请根据你的实际网卡名称替换 bond0
# 首先找到你的主要网络接口名称
ip a

# 假设是 bond0
sudo ip addr add 192.168.51.180/32 dev bond0 # 使用 /32 是因为它不需要作为网关，只是一个额外的地址
# 或者更常见的 /24，但注意不要和实际的局域网冲突
# sudo ip addr add 192.168.51.180/24 dev bond0

# 添加后验证
ip a show bond0
```
**注意：** 这样添加的IP地址在NAS重启后会消失。你需要将此命令添加到NAS的启动脚本中。
*   **对于Linux发行版**：编辑 `/etc/rc.local` (如果存在) 或创建一个systemd服务。
*   **对于群晖NAS**：可以通过任务计划在启动时执行此脚本，或者安装第三方工具（如`synocommunity`的`entware`）来管理启动脚本。

**然后，在公司电脑上，当你连接到Tailscale时，就可以通过 `192.168.51.180` 来访问NAS的服务了！**

---

### 第四步：在公司电脑上使用 Tailscale

1.  **下载并安装 Tailscale 客户端**：
    访问 [https://tailscale.com/download/](https://tailscale.com/download/)，选择你电脑操作系统对应的客户端并安装。
2.  **登录 Tailscale**：
    安装后，启动 Tailscale 客户端，使用你的 Tailscale 账号登录。
3.  **连接到 Tailscale 网络**：
    客户端连接成功后，你会看到它获取了一个 `100.x.x.x` 的IP地址。
4.  **访问 NAS 服务**：
    现在，你的公司电脑应该能够通过 Tailscale 提供的 `192.168.51.0/24` 子网路由访问你的 NAS 服务了。

    *   **你应该通过 `192.168.51.180` (或你在NAS上设置的 `192.168.51.x` 地址) 来访问 NAS 的各种服务**，而不是它在局域网的真实IP `192.168.50.180`。
    *   例如，如果你的NAS的Web界面在 `HTTP://192.168.50.180:5000`，那么在公司电脑上，你应该访问 `HTTP://192.168.51.180:5000`。

---

### 验证和故障排除

1.  **从公司电脑 Ping 验证：**
    在公司电脑上连接 Tailscale 后，尝试 Ping NAS 的 `192.168.51.180` 地址：
    `ping 192.168.51.180`
    如果成功，说明子网路由配置正确。
2.  **检查 Tailscale 管理界面：**
    确保所有机器（云服务器、NAS、公司电脑）都在线，并且NAS的子网路由 `192.168.51.0/24` 已被授权。
3.  **检查防火墙：**
    *   云服务器和NAS的宿主机防火墙（`ufw`, `firewalld`, `iptables`）需要允许Tailscale的流量通过。Tailscale通常使用 UDP 4164 端口。
    *   确保没有阻止 `192.168.51.x` 到 `192.168.50.x` 的转发。
4.  **检查 IP 转发：**
    确保云服务器和NAS都已启用 `net.ipv4.ip_forward=1`。
5.  **NAS 上服务的监听地址：**
    确保NAS上运行的服务（如Nginx, Plex, Samba等）监听的是所有接口（`0.0.0.0`）或明确包含了 `192.168.50.180`。如果你在NAS上虚拟了 `192.168.51.180` 地址，大部分服务应该能正常工作，因为它们会通过路由到达。
6.  **持久化虚拟IP：**
    再次提醒，`ip addr add` 命令添加的IP地址是临时的，重启后会消失。务必将其添加到启动脚本中。

现在，你就可以在公司电脑上通过 `192.168.51.x` 网段的IP地址安全地访问家里的NAS服务，而不会与公司网络的 `192.168.50.x` 网段产生冲突了。

### 确认是直连还是中转

要判断公司电脑访问家里NAS（通过 `192.168.51.x` 网段）的流量是直接P2P连接还是经过云服务器中转，需要在**公司电脑**上使用 `tailscale status` 命令来查看。

Tailscale 会尽可能尝试建立点对点（P2P）连接。如果P2P连接因为NAT或防火墙限制而无法建立，它才会自动回退到通过其官方的 DERP 中继服务器进行中转。如果云服务器被配置为“自定义DERP中继服务器”，那么流量可能会通过它中转。但在你的配置中，云服务器只是一个普通的Tailscale节点，所以它不会作为NAS和公司电脑之间的“指定中转站”，除非它是Tailscale系统自动选择的最近的**公共DERP中继服务器**之一（或在某些特殊网络环境下，Tailscale的智能路由可能会选择云服务器作为P2P失败后的第二优先级，但这不常见，通常会选择专用的DERP服务器）。

**主要检查方法：在公司电脑上使用 `tailscale status`**

1.  **确保公司电脑已连接到 Tailscale。**
2.  **打开命令行工具 (CMD/PowerShell/Terminal)。**
3.  **运行命令：**
    ```bash
    tailscale status
    ```
    这个命令会列出所有连接的 Tailscale 节点以及你与它们之间的连接状态。

4.  **查找家里NAS的条目：**
    你会看到类似这样的输出（其中 `100.x.x.x` 是NAS的 Tailscale IP 地址，`home-nas` 是你给NAS设置的主机名）：

    ```
    100.x.x.x      axyomcore            yleoer@      windows -
    100.x.x.x      tencent-cloud        yleoer@      linux   -
    100.x.x.x      zspace               yleoer@      linux   idle, tx 358900 rx 4260804
    ...
    ```

    或者，如果通过中转：

    ```
    100.x.x.x   zspace       yleoer@       windows   active; relay=sfo via 100.y.y.y
    ```
    （注意：`via 100.y.y.y` 不一定表示云服务器，而是指最近的Tailscale节点）

    或者更常见的relay显示：

    ```
    100.x.x.x   home-nas       yleoer@       windows   active; relay=sfo
    ```

**如何解读 `tailscale status` 的输出：**

*   **`active; direct <IP_ADDRESS>:<PORT>`**
    这意味着你的公司电脑与家里NAS之间建立了**直接的P2P连接**。流量不会经过任何Tailscale中继服务器，也不会消耗云服务器的流量（除非云服务器恰好是NAT打洞失败后的*一个*中间跳点，但即便如此，也只是打洞连接，不涉及持续流量中转）。P2P连接通常通过UDP协议在端口 4164 上进行。

*   **`active; relay=<DERP_REGION_CODE>`**
    这意味着你的公司电脑与家里NAS之间无法建立直接的P2P连接，流量正在通过 **Tailscale 的 DERP 中继服务器**进行中转。
    *   `DERP_REGION_CODE` 会显示中继服务器所在的地理位置，例如 `sfo` (旧金山), `tok` (东京), `sgp` (新加坡) 等。
    *   **重要：** 如果这里显示的 `relay` 代码是指向公共DERP服务器（例如`sfo`, `tok`等），那么流量消耗的是Tailscale官方预设的全球中继流量，**不会消耗你的云服务器流量**。
    *   如果 **你的云服务器被配置成了自定义的 DERP 节点** (这需要额外配置，你目前没有)，并且 Tailscale 选择了它，那么流量才会消耗你的云服务器。但在你的当前设置中，云服务器只是一个普通的 Tailscale 节点，不会主动作为 DERP 中继。
    *   **即使你看到 `via 100.y.y.y` (其中 `100.y.y.y` 是你的云服务器的 Tailscale IP)，这也不一定表示流量通过云服务器中转。** 它可能只是表示 Tailscale 客户端通过云服务器找到或协商了连接路径，但实际流量仍可能是 P2P 或通过官方 DERP。关键在于 `direct` 还是 `relay` 关键字。

**总结判断方法：**

在公司电脑上执行 `tailscale status`，然后检查 `zspace` 对应的行。

*   如果显示 **`active; direct ...`**：恭喜，流量是直接P2P连接到你家里NAS，不走云服务器，也不走Tailscale的DERP服务器，流量消耗极小，主要取决于你自己的网络带宽。
*   如果显示 **`active; relay=<DERP_REGION_CODE>`**：这意味着流量正在通过Tailscale官方的DERP中继服务器中转。它会消耗你Tailscale账号的免费DERP流量额度，但**不会消耗你云服务器的流量**。

**如何尝试优化以实现P2P (减少DERP中转)：**

如果你的连接经常显示为 `relay`，你可以尝试以下方法来提高P2P连接成功的几率：

1.  **检查路由器UPnP/NAT-PMP设置：** 在家里NAS所连接的路由器上，尝试开启UPnP或NAT-PMP功能，这有助于Tailscale打通NAT。
2.  **手动端口转发：** 如果UPnP无效，可以尝试在家里路由器上为NAS的Tailscale端口（通常是UDP 4164）做端口转发到NAS的内网IP。
3.  **检查防火墙：** 确保公司电脑和家里NAS的操作系统防火墙（Windows Defender Firewall, firewalld, ufw等）没有阻止Tailscale的出站或入站连接。
4.  **家庭网络类型：** 如果家庭网络使用了诸如“运营商大内网”（没有公网IP），或者多层NAT（例如路由器后面还有个光猫），P2P打洞成功的几率会降低。这种情况下，DERP中继几乎是不可避免的。

在你的配置中，云服务器作为Tailscale网络中的一个节点，主要作用是在P2P连接失败时，作为一个更“靠近”家和公司电脑的节点，作为尾随中继的备选（但它并不会直接成为DERP中继，除非你特别配置）。但即便它作为中继，也是Tailscale为了寻找最佳路径自动选择的，而非你直接指示的。对于流量敏感的用户，直接P2P是最佳选择。