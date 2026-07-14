---
title: 使用 Docker 部署 Traefik 和 Vaultwarden
excerpt: >-
  使用 Docker Compose 部署 Traefik 和 Vaultwarden，通过 Cloudflare DNS Challenge 申请泛域名证书，并记录 Docker/File Provider、路由、中间件和常见排错。
tags:
  - traefik
  - docker
  - vaultwarden
  - cloudflare
  - acme
  - https
categories: Linux
abbrlink: 53cc82ae
date: 2026-07-13 12:00:00
---

Docker 里服务一多，继续手改 Nginx 配置再重载会很烦。我这次用 Traefik 统一接 80、443，让它根据 Docker labels 找到 Vaultwarden，也顺便把 HTTPS 证书交给 ACME 处理。

本文用 Traefik `v3.7.7` 部署 Vaultwarden：Traefik 是唯一映射宿主机端口的容器，Vaultwarden 只加入 `traefik` 网络。域名、邮箱和 IP 都按自己的环境替换；v1、早期 v2 的配置不要直接照搬。

## 几个名词

| 概念 | 作用 | 示例 |
| --- | --- | --- |
| EntryPoint | Traefik 监听的入口端口 | `web` 监听 80，`websecure` 监听 443 |
| Router | 根据规则匹配请求，并决定使用什么中间件和服务 | ``Host(`vaultwarden.yxuefeng.com`)`` |
| Middleware | 在请求到达服务前或响应返回前处理它 | HTTPS 跳转、Basic Auth、限流 |
| Service | 后端服务及其负载均衡配置 | Vaultwarden 容器的 80 端口 |
| Provider | 向 Traefik 提供动态配置的来源 | Docker、File |

请求链路就是：`EntryPoint -> Router -> Middleware -> Service`。访问 `https://vaultwarden.yxuefeng.com` 时，Traefik 会匹配 `vaultwarden` Router，然后转到容器的 80 端口。

### 静态配置和动态配置

启动参数里的入口、Provider、日志和证书解析器属于静态配置。Router、Middleware、Service 属于动态配置；本文主流程写在 Docker labels 中，后面也给了 File Provider 版本。

## 部署前准备

以下示例使用 Cloudflare DNS Challenge 和泛域名证书：

- 将 `yxuefeng.com` 的 DNS 托管到 Cloudflare。
- 添加一条 `*.yxuefeng.com` 的 A 记录指向服务器公网 IP。后续新增 `api.yxuefeng.com`、`grafana.yxuefeng.com` 等服务都不再单独添加解析记录。
- 创建只拥有该 Zone 的 Zone Read、DNS Edit 权限的 Cloudflare API Token。
- 服务器放行 TCP 80、443，并安装 Docker Engine 和 Docker Compose 插件。

在 Traefik 目录创建 `.env`，供 Compose 读取邮箱和 API Token：

```dotenv
ACME_EMAIL=admin@yxuefeng.com
CF_DNS_API_TOKEN=replace-with-a-zone-dns-edit-token
```

```bash
chmod 600 .env
```

创建证书和动态配置目录。

```bash
mkdir -p letsencrypt dynamic
touch letsencrypt/acme.json
chmod 600 letsencrypt/acme.json
```

Dashboard 用 Basic Auth。

```bash
# Ubuntu / Debian
sudo apt update
sudo apt install -y apache2-utils

mkdir -p secrets
htpasswd -nbB admin 'replace-with-a-long-random-password' > secrets/dashboard_users
chmod 600 secrets/dashboard_users
```


## 用 Docker Compose 启动 Traefik

先启动 Traefik；它负责 80、443、证书和 Dashboard。Vaultwarden 单独放一个 Compose 项目，后面接入同一个网络。

```yaml
services:
  traefik:
    image: traefik:v3.7.7
    restart: unless-stopped
    dns:
      - 1.1.1.1
      - 8.8.8.8
    command:
      # Dashboard
      - --api.dashboard=true

      # 运行日志和访问日志。
      - --log.level=INFO
      - --accesslog=true

      # Docker Provider：监听容器 labels，并且只暴露显式启用的服务。
      - --providers.docker=true
      - --providers.docker.exposedbydefault=false
      - --providers.docker.network=traefik

      # TLS Options 不能用 Docker labels 定义，交给 File Provider 加载。
      - --providers.file.directory=/etc/traefik/dynamic
      - --providers.file.watch=true

      # HTTP/HTTPS 入口；所有 HTTP 请求跳转到 HTTPS。
      - --entrypoints.web.address=:80
      - --entrypoints.websecure.address=:443
      - --entrypoints.web.http.redirections.entrypoint.to=websecure
      - --entrypoints.web.http.redirections.entrypoint.scheme=https

      # Let's Encrypt：通过 Cloudflare DNS Challenge 申请泛域名证书。
      - "--certificatesresolvers.cloudflare.acme.email=${ACME_EMAIL}"
      - --certificatesresolvers.cloudflare.acme.storage=/letsencrypt/acme.json
      - --certificatesresolvers.cloudflare.acme.dnschallenge.provider=cloudflare
      - --certificatesresolvers.cloudflare.acme.dnschallenge.resolvers=1.1.1.1:53,8.8.8.8:53
    ports:
      - 80:80
      - 443:443
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./letsencrypt:/letsencrypt
      - ./dynamic:/etc/traefik/dynamic:ro
    # Dashboard Basic Auth
    secrets:
      - dashboard_users
    environment:
      CF_DNS_API_TOKEN: ${CF_DNS_API_TOKEN}
    networks:
      - traefik
    labels:
      # 将 Traefik 容器本身交给 Docker Provider，以注册 Dashboard 路由和共享响应头。
      - traefik.enable=true

      # Dashboard Router
      - 'traefik.http.routers.traefik.rule=Host(`traefik.yxuefeng.com`)'
      - traefik.http.routers.traefik.entrypoints=websecure
      - traefik.http.routers.traefik.tls.certresolver=cloudflare
      - traefik.http.routers.traefik.service=api@internal
      - traefik.http.routers.traefik.middlewares=dashboard-auth@docker,dashboard-allowlist@docker,security-headers@docker

      # Dashboard Basic Auth：密码哈希从 Docker Secret 文件读取。
      - traefik.http.middlewares.dashboard-auth.basicauth.usersfile=/run/secrets/dashboard_users

      # Dashboard IP AllowList：替换为自己的 VPN、办公室或堡垒机出口 IP。
      - traefik.http.middlewares.dashboard-allowlist.ipallowlist.sourcerange=203.0.113.10/32,2001:db8::/32

      # 可复用的安全响应头；Vaultwarden 等服务也可以引用此 Middleware。
      - traefik.http.middlewares.security-headers.headers.contenttypenosniff=true
      - traefik.http.middlewares.security-headers.headers.framedeny=true
      - traefik.http.middlewares.security-headers.headers.referrerpolicy=no-referrer
      - traefik.http.middlewares.security-headers.headers.stsseconds=31536000
      - traefik.http.middlewares.security-headers.headers.stsincludesubdomains=true
      - traefik.http.middlewares.security-headers.headers.stspreload=true

networks:
  traefik:
    name: traefik

secrets:
  dashboard_users:
    file: ./secrets/dashboard_users
```

部署前替换邮箱、Dashboard 域名和 `dashboard-allowlist` 中的出口 IP。示例 IP 只是占位符，原样使用会把自己挡在 Dashboard 外面。

启动并检查状态。

```bash
docker compose config
docker compose up -d
docker compose ps
docker compose logs -f traefik
```

首次访问域名时会申请证书并写入 `letsencrypt/acme.json`。DNS、80 端口或防火墙没准备好时，别反复申请正式证书。

### 先用 Staging CA 调通

第一次部署先加这行，验证 DNS、端口和路由，不会消耗正式证书的配额：

```yaml
command:
  - --certificatesresolvers.cloudflare.acme.caserver=https://acme-staging-v02.api.letsencrypt.org/directory
```

切到正式证书前，删除这行和 `letsencrypt/acme.json`，再重启 Traefik 重新签发。

### 为什么 Dashboard 不映射 8080 端口

`--api.dashboard=true` 只开启 Dashboard。本例通过 `api@internal`、HTTPS、IP 白名单和 Basic Auth 访问它。

不要加 `--api.insecure=true`。它会把 API 和 Dashboard 直接放到 8080，绕过上面的认证和 IP 限制；再映射 `8080:8080` 就等于把 Dashboard 公开了。

## 使用 Docker 部署 Vaultwarden

Vaultwarden 加入已有的 `traefik` 网络，再用 labels 声明域名和内部端口即可。下面的文件放在 `vaultwarden/compose.yml`：

```yaml
services:
  vaultwarden:
    image: vaultwarden/server:latest
    restart: unless-stopped
    environment:
      TZ: Asia/Shanghai
      DOMAIN: https://vaultwarden.yxuefeng.com
      SIGNUPS_ALLOWED: "false"
    volumes:
      - ./data:/data
    networks:
      - traefik
    labels:
      - traefik.enable=true
      - 'traefik.http.routers.vaultwarden.rule=Host(`vaultwarden.yxuefeng.com`)'
      - traefik.http.routers.vaultwarden.entrypoints=websecure
      - traefik.http.routers.vaultwarden.tls.certresolver=cloudflare
      # 首次签发 yxuefeng.com 和 *.yxuefeng.com，后续子域名复用这张证书。
      - traefik.http.routers.vaultwarden.tls.domains[0].main=yxuefeng.com
      - traefik.http.routers.vaultwarden.tls.domains[0].sans=*.yxuefeng.com
      - traefik.http.routers.vaultwarden.service=vaultwarden
      - traefik.http.routers.vaultwarden.middlewares=compress@docker,security-headers@docker
      - traefik.http.services.vaultwarden.loadbalancer.server.port=80
      - traefik.http.middlewares.compress.compress=true

networks:
  traefik:
    external: true
    name: traefik
```

`external: true` 让它复用 Traefik 创建的网络，不会再新建 `vaultwarden_traefik`。Vaultwarden 不映射端口，Traefik 通过这个网络访问它。

需要 `/admin` 管理页时，在 Vaultwarden 的 `environment` 里增加：

```yaml
environment:
  ADMIN_TOKEN: ${VAULTWARDEN_ADMIN_TOKEN}
```

把 `VAULTWARDEN_ADMIN_TOKEN` 放到服务器的 `.env`，用足够长的随机值；不需要管理页就别设置。

在 Vaultwarden 目录启动服务：

```bash
docker compose up -d
docker compose logs -f vaultwarden
```

Traefik 会读到这组 labels 并立即创建路由，不需要重启。首次申请的证书包含 `*.yxuefeng.com`，以后增加子域名服务只需要加容器 labels，不需要新建 DNS 记录或证书。Vaultwarden 使用容器内 80 端口，WebSocket 不用额外配置。记得备份 `./data`。

启动和签发完成后，浏览器应能打开 Vaultwarden 登录页：

```bash
curl -I https://vaultwarden.yxuefeng.com
```

## Traefik 的其他概念和配置

### HTTP Challenge（非泛域名备选）

没有 Cloudflare API Token，或者只用一个域名时，可以改回 HTTP Challenge。将主 Compose 的 `cloudflare` 参数替换为：

```yaml
command:
  - "--certificatesresolvers.letsencrypt.acme.email=${ACME_EMAIL}"
  - --certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json
  - --certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web
```

然后把 Router 的 `tls.certresolver` 改回 `letsencrypt`。全局 HTTP 跳 HTTPS 不会影响验证，Traefik 会优先处理 `/.well-known/acme-challenge/`。但每加一个子域名，仍要新增 A/AAAA 记录，并等 Traefik 为它签发证书。

### TLS 最低版本

TLS Options 不能写在 Docker labels 中，所以主 Compose 已额外挂载 `./dynamic` 并启用 File Provider。创建 `dynamic/tls.yml`：

```yaml
tls:
  options:
    default:
      minVersion: VersionTLS12
```

`default` 会自动应用到所有没有单独指定 TLS Options 的 HTTPS Router。TLS 1.3 仍然可用，只是拒绝 TLS 1.0 和 1.1。

### 从阿里云 DNS 迁移到 Cloudflare 后 ACME 失败

`yxuefeng.com` 从阿里云切到 Cloudflare 时，ACME 一度失败，原因是容器还在用旧的解析结果。给 Traefik 固定公共 DNS：

```yaml
services:
  traefik:
    dns:
      - 1.1.1.1
      - 8.8.8.8
```

它只能解决容器侧解析问题，Nameserver、A/AAAA/TXT 仍要等公网生效。申请前我会这样查：

```bash
dig @1.1.1.1 vaultwarden.yxuefeng.com A +short
dig @8.8.8.8 vaultwarden.yxuefeng.com A +short
dig @1.1.1.1 yxuefeng.com NS +short
```

DNS Challenge 再确认 `_acme-challenge.yxuefeng.com` 的 TXT 记录已经能被公共 DNS 查到。

### Docker 自动服务发现

`--providers.docker.exposedbydefault=false` 让容器必须声明 `traefik.enable=true` 才会被发现。端口不明确时，再显式指定：

```text
traefik.http.services.<service-name>.loadbalancer.server.port=<container-port>
```

这里填的是容器内部端口，不是宿主机映射端口：

```yaml
labels:
  - traefik.enable=true
  - 'traefik.http.routers.api.rule=Host(`api.yxuefeng.com`)'
  - traefik.http.routers.api.entrypoints=websecure
  - traefik.http.routers.api.tls.certresolver=cloudflare
  - traefik.http.routers.api.service=api
  - traefik.http.services.api.loadbalancer.server.port=8080
```

要转发的容器和 Traefik 必须在同一个网络；数据库不需要加入 `traefik` 网络。

### 改用 File Provider 时需要改什么

我的场景更适合 Docker Provider：服务启动就能自动注册。File Provider 的好处是不挂 Docker Socket，代价是新增服务时要手改 `dynamic/*.yml`，容器扩缩容也不会自动发现。

#### 1. 修改 Traefik 的静态配置

完全切到 File Provider 时，删掉 Docker Provider 参数、Socket 挂载和 Traefik 自身的 labels：

```yaml
# 删除
command:
  - --providers.docker=true
  - --providers.docker.exposedbydefault=false
  - --providers.docker.network=traefik
volumes:
  - /var/run/docker.sock:/var/run/docker.sock:ro
```

再加上动态目录；其他入口、ACME、Secret 和网络配置不变：

```yaml
services:
  traefik:
    command:
      - --providers.file.directory=/etc/traefik/dynamic
      - --providers.file.watch=true
    volumes:
      - ./letsencrypt:/letsencrypt
      - ./dynamic:/etc/traefik/dynamic:ro
```

#### 2. 将 Dashboard 和 Vaultwarden 路由写入动态文件

创建 `dynamic/routes.yml`，字段不再带 `traefik.http` 前缀或 `@docker` 后缀：

```yaml
http:
  routers:
    dashboard:
      rule: 'Host(`traefik.yxuefeng.com`)'
      entryPoints:
        - websecure
      middlewares:
        - dashboard-auth
        - dashboard-allowlist
        - security-headers
      service: api@internal
      tls:
        certResolver: cloudflare

    vaultwarden:
      rule: 'Host(`vaultwarden.yxuefeng.com`)'
      entryPoints:
        - websecure
      middlewares:
        - compress
        - security-headers
      service: vaultwarden
      tls:
        certResolver: cloudflare

  middlewares:
    dashboard-auth:
      basicAuth:
        usersFile: /run/secrets/dashboard_users
    dashboard-allowlist:
      ipAllowList:
        sourceRange:
          - 203.0.113.10/32
          - 2001:db8::/32
    security-headers:
      headers:
        contentTypeNosniff: true
        frameDeny: true
        referrerPolicy: no-referrer
        stsSeconds: 31536000
        stsIncludeSubdomains: true
        stsPreload: true
    compress:
      compress: {}

  services:
    vaultwarden:
      loadBalancer:
        servers:
          - url: http://vaultwarden:80
```

`api@internal` 是 Traefik 自带的 Dashboard。`vaultwarden` 通过共享网络里的服务名访问，所以 Vaultwarden 仍要保留 `networks.traefik`。

#### 3. 简化 Vaultwarden 的 Compose 文件

File Provider 不读 Docker labels，Vaultwarden 只保留容器、数据卷和外部网络：

```yaml
services:
  vaultwarden:
    image: vaultwarden/server:latest
    restart: unless-stopped
    environment:
      TZ: Asia/Shanghai
      DOMAIN: https://vaultwarden.yxuefeng.com
      SIGNUPS_ALLOWED: "false"
    volumes:
      - ./data:/data
    networks:
      - traefik

networks:
  traefik:
    external: true
    name: traefik
```

修改 `dynamic/routes.yml` 后会自动重载。服务经常扩缩容时，还是 Docker Provider 更省事。

### 路由规则：多域名、路径前缀与 WebSocket

同一个服务可以同时挂根路径和 `/api`。Docker Provider：

```yaml
labels:
  - traefik.enable=true
  - 'traefik.http.routers.app.rule=Host(`app.yxuefeng.com`)'
  - traefik.http.routers.app.entrypoints=websecure
  - traefik.http.routers.app.tls.certresolver=cloudflare
  - traefik.http.routers.app.service=app
  - 'traefik.http.routers.app-api.rule=Host(`app.yxuefeng.com`) && PathPrefix(`/api`)'
  - traefik.http.routers.app-api.entrypoints=websecure
  - traefik.http.routers.app-api.tls.certresolver=cloudflare
  - traefik.http.routers.app-api.service=app
  - traefik.http.routers.app-api.middlewares=api-strip@docker
  - traefik.http.middlewares.api-strip.stripprefix.prefixes=/api
  - traefik.http.services.app.loadbalancer.server.port=8080
```

File Provider 要自己写后端 URL：

```yaml
http:
  routers:
    app:
      rule: 'Host(`app.yxuefeng.com`)'
      entryPoints:
        - websecure
      service: app
      tls:
        certResolver: cloudflare
    app-api:
      rule: 'Host(`app.yxuefeng.com`) && PathPrefix(`/api`)'
      entryPoints:
        - websecure
      middlewares:
        - api-strip
      service: app
      tls:
        certResolver: cloudflare

  middlewares:
    api-strip:
      stripPrefix:
        prefixes:
          - /api

  services:
    app:
      loadBalancer:
        servers:
          - url: http://app:8080
```

`PathPrefix(`/api`)` 会匹配 `/api` 和 `/api/users`。后端不带 `/api` 前缀才加 `StripPrefix`。WebSocket 原生支持，出现 502 先查路由、内部端口和网络。

### 常用 Middleware

中间件按 `middlewares` 列表的顺序执行，常用的可以起名后复用。

#### Basic Auth

临时也能把密码哈希直接放进 label：

```yaml
labels:
  - 'traefik.http.middlewares.admin-auth.basicauth.users=admin:$$2y$$05$$...'
```

Compose 会把 bcrypt 里的 `$` 当变量，必须写成 `$$`。实际部署还是用前面的 Secret 文件。File Provider：

```yaml
http:
  middlewares:
    admin-auth:
      basicAuth:
        usersFile: /run/secrets/dashboard_users
```

#### IP AllowList

管理入口只放行固定出口 IP：

```yaml
labels:
  - traefik.http.middlewares.office-only.ipallowlist.sourcerange=198.51.100.24/32,2001:db8:1::/48
  - traefik.http.routers.admin.middlewares=office-only@docker,admin-auth@docker
```

File Provider：

```yaml
http:
  routers:
    admin:
      middlewares:
        - office-only
        - admin-auth

  middlewares:
    office-only:
      ipAllowList:
        sourceRange:
          - 198.51.100.24/32
          - 2001:db8:1::/48
```

前面还有 CDN 时，别直接信任所有 `X-Forwarded-For`，要配合可信上游 IP 和 `ipStrategy`。

#### 限流、压缩和安全响应头

给公网 API 的一组起步配置：`average` 是平均速率，`burst` 是瞬时额度。

```yaml
labels:
  - traefik.http.middlewares.api-rate.ratelimit.average=100
  - traefik.http.middlewares.api-rate.ratelimit.period=1s
  - traefik.http.middlewares.api-rate.ratelimit.burst=50
  # CDN 后只有一层可信代理时，按 X-Forwarded-For 取真实客户端 IP。
  - traefik.http.middlewares.api-rate.ratelimit.sourcecriterion.ipstrategy.depth=1
  - traefik.http.middlewares.api-compress.compress=true
  - traefik.http.middlewares.api-headers.headers.contenttypenosniff=true
  - traefik.http.middlewares.api-headers.headers.referrerpolicy=no-referrer
  - traefik.http.routers.api.middlewares=api-rate@docker,api-compress@docker,api-headers@docker
```

File Provider 只展示中间件引用，Router 的 `rule`、`service`、`tls` 沿用前面的配置：

```yaml
http:
  routers:
    api:
      middlewares:
        - api-rate
        - api-compress
        - api-headers

  middlewares:
    api-rate:
      rateLimit:
        average: 100
        period: 1s
        burst: 50
        sourceCriterion:
          ipStrategy:
            depth: 1
    api-compress:
      compress: {}
    api-headers:
      headers:
        contentTypeNosniff: true
        referrerPolicy: no-referrer
```

限流按 Traefik 实例生效，扩容后总额度也会增加。CDN 在前面时也要处理真实 IP；否则所有请求都会算到 CDN IP 上。`depth: 1` 只适合一层可信代理，还要把 `forwardedHeaders.trustedIPs` 限制为 CDN 的 IP 段。

### 负载均衡与健康检查

应用有 `/healthz` 时，可以让 Traefik 主动摘掉不健康的后端：

```yaml
labels:
  - traefik.http.services.api.loadbalancer.server.port=8080
  - traefik.http.services.api.loadbalancer.healthcheck.path=/healthz
  - traefik.http.services.api.loadbalancer.healthcheck.interval=10s
  - traefik.http.services.api.loadbalancer.healthcheck.timeout=3s
```

启动三个副本：

```bash
docker compose up -d --scale api=3
```

扩容服务不要设置 `container_name`，否则 Compose 无法创建多个实例。

### 日志、指标与日常排错

示例已开启 Access Log。定位问题时再临时把日志级别改为 DEBUG：

```bash
docker compose logs -f traefik
docker inspect <container-name>
curl -I https://vaultwarden.yxuefeng.com
curl -u admin:'your-password' -I https://traefik.yxuefeng.com/dashboard/
```

Dashboard 路径末尾要带 `/dashboard/`。Prometheus 指标可以放一个内部 EntryPoint：

```yaml
command:
  - --entrypoints.metrics.address=:8082
  - --metrics.prometheus=true
  - --metrics.prometheus.entrypoint=metrics
```

Prometheus 加入 `traefik` 网络后抓 `traefik:8082`，不用映射宿主机端口。

#### 404、502 与证书问题

| 现象 | 常见原因 | 检查方向 |
| --- | --- | --- |
| 404 Not Found | 没有 Router 匹配请求 | 检查 `Host`、`PathPrefix`、EntryPoint、`traefik.enable` 和域名解析 |
| 502 Bad Gateway | Router 已匹配但无法连接后端 | 检查容器内部端口、`loadbalancer.server.port`、共同网络和应用监听地址 |
| 证书签发失败 | DNS 未生效、80 端口不可达或 ACME 配置错误 | 查看 Traefik 日志，确认 A/AAAA、云安全组、本机防火墙和 Challenge 类型 |
| 浏览器循环跳转 | 后端又做了一次不兼容的 HTTPS 跳转，或上游代理未传递协议 | 将 HTTPS 重定向统一放在 Traefik，核对 `X-Forwarded-Proto` 信任范围 |
| Dashboard 403 | IP 不在 AllowList 中 | 核对出口公网 IP、IPv6 和 CDN/上游代理后的真实来源地址 |

可以用 `--resolve` 绕过本地 DNS 缓存，直接验证某台服务器上的域名路由：

```bash
curl -I --resolve vaultwarden.yxuefeng.com:443:SERVER_IP https://vaultwarden.yxuefeng.com/
```

## 生产环境检查清单

- 固定 Traefik 和 Vaultwarden 的镜像版本，升级前看 [迁移说明](https://doc.traefik.io/traefik/migration/v3/)。
- 保持 `exposedByDefault=false`，只给需要公网访问的容器加 `traefik.enable=true`。
- Dashboard 不映射 8080；限制 `acme.json`、密码文件和 DNS Token 的读取权限。
- Docker Socket 只读也很敏感，高安全场景改用 Socket Proxy。
- 备份 `acme.json` 和 Vaultwarden 的 `data` 目录。
