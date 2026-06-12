<div align="center">

<img src="public/icon-192x192.png" alt="Family Organizer" width="96" height="96" />

# Family Organizer

**Gestion familiale open-source et auto-hébergée — calendrier familial partagé, tâches, cours, messages et finances, synchronisés en temps réel**

**Une alternative à Cozi, auto-hébergée et axée sur la confidentialité**

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](./LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![React Native](https://img.shields.io/badge/React%20Native-Expo-0080ff?logo=expo)](https://expo.dev)
[![InstantDB](https://img.shields.io/badge/Database-InstantDB-6c47ff)](https://instantdb.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript)](https://www.typescriptlang.org)

[Fonctionnalités](#-fonctionnalités) · [Captures d'écran](#-captures-décran) · [Démarrage rapide](#-démarrage-rapide) · [Docker](#-docker--auto-hébergement) · [Stack](#-stack)

**Langue :** [English](./README.md) | [中文](./README.zh.md) | [Español](./README.es.md) | Français | [Deutsch](./README.de.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [Português](./README.pt-BR.md)

</div>

---

<div align="center">

### Vous ne voulez pas auto-héberger ? Essayez aussi Nestify Family Organizer

<a href="https://www.nestifyapp.org">
  <img src="https://nestifyapp.org/_next/image?url=%2Flogo.png&w=256&q=75" alt="Nestify" height="48" />
</a>

**[Nestify Family Organizer](https://www.nestifyapp.org)** — Propulsé par IA · Saisie vocale · Planification des repas · Prêt à l'emploi

[![App Store](https://img.shields.io/badge/App_Store-Télécharger-black?logo=apple&logoColor=white)](https://apps.apple.com/us/app/nestify-family-organizer/id6751864069)
[![Google Play](https://img.shields.io/badge/Google_Play-Télécharger-black?logo=google-play&logoColor=white)](https://play.google.com/store/apps/details?id=com.nestify.familyorganizerapp)

</div>

---

## ✨ Qu'est-ce que c'est ?

Family Organizer est une **application web + mobile open-source de gestion familiale** conçue pour les appareils partagés. Chaque membre de la famille se connecte avec un code PIN. Les tâches, la progression des cours, les messages et les soldes d'argent de poche sont **synchronisés en temps réel** sur tous les appareils. Les permissions des parents et des enfants sont entièrement séparées.

> Construit à partir de besoins familiaux réels. Idéal pour les foyers qui souhaitent une propriété totale des données et sont à l'aise avec l'auto-hébergement.

### Family Organizer vs. Nestify

| | <img src="public/icon-192x192.png" height="20"/> Family Organizer | <img src="https://nestifyapp.org/_next/image?url=%2Flogo.png&w=64&q=75" height="20"/> [Nestify Family Organizer](https://www.nestifyapp.org) |
|---|---|---|
| | *(captures d'écran à venir)* | <a href="https://www.nestifyapp.org"><img src="https://nestifyapp.org/_next/image?url=%2Fimgs%2Ffamily-modes%2Ffm-calendar.png%3Fv%3D2026060726&w=1200&q=75" width="280"/></a> |
| Déploiement | Auto-hébergé, nécessite un serveur | Sans configuration, prêt à l'emploi |
| Assistant IA | ❌ | ✅ Nestie IA |
| Application mobile | Compiler depuis les sources (Expo) | App Store / Google Play |
| Planification des repas | ❌ | ✅ |
| Propriété des données | Entièrement à vous | Chiffré E2E, hébergé dans le cloud |

---

## 🎯 Fonctionnalités

### 📋 Gestion des tâches ménagères
- **Récurrence rrule** — planifications quotidiennes, hebdomadaires ou mensuelles avec dates de début/fin et support de pause
- **Rotation des membres** — attribue automatiquement les tâches à différents membres selon un cycle
- **Récompenses au choix** — définissez une récompense fixe ; celui qui accomplit la tâche la gagne
- **Suivi des réalisations** — enregistre quel membre a marqué chaque tâche

### 📚 Séries de tâches (idéal pour l'école à la maison)
- **File d'attente glissante** — les tâches avancent selon l'achèvement, pas par date
- **Sous-tâches imbriquées + séparateurs de jours** — structure multi-niveaux et planification de sessions multi-jours
- **Champs de réponse + notation** — les élèves soumettent des réponses ; les parents annotent et notent
- **Pièces jointes** — joignez des images, PDF, audio ou vidéo à n'importe quelle tâche

### 📅 Calendrier
- **Double système de calendrier** — grégorien et Bikram Samvat (népalais) côte à côte
- **Vues multiples** — jour, plusieurs jours, mois et année
- **Synchronisation Apple Calendar** — importation unidirectionnelle CalDAV depuis iCloud
- **Superposition des tâches** — voir les assignations directement sur le calendrier

### 💬 Messages familiaux
- **Par fil de discussion** — conversations organisées par sujet
- **Accusés de réception** — marquer les messages comme nécessitant une confirmation
- **Pièces jointes** — partager images et fichiers dans la conversation
- **Supervision parentale** — les parents peuvent voir tous les fils de discussion

### 💰 Finances
- **Budget par enveloppes** — plusieurs enveloppes par membre avec support multi-devises
- **Distribution de l'argent de poche** — calcule automatiquement les paiements selon le poids des tâches accomplies
- **Récompenses fixes** — les réalisations au choix sont déposées directement
- **Historique complet** — dépôts, retraits, transferts et argent de poche récurrent

### 🗂️ Stockage de fichiers
- **Stockage centralisé** — S3/MinIO ; images redimensionnées automatiquement à 64/320/1200px
- **Système de pièces jointes** — messages et tâches peuvent référencer n'importe quel fichier

### 📊 Tableau de bord et historique
- **Vues familiale et personnelle** — sur le web, les deux ; sur mobile, résumé quotidien
- **Journal d'audit** — historique complet des modifications des tâches, cours et finances

---

## 📸 Captures d'écran

> 🚧 Captures d'écran à venir — Les PRs sont les bienvenus !

---

## 📱 Plateformes

| Plateforme | Statut | Notes |
|------------|--------|-------|
| Web (Next.js) | ✅ Complet | Installable comme PWA |
| iOS / Android (Expo) | ✅ Fonctions principales | Tâches, calendrier, messages, finances |
| Support hors ligne | 🚧 Partiel | Fonctionnalité de base disponible |

---

## 🚀 Démarrage rapide

### Prérequis

- Node.js 20+
- Compte [InstantDB](https://instantdb.com) (gratuit)
- Stockage compatible S3 (MinIO inclus dans Docker Compose)

### 1. Cloner et installer

```bash
git clone https://github.com/Rpeng666/family-organizer.git
cd family-organizer
npm install
```

### 2. Configurer les variables d'environnement

```bash
cp .env.example .env
cp mobile/.env.example mobile/.env
```

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_INSTANT_APP_ID` | ID de l'application InstantDB (client) |
| `INSTANT_APP_ADMIN_TOKEN` | Token administrateur InstantDB |
| `DEVICE_ACCESS_KEY` | Secret partagé pour l'activation de l'appareil |
| `NEXT_PUBLIC_S3_ENDPOINT` | Endpoint public MinIO/S3 |
| `S3_ENDPOINT` | Endpoint interne du serveur MinIO/S3 |
| `S3_BUCKET_NAME` | Nom du bucket |
| `S3_ACCESS_KEY_ID` | ID de clé d'accès S3 |
| `S3_SECRET_ACCESS_KEY` | Clé secrète d'accès S3 |

### 3. Publier le schéma InstantDB

```bash
npx instant-cli push schema --yes
npx instant-cli push perms --yes
```

### 4. Démarrer le serveur de développement

```bash
npm run dev
```

### 5. Activer l'appareil

```
http://localhost:3000/?activate=<DEVICE_ACCESS_KEY>
```

---

## 🐳 Docker / Auto-hébergement

```bash
docker compose up -d --build
git pull && docker compose up -d --build
```

---

## 🛠 Stack

| Couche | Technologie |
|--------|-------------|
| Framework web | Next.js 16 + React 18 + TypeScript |
| Mobile | Expo / React Native |
| Base de données et temps réel | InstantDB |
| Stockage de fichiers | MinIO / S3 + Sharp |
| Texte enrichi | TipTap 3 |
| Composants UI | Radix UI + Tailwind CSS |
| Tests | Vitest + Playwright |

---

## 🤝 Contribuer

Les issues et PRs sont les bienvenus. C'est un projet personnel — le rythme d'itération suit les besoins familiaux réels, mais les bonnes contributions sont examinées attentivement.

---

## 📄 Licence

Sous la [Licence Apache 2.0](./LICENSE).

Ce projet est un fork de [fivestones/family-organizer](https://github.com/fivestones/family-organizer), créé à l'origine par **David Thomas** sous la licence MIT. Le texte complet de la licence MIT est conservé dans [LICENSE](./LICENSE).
