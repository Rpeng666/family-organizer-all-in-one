<div align="center">

<img src="public/icon-192x192.png" alt="Family Organizer" width="96" height="96" />

# Family Organizer

**开源自托管家庭管理平台 — 家庭共享日历、家务、课程、消息、财务，全家实时同步**

**注重隐私、可完全自托管的 Cozi 开源替代方案**

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](./LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![React Native](https://img.shields.io/badge/React%20Native-Expo-0080ff?logo=expo)](https://expo.dev)
[![InstantDB](https://img.shields.io/badge/Database-InstantDB-6c47ff)](https://instantdb.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript)](https://www.typescriptlang.org)

[功能介绍](#-核心功能) · [截图预览](#-截图预览) · [快速开始](#-快速开始) · [Docker 部署](#-docker--自托管) · [技术栈](#-技术栈)

**语言：** [English](./README.md) | 中文 | [Español](./README.es.md) | [Français](./README.fr.md) | [Deutsch](./README.de.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [Português](./README.pt-BR.md)

</div>

---

<div align="center">

### 不想自己部署？也可以试试 Nestify Family Organizer

<a href="https://www.nestifyapp.org">
  <img src="https://nestifyapp.org/_next/image?url=%2Flogo.png&w=256&q=75" alt="Nestify" height="48" />
</a>

**[Nestify Family Organizer](https://www.nestifyapp.org)** — AI 驱动 · 语音输入 · 餐饮规划 · 开箱即用

[![App Store](https://img.shields.io/badge/App_Store-下载-black?logo=apple&logoColor=white)](https://apps.apple.com/us/app/nestify-family-organizer/id6751864069)
[![Google Play](https://img.shields.io/badge/Google_Play-下载-black?logo=google-play&logoColor=white)](https://play.google.com/store/apps/details?id=com.nestify.familyorganizerapp)

</div>

---

## ✨ 这是什么

Family Organizer 是一个为多人共用设备设计的**开源家庭管理 Web + 移动端应用**。每位家庭成员用 PIN 码登录，家务打卡、课程进度、消息、零花钱记录在所有设备上**实时同步**。父母权限与孩子权限完全分离，谁做了什么一目了然。

> 项目基于真实家庭需求构建，适合有能力自托管、希望完全掌控数据的家庭。

### Family Organizer 与 Nestify 对比

| | <img src="public/icon-192x192.png" height="20"/> Family Organizer | <img src="https://nestifyapp.org/_next/image?url=%2Flogo.png&w=64&q=75" height="20"/> [Nestify Family Organizer](https://www.nestifyapp.org) |
|---|---|---|
| | *(截图即将上线)* | <a href="https://www.nestifyapp.org"><img src="https://nestifyapp.org/_next/image?url=%2Fimgs%2Ffamily-modes%2Ffm-calendar.png%3Fv%3D2026060726&w=1200&q=75" width="280"/></a> |
| 部署 | 需要服务器 + Docker | 无需部署，开箱即用 |
| AI 功能 | ❌ | ✅ Nestie 智能助手 |
| 移动端 | Expo 自编译 | App Store / Google Play |
| 餐饮规划 | ❌ | ✅ |
| 数据归属 | 完全自有 | E2E 加密，托管在云端 |

---

## 🎯 核心功能

### 📋 家务管理
- **rrule 循环规则** — 按天/周/月重复，支持开始/结束日期与随时暂停
- **成员轮换** — 自动按周期将家务分配给不同成员
- **抢单奖励** — 设置固定奖励金额，谁完成谁得
- **完成记录** — 记录是谁在哪个登录状态下打的卡，共用设备也清晰可查

### 📚 任务系列（适合在家学习）
- **滚动队列** — 任务按完成情况推进，不绑死日期
- **嵌套子任务 + 日分隔** — 支持多层级结构与跨日课程编排
- **响应字段 + 评分** — 学生填写答案，家长批注反馈与评分
- **附件支持** — 每个任务可挂载图片、PDF、音频、视频

### 📅 日历
- **双历法** — 同时显示公历与尼泊尔历（Bikram Samvat）
- **多视图** — 日/多日/月/年，年视图仍可显示具体事件
- **Apple Calendar 同步** — 通过 CalDAV 单向导入 iCloud 日历，服务端轮询，无需保持网页打开
- **家务叠加** — 日历上直接看到当天家务情况

### 💬 家庭消息
- **分话题讨论** — 按话题组织，而非一条长流
- **消息回执** — 重要消息可设为「需确认已读」
- **附件** — 图片与文件直接在对话中分享
- **父母监督工具** — 父母可查看全家对话

### 💰 财务管理
- **信封记账** — 每人可建多个信封（可设储蓄目标），支持多币种/自定义单位
- **零花钱分发** — 根据家务完成权重自动计算，一键发放
- **固定奖励** — 抢单类家务完成后直接入账
- **流水记录** — 存入、取出、转账、循环零花钱，历史全留档

### 🗂️ 文件管理
- **集中存储** — S3/MinIO 对象存储，图片自动生成三档缩略图（64/320/1200px）
- **附件系统** — 消息与任务均可直接引用文件库中的文件

### 📊 仪表盘 & 历史
- **家庭总览 + 个人视图** — Web 端双视图，Mobile 端每日摘要
- **操作历史** — 全应用审计日志，家务、任务、财务变更全可追溯

---

## 📸 截图预览

> 🚧 本项目截图即将上线 — 欢迎提交 PR 贡献截图！

<!-- 截图使用说明：
     将应用截图放入 docs/screenshots/ 目录，然后取消下方注释替换路径。

<p align="center">
  <img src="docs/screenshots/dashboard.png" width="48%" alt="仪表盘" />
  <img src="docs/screenshots/chores.png" width="48%" alt="家务管理" />
</p>
<p align="center">
  <img src="docs/screenshots/calendar.png" width="48%" alt="日历视图" />
  <img src="docs/screenshots/finance.png" width="48%" alt="财务管理" />
</p>
-->

---

## 📱 平台支持

| 平台 | 状态 | 说明 |
|------|------|------|
| Web（Next.js） | ✅ 完整 | 可安装为 PWA |
| iOS / Android（Expo） | ✅ 主要功能 | 家务、日历、消息、财务、更多 |
| 离线支持 | 🚧 部分 | 基础可用，完整离线仍在完善中 |

---

## 🚀 快速开始

### 前置要求

- Node.js 20+
- [InstantDB](https://instantdb.com) 账号（免费）
- S3 兼容对象存储（本地可用 MinIO，Docker Compose 已内置）

### 1. 克隆 & 安装依赖

```bash
git clone https://github.com/Rpeng666/family-organizer.git
cd family-organizer
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
cp mobile/.env.example mobile/.env
```

编辑 `.env`，填入以下必填项：

| 变量 | 说明 |
|------|------|
| `NEXT_PUBLIC_INSTANT_APP_ID` | InstantDB 应用 ID（客户端） |
| `INSTANT_APP_ADMIN_TOKEN` | InstantDB 管理员 Token |
| `DEVICE_ACCESS_KEY` | 设备激活共享密钥（自定义任意字符串） |
| `NEXT_PUBLIC_S3_ENDPOINT` | MinIO/S3 公开访问地址 |
| `S3_ENDPOINT` | MinIO/S3 服务端内部地址 |
| `S3_BUCKET_NAME` | 存储桶名称 |
| `S3_ACCESS_KEY_ID` | S3 访问密钥 ID |
| `S3_SECRET_ACCESS_KEY` | S3 访问密钥 Secret |

> `INSTANT_APP_ID`（服务端）通常与 `NEXT_PUBLIC_INSTANT_APP_ID` 相同。Apple Calendar 同步所需变量详见 [`.env.example`](./.env.example)。

### 3. 推送 InstantDB Schema

```bash
npx instant-cli push schema --yes
npx instant-cli push perms --yes
```

### 4. 启动开发服务器

```bash
# Web
npm run dev

# Mobile（另开终端）
npm run mobile:start
# 或在 iOS 模拟器中运行
npm run mobile:ios
```

### 5. 激活设备

服务启动后，浏览器访问：

```
http://localhost:3000/?activate=<DEVICE_ACCESS_KEY>
```

激活后将自动跳转到主页，后续所有路由均可正常访问。

---

## 🐳 Docker / 自托管

`docker-compose.yml` 包含：
- Next.js 应用
- MinIO 对象存储
- 存储桶初始化
- Apple Calendar 同步 Worker

```bash
# 首次启动
docker compose up -d --build

# 日常更新
git pull && docker compose up -d --build
```

<details>
<summary>HTTPS 反向代理配置（linuxserver.io SWAG）</summary>

在 `swag/config/nginx/proxy-conf/` 下添加以下两个文件：

**`family-organizer.subdomain.conf`**
```nginx
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name fam.*;

    include /config/nginx/ssl.conf;
    client_max_body_size 0;

    location / {
        include /config/nginx/proxy.conf;
        include /config/nginx/resolver.conf;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        set $upstream_app family-organizer;
        set $upstream_port 3000;
        set $upstream_proto http;
        proxy_pass $upstream_proto://$upstream_app:$upstream_port;
    }
}
```

**`s3.subdomain.conf`**
```nginx
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name s3.*;

    include /config/nginx/ssl.conf;
    client_max_body_size 10G;
    proxy_buffering off;
    proxy_request_buffering off;

    location / {
        include /config/nginx/proxy.conf;
        include /config/nginx/resolver.conf;

        set $upstream_app minio;
        set $upstream_port 9000;
        set $upstream_proto http;
        proxy_pass $upstream_proto://$upstream_app:$upstream_port;
    }
}
```

</details>

---

## 📅 Apple Calendar 同步

支持通过 CalDAV 将 Apple Calendar 单向导入到 Family Organizer，服务端轮询，无需保持客户端在线。

<details>
<summary>展开配置步骤</summary>

### 所需环境变量

```bash
CALDAV_CREDENTIAL_ENCRYPTION_KEY=替换为32字节随机字符串
CALDAV_CREDENTIAL_ENCRYPTION_KEY_VERSION=v1
CALENDAR_SYNC_CRON_SECRET=替换为长随机字符串
```

可选调参（默认值通常够用）：

```bash
APPLE_CALDAV_SYNC_WINDOW_PAST_DAYS=90
APPLE_CALDAV_SYNC_WINDOW_FUTURE_DAYS=365
APPLE_CALDAV_POLL_BASE_SECONDS=15
```

### 配置步骤

1. 在 Apple 账号管理页面为 Family Organizer 创建**专用应用密码**（需开启双重认证）
2. 以家长身份登录，进入「设置 → Apple Calendar 同步」
3. 填入 Apple ID 邮箱和应用密码，点击「连接」
4. 选择要导入的日历，保存
5. 点击「立即同步」触发首次导入

### 同步触发端点

```bash
POST /api/calendar-sync/apple/run
Authorization: Bearer <CALENDAR_SYNC_CRON_SECRET>
```

建议每 15–30 秒触发一次。服务端内置自适应退避，Docker 部署已内置 Worker 服务，无需额外配置。

</details>

---

## 🛠 技术栈

| 层次 | 技术 |
|------|------|
| Web 框架 | Next.js 16 + React 18 + TypeScript |
| 移动端 | Expo / React Native |
| 数据库 & 实时同步 | InstantDB（客户端 SDK + Admin SDK） |
| 文件存储 | MinIO / S3 兼容存储 + Sharp 图片处理 |
| 富文本编辑 | TipTap 3 |
| UI 组件 | Radix UI + Tailwind CSS |
| 拖拽 | Atlaskit Pragmatic DnD |
| 日历 | rrule + nepali-date-converter |
| 测试 | Vitest + Playwright |
| 包管理 | npm workspaces（monorepo） |

---

## 🧪 测试

```bash
npm test                # 单元 & 集成测试（Vitest）
npm run test:e2e        # E2E 测试（Playwright，自动启动开发服务器）
npm run test:all        # 全量测试
npm run test:coverage   # 测试覆盖率报告
```

---

## 📐 项目结构

```
.
├── app/                    # Next.js App Router 页面
├── components/             # React 组件
│   ├── countdown/          # 家务倒计时引擎 UI
│   ├── dashboard/          # 仪表盘组件
│   ├── messages/           # 消息系统
│   └── ui/                 # 基础 UI 组件
├── lib/                    # 核心业务逻辑
│   ├── chore-utils.ts      # 家务调度 & 零花钱计算
│   ├── task-scheduler.ts   # 任务系列滚动队列
│   └── device-auth.ts      # 设备认证
├── packages/
│   ├── shared-core/        # Web & Mobile 共享逻辑（含倒计时引擎）
│   └── mobile-contracts/   # API 契约类型
├── mobile/                 # Expo 移动端应用
├── instant.schema.ts       # InstantDB Schema（单一数据来源）
└── instant.perms.ts        # InstantDB 权限规则
```

---

## 🤝 贡献

欢迎提交 Issue 和 PR。这是个人项目，迭代节奏以实际家庭需求为主，但好的贡献都会认真看。

---

## 📄 开源许可

本项目基于 [Apache License 2.0](./LICENSE) 发布。

本项目 Fork 自 [fivestones/family-organizer](https://github.com/fivestones/family-organizer)，原项目由 **David Thomas** 创建并以 MIT 许可证开源，完整 MIT 授权文本已包含在 [LICENSE](./LICENSE) 文件中，特此致谢。
