<div align="center">

<img src="public/icon-192x192.png" alt="Family Organizer" width="96" height="96" />

# Family Organizer

**オープンソースのセルフホスト型家族管理プラットフォーム — 家族共有カレンダー、家事、学習、メッセージ、家計をリアルタイムで同期**

**プライバシー重視のセルフホスト型 Cozi 代替アプリ**

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](./LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![React Native](https://img.shields.io/badge/React%20Native-Expo-0080ff?logo=expo)](https://expo.dev)
[![InstantDB](https://img.shields.io/badge/Database-InstantDB-6c47ff)](https://instantdb.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript)](https://www.typescriptlang.org)

[機能](#-機能) · [スクリーンショット](#-スクリーンショット) · [クイックスタート](#-クイックスタート) · [Docker](#-docker--セルフホスト) · [技術スタック](#-技術スタック)

**言語:** [English](./README.md) | [中文](./README.zh.md) | [Español](./README.es.md) | [Français](./README.fr.md) | [Deutsch](./README.de.md) | 日本語 | [한국어](./README.ko.md) | [Português](./README.pt-BR.md)

</div>

---

<div align="center">

### セルフホストしたくない方は Nestify Family Organizer もお試しください

<a href="https://www.nestifyapp.org">
  <img src="https://nestifyapp.org/_next/image?url=%2Flogo.png&w=256&q=75" alt="Nestify" height="48" />
</a>

**[Nestify Family Organizer](https://www.nestifyapp.org)** — AI搭載 · 音声入力 · 食事プランニング · すぐに使える

[![App Store](https://img.shields.io/badge/App_Store-ダウンロード-black?logo=apple&logoColor=white)](https://apps.apple.com/us/app/nestify-family-organizer/id6751864069)
[![Google Play](https://img.shields.io/badge/Google_Play-ダウンロード-black?logo=google-play&logoColor=white)](https://play.google.com/store/apps/details?id=com.nestify.familyorganizerapp)

</div>

---

## ✨ これは何？

Family Organizer は、共有デバイス向けに設計された**オープンソースの家族管理 Web + モバイルアプリ**です。各家族メンバーは PIN でログインし、家事の完了、学習の進捗、メッセージ、お小遣い残高がすべてのデバイスで**リアルタイムに同期**されます。親と子の権限は完全に分離されています。

> 実際の家族のニーズから構築。データの完全な管理を望み、セルフホストに慣れている家庭に最適です。

### Family Organizer vs. Nestify

| | <img src="public/icon-192x192.png" height="20"/> Family Organizer | <img src="https://nestifyapp.org/_next/image?url=%2Flogo.png&w=64&q=75" height="20"/> [Nestify Family Organizer](https://www.nestifyapp.org) |
|---|---|---|
| | *(スクリーンショット近日公開)* | <a href="https://www.nestifyapp.org"><img src="https://nestifyapp.org/_next/image?url=%2Fimgs%2Ffamily-modes%2Ffm-calendar.png%3Fv%3D2026060726&w=1200&q=75" width="280"/></a> |
| デプロイ | セルフホスト、サーバーが必要 | 設定不要、すぐに使える |
| AIアシスタント | ❌ | ✅ Nestie AI |
| モバイルアプリ | ソースからビルド（Expo） | App Store / Google Play |
| 食事プランニング | ❌ | ✅ |
| データの所有権 | 完全に自分のもの | E2E暗号化、クラウドホスト |

---

## 🎯 機能

### 📋 家事管理
- **rrule 繰り返し** — 開始/終了日と一時停止をサポートした日次・週次・月次スケジュール
- **メンバーローテーション** — サイクルに従って自動的に異なるメンバーに家事を割り当て
- **自由参加の報酬** — 固定報酬を設定し、完了した人が獲得
- **完了追跡** — どのメンバーが各家事をマークしたかを記録

### 📚 タスクシリーズ（ホームスクールに最適）
- **ローリングキュー** — タスクは日付ではなく完了状況に基づいて進む
- **ネスト化サブタスク + 日区切り** — 多層構造と複数日セッションのスケジュール
- **回答フィールド + 採点** — 生徒が回答を提出し、親が注釈をつけて採点
- **ファイル添付** — 任意のタスクに画像、PDF、音声、動画を添付

### 📅 カレンダー
- **デュアルカレンダーシステム** — グレゴリオ暦とビクラム・サンバット（ネパール暦）を並列表示
- **複数のビュー** — 日、複数日、月、年
- **Apple Calendar 同期** — iCloudからの一方向CalDAVインポート
- **家事オーバーレイ** — カレンダー上で直接家事の割り当てを確認

### 💬 ファミリーメッセージ
- **スレッドベース** — トピック別に整理された会話
- **既読確認** — 確認が必要なメッセージにマーク
- **添付ファイル** — 会話内で画像やファイルを共有
- **保護者監督** — 親が全家族スレッドを閲覧可能

### 💰 家計管理
- **封筒予算** — メンバーごとに複数の封筒、マルチ通貨サポート
- **お小遣い配布** — 完了した家事の重みに基づいて自動計算
- **固定報酬** — 自由参加の完了は直接入金
- **完全な取引履歴** — 入金、出金、振替、定期お小遣い

### 🗂️ ファイルストレージ
- **一元管理** — S3/MinIO；画像は自動的に64/320/1200pxにリサイズ
- **添付システム** — メッセージとタスクはライブラリ内の任意のファイルを参照可能

### 📊 ダッシュボード & 履歴
- **家族・個人ビュー** — Webは両方；モバイルは日次サマリー
- **監査ログ** — 家事、タスク、家計変更の完全な履歴

---

## 📸 スクリーンショット

> 🚧 スクリーンショット近日公開 — PRs歓迎！

---

## 📱 プラットフォームサポート

| プラットフォーム | ステータス | 備考 |
|----------------|-----------|------|
| Web（Next.js） | ✅ 完全 | PWAとしてインストール可能 |
| iOS / Android（Expo） | ✅ コア機能 | 家事、カレンダー、メッセージ、家計 |
| オフラインサポート | 🚧 部分的 | 基本機能は利用可能 |

---

## 🚀 クイックスタート

### 前提条件

- Node.js 20+
- [InstantDB](https://instantdb.com) アカウント（無料）
- S3互換オブジェクトストレージ（Docker ComposeにMinIOを内蔵）

### 1. クローンとインストール

```bash
git clone https://github.com/your-username/family-organizer.git
cd family-organizer
npm install
```

### 2. 環境変数の設定

```bash
cp .env.example .env
cp mobile/.env.example mobile/.env
```

| 変数 | 説明 |
|------|------|
| `NEXT_PUBLIC_INSTANT_APP_ID` | InstantDB アプリID（クライアント） |
| `INSTANT_APP_ADMIN_TOKEN` | InstantDB 管理者トークン |
| `DEVICE_ACCESS_KEY` | デバイス認証用共有シークレット |
| `NEXT_PUBLIC_S3_ENDPOINT` | MinIO/S3 パブリックエンドポイント |
| `S3_ENDPOINT` | MinIO/S3 内部サーバーエンドポイント |
| `S3_BUCKET_NAME` | ストレージバケット名 |
| `S3_ACCESS_KEY_ID` | S3 アクセスキーID |
| `S3_SECRET_ACCESS_KEY` | S3 シークレットアクセスキー |

### 3. InstantDB スキーマのプッシュ

```bash
npx instant-cli push schema --yes
npx instant-cli push perms --yes
```

### 4. 開発サーバーの起動

```bash
npm run dev
```

### 5. デバイスのアクティベーション

```
http://localhost:3000/?activate=<DEVICE_ACCESS_KEY>
```

---

## 🐳 Docker / セルフホスト

```bash
docker compose up -d --build
git pull && docker compose up -d --build
```

---

## 🛠 技術スタック

| レイヤー | 技術 |
|---------|------|
| Webフレームワーク | Next.js 16 + React 18 + TypeScript |
| モバイル | Expo / React Native |
| データベース & リアルタイム | InstantDB |
| ファイルストレージ | MinIO / S3 + Sharp |
| リッチテキスト | TipTap 3 |
| UIコンポーネント | Radix UI + Tailwind CSS |
| テスト | Vitest + Playwright |

---

## 🤝 コントリビューション

IssueとPRを歓迎します。個人プロジェクトのため、イテレーションのペースは実際の家族のニーズに従いますが、良いコントリビューションは丁寧にレビューします。

---

## 📄 ライセンス

[Apache License 2.0](./LICENSE) の下でライセンスされています。

このプロジェクトは [fivestones/family-organizer](https://github.com/fivestones/family-organizer) のフォークで、**David Thomas** によって MIT ライセンスの下で作成・公開されました。完全な MIT ライセンステキストは [LICENSE](./LICENSE) に保存されています。
