<div align="center">

<img src="public/icon-192x192.png" alt="Family Organizer" width="96" height="96" />

# Family Organizer

**오픈소스 셀프호스팅 가족 관리 플랫폼 — 가족 공유 캘린더, 집안일, 학습, 메시지, 가계를 실시간으로 동기화**

**프라이버시 중심의 셀프호스팅 Cozi 대안 앱**

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](./LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![React Native](https://img.shields.io/badge/React%20Native-Expo-0080ff?logo=expo)](https://expo.dev)
[![InstantDB](https://img.shields.io/badge/Database-InstantDB-6c47ff)](https://instantdb.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript)](https://www.typescriptlang.org)

[기능](#-기능) · [스크린샷](#-스크린샷) · [빠른 시작](#-빠른-시작) · [Docker](#-docker--셀프호스팅) · [기술 스택](#-기술-스택)

**언어:** [English](./README.md) | [中文](./README.zh.md) | [Español](./README.es.md) | [Français](./README.fr.md) | [Deutsch](./README.de.md) | [日本語](./README.ja.md) | 한국어 | [Português](./README.pt-BR.md)

</div>

---

<div align="center">

### 직접 호스팅하기 싫다면? Nestify Family Organizer도 확인해보세요

<a href="https://www.nestifyapp.org">
  <img src="https://nestifyapp.org/_next/image?url=%2Flogo.png&w=256&q=75" alt="Nestify" height="48" />
</a>

**[Nestify Family Organizer](https://www.nestifyapp.org)** — AI 기반 · 음성 입력 · 식단 계획 · 즉시 사용 가능

[![App Store](https://img.shields.io/badge/App_Store-다운로드-black?logo=apple&logoColor=white)](https://apps.apple.com/us/app/nestify-family-organizer/id6751864069)
[![Google Play](https://img.shields.io/badge/Google_Play-다운로드-black?logo=google-play&logoColor=white)](https://play.google.com/store/apps/details?id=com.nestify.familyorganizerapp)

</div>

---

## ✨ 이게 뭔가요?

Family Organizer는 공유 기기를 위해 설계된 **오픈소스 가족 관리 웹 + 모바일 앱**입니다. 각 가족 구성원은 PIN으로 로그인하며, 집안일 완료, 학습 진도, 메시지, 용돈 잔액이 모든 기기에서 **실시간으로 동기화**됩니다. 부모와 자녀 권한은 완전히 분리되어 있습니다.

> 실제 가족의 필요에서 구축되었습니다. 데이터를 완전히 소유하고 셀프호스팅에 익숙한 가정에 가장 적합합니다.

### Family Organizer vs. Nestify

| | <img src="public/icon-192x192.png" height="20"/> Family Organizer | <img src="https://nestifyapp.org/_next/image?url=%2Flogo.png&w=64&q=75" height="20"/> [Nestify Family Organizer](https://www.nestifyapp.org) |
|---|---|---|
| | *(스크린샷 곧 공개)* | <a href="https://www.nestifyapp.org"><img src="https://nestifyapp.org/_next/image?url=%2Fimgs%2Ffamily-modes%2Ffm-calendar.png%3Fv%3D2026060726&w=1200&q=75" width="280"/></a> |
| 배포 | 셀프호스팅, 서버 필요 | 설정 없이 즉시 사용 |
| AI 어시스턴트 | ❌ | ✅ Nestie AI |
| 모바일 앱 | 소스에서 빌드 (Expo) | App Store / Google Play |
| 식단 계획 | ❌ | ✅ |
| 데이터 소유권 | 완전히 본인 소유 | E2E 암호화, 클라우드 호스팅 |

---

## 🎯 기능

### 📋 집안일 관리
- **rrule 반복** — 시작/종료일과 일시정지 지원이 있는 일간·주간·월간 일정
- **멤버 로테이션** — 자동으로 주기에 따라 다른 멤버에게 집안일 할당
- **자유 선택 보상** — 고정 보상 설정; 완료한 사람이 받아감
- **완료 추적** — 각 집안일을 표시한 멤버를 기록

### 📚 태스크 시리즈 (홈스쿨링에 이상적)
- **롤링 큐** — 날짜가 아닌 완료 여부에 따라 태스크 진행
- **중첩 서브태스크 + 일 구분** — 다단계 구조와 다일 세션 스케줄링
- **응답 필드 + 채점** — 학생이 답변 제출; 부모가 주석 달고 채점
- **파일 첨부** — 이미지, PDF, 오디오, 동영상을 태스크에 첨부

### 📅 캘린더
- **이중 달력 시스템** — 그레고리력과 비크람 삼밧(네팔력) 나란히 표시
- **다중 뷰** — 일간, 다일간, 월간, 연간
- **Apple Calendar 동기화** — iCloud에서 단방향 CalDAV 가져오기
- **집안일 오버레이** — 캘린더에서 직접 집안일 할당 확인

### 💬 가족 메시지
- **스레드 기반** — 주제별로 정리된 대화
- **읽음 확인** — 확인이 필요한 메시지 표시
- **첨부파일** — 대화에서 직접 이미지와 파일 공유
- **부모 감독** — 부모가 모든 가족 스레드를 볼 수 있음

### 💰 가계 관리
- **봉투 예산** — 멤버당 여러 봉투, 다중 통화 지원
- **용돈 배분** — 완료된 집안일 가중치에 따라 자동 계산
- **고정 보상** — 자유 선택 완료 시 직접 입금
- **전체 거래 내역** — 입금, 출금, 이체, 정기 용돈

### 🗂️ 파일 저장
- **중앙 집중식 저장** — S3/MinIO; 이미지 자동으로 64/320/1200px 리사이즈
- **첨부 시스템** — 메시지와 태스크에서 라이브러리의 파일 참조 가능

### 📊 대시보드 & 히스토리
- **가족·개인 뷰** — 웹은 둘 다; 모바일은 일일 요약
- **감사 로그** — 집안일, 태스크, 가계 변경의 전체 히스토리

---

## 📸 스크린샷

> 🚧 스크린샷 곧 공개 — PR 환영합니다!

---

## 📱 플랫폼 지원

| 플랫폼 | 상태 | 비고 |
|--------|------|------|
| Web (Next.js) | ✅ 완전 | PWA로 설치 가능 |
| iOS / Android (Expo) | ✅ 핵심 기능 | 집안일, 캘린더, 메시지, 가계 |
| 오프라인 지원 | 🚧 부분적 | 기본 기능 사용 가능 |

---

## 🚀 빠른 시작

### 사전 요구사항

- Node.js 20+
- [InstantDB](https://instantdb.com) 계정 (무료)
- S3 호환 오브젝트 스토리지 (Docker Compose에 MinIO 포함)

### 1. 클론 & 설치

```bash
git clone https://github.com/your-username/family-organizer.git
cd family-organizer
npm install
```

### 2. 환경 변수 설정

```bash
cp .env.example .env
cp mobile/.env.example mobile/.env
```

| 변수 | 설명 |
|------|------|
| `NEXT_PUBLIC_INSTANT_APP_ID` | InstantDB 앱 ID (클라이언트) |
| `INSTANT_APP_ADMIN_TOKEN` | InstantDB 관리자 토큰 |
| `DEVICE_ACCESS_KEY` | 기기 활성화 공유 시크릿 |
| `NEXT_PUBLIC_S3_ENDPOINT` | MinIO/S3 공개 엔드포인트 |
| `S3_ENDPOINT` | MinIO/S3 내부 서버 엔드포인트 |
| `S3_BUCKET_NAME` | 스토리지 버킷 이름 |
| `S3_ACCESS_KEY_ID` | S3 액세스 키 ID |
| `S3_SECRET_ACCESS_KEY` | S3 시크릿 액세스 키 |

### 3. InstantDB 스키마 푸시

```bash
npx instant-cli push schema --yes
npx instant-cli push perms --yes
```

### 4. 개발 서버 시작

```bash
npm run dev
```

### 5. 기기 활성화

```
http://localhost:3000/?activate=<DEVICE_ACCESS_KEY>
```

---

## 🐳 Docker / 셀프호스팅

```bash
docker compose up -d --build
git pull && docker compose up -d --build
```

---

## 🛠 기술 스택

| 레이어 | 기술 |
|--------|------|
| 웹 프레임워크 | Next.js 16 + React 18 + TypeScript |
| 모바일 | Expo / React Native |
| 데이터베이스 & 실시간 | InstantDB |
| 파일 저장 | MinIO / S3 + Sharp |
| 리치 텍스트 | TipTap 3 |
| UI 컴포넌트 | Radix UI + Tailwind CSS |
| 테스트 | Vitest + Playwright |

---

## 🤝 기여

Issue와 PR을 환영합니다. 개인 프로젝트이기 때문에 반복 속도는 실제 가족 필요에 따르지만, 좋은 기여는 신중하게 검토합니다.

---

## 📄 라이선스

[Apache License 2.0](./LICENSE) 하에 라이선스되었습니다.

이 프로젝트는 [fivestones/family-organizer](https://github.com/fivestones/family-organizer)의 포크로, **David Thomas**가 MIT 라이선스 하에 원래 만들었습니다. 전체 MIT 라이선스 텍스트는 [LICENSE](./LICENSE)에 보존되어 있습니다.
