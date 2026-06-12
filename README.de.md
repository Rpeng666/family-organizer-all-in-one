<div align="center">

<img src="public/icon-192x192.png" alt="Family Organizer" width="96" height="96" />

# Family Organizer

**Open-Source, selbst gehostete Familienverwaltung — gemeinsamer Familienkalender, Aufgaben, Lehrplan, Nachrichten und Finanzen, in Echtzeit synchronisiert**

**Eine datenschutzorientierte, selbst gehostete Alternative zu Cozi**

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](./LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![React Native](https://img.shields.io/badge/React%20Native-Expo-0080ff?logo=expo)](https://expo.dev)
[![InstantDB](https://img.shields.io/badge/Database-InstantDB-6c47ff)](https://instantdb.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript)](https://www.typescriptlang.org)

[Funktionen](#-funktionen) · [Screenshots](#-screenshots) · [Schnellstart](#-schnellstart) · [Docker](#-docker--selbst-hosten) · [Stack](#-stack)

**Sprache:** [English](./README.md) | [中文](./README.zh.md) | [Español](./README.es.md) | [Français](./README.fr.md) | Deutsch | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [Português](./README.pt-BR.md)

</div>

---

<div align="center">

### Kein eigenes Hosting gewünscht? Probiere auch Nestify Family Organizer

<a href="https://www.nestifyapp.org">
  <img src="https://nestifyapp.org/_next/image?url=%2Flogo.png&w=256&q=75" alt="Nestify" height="48" />
</a>

**[Nestify Family Organizer](https://www.nestifyapp.org)** — KI-gestützt · Spracheingabe · Mahlzeitenplanung · Sofort einsatzbereit

[![App Store](https://img.shields.io/badge/App_Store-Herunterladen-black?logo=apple&logoColor=white)](https://apps.apple.com/us/app/nestify-family-organizer/id6751864069)
[![Google Play](https://img.shields.io/badge/Google_Play-Herunterladen-black?logo=google-play&logoColor=white)](https://play.google.com/store/apps/details?id=com.nestify.familyorganizerapp)

</div>

---

## ✨ Was ist das?

Family Organizer ist eine **Open-Source-Web- und Mobile-App zur Familienverwaltung**, die für gemeinsam genutzte Geräte entwickelt wurde. Jedes Familienmitglied meldet sich mit einer PIN an. Aufgabenerledigungen, Lernfortschritte, Nachrichten und Taschengeld-Salden werden **in Echtzeit** auf allen Geräten synchronisiert. Eltern- und Kindberechtigungen sind vollständig getrennt.

> Basierend auf realen Familienbedürfnissen entwickelt. Am besten geeignet für Haushalte, die vollständige Datenkontrolle wünschen und mit dem Selbst-Hosten vertraut sind.

### Family Organizer vs. Nestify

| | <img src="public/icon-192x192.png" height="20"/> Family Organizer | <img src="https://nestifyapp.org/_next/image?url=%2Flogo.png&w=64&q=75" height="20"/> [Nestify Family Organizer](https://www.nestifyapp.org) |
|---|---|---|
| | *(Screenshots folgen)* | <a href="https://www.nestifyapp.org"><img src="https://nestifyapp.org/_next/image?url=%2Fimgs%2Ffamily-modes%2Ffm-calendar.png%3Fv%3D2026060726&w=1200&q=75" width="280"/></a> |
| Bereitstellung | Selbst gehostet, Server erforderlich | Keine Einrichtung, sofort einsatzbereit |
| KI-Assistent | ❌ | ✅ Nestie KI |
| Mobile App | Aus Quellcode kompilieren (Expo) | App Store / Google Play |
| Mahlzeitenplanung | ❌ | ✅ |
| Dateneigentum | Vollständig deins | E2E-verschlüsselt, cloud-gehostet |

---

## 🎯 Funktionen

### 📋 Aufgabenverwaltung
- **rrule-Wiederholung** — tägliche, wöchentliche oder monatliche Zeitpläne mit Start-/Enddaten und Pause-Unterstützung
- **Mitgliederrotation** — weist Aufgaben automatisch verschiedenen Mitgliedern im Zyklus zu
- **Freie Aufgaben mit Belohnungen** — lege eine feste Belohnung fest; wer sie erledigt, erhält sie
- **Erledigungsverfolgung** — zeichnet auf, welches Mitglied jede Aufgabe markiert hat

### 📚 Aufgabenserien (ideal für Homeschooling)
- **Rollende Warteschlange** — Aufgaben schreiten basierend auf Fertigstellung voran, nicht nach Datum
- **Verschachtelte Unteraufgaben + Tagestrennungen** — mehrstufige Struktur und mehrtägige Sitzungsplanung
- **Antwortfelder + Benotung** — Schüler reichen Antworten ein; Eltern kommentieren und benoten
- **Dateianhänge** — hänge Bilder, PDFs, Audio oder Video an jede Aufgabe an

### 📅 Kalender
- **Doppelkalendersystem** — Gregorianisch und Bikram Samvat (Nepalesisch) nebeneinander
- **Mehrere Ansichten** — Tag, mehrere Tage, Monat und Jahr
- **Apple Calendar-Synchronisierung** — Einweg-CalDAV-Import aus iCloud
- **Aufgaben-Überlagerung** — Aufgabenzuweisungen direkt im Kalender sehen

### 💬 Familiennachrichten
- **Thread-basiert** — Gespräche nach Themen organisiert
- **Lesebestätigungen** — Nachrichten als bestätigungspflichtig markieren
- **Anhänge** — Bilder und Dateien direkt im Gespräch teilen
- **Elternaufsicht** — Eltern können alle Haushaltsgespräche einsehen

### 💰 Finanzen
- **Umschlagbudgetierung** — mehrere Umschläge pro Mitglied mit Multi-Währungs-Unterstützung
- **Taschengeldverteilung** — berechnet automatisch Auszahlungen nach Aufgabengewichtung
- **Feste Belohnungen** — freie Aufgabenerledigungen werden direkt gutgeschrieben
- **Vollständiger Transaktionsverlauf** — Einzahlungen, Abhebungen, Überweisungen und wiederkehrendes Taschengeld

### 🗂️ Dateispeicherung
- **Zentralisierter Speicher** — S3/MinIO; Bilder automatisch auf 64/320/1200px skaliert
- **Anhangssystem** — Nachrichten und Aufgaben können jede Datei referenzieren

### 📊 Dashboard & Verlauf
- **Familien- und persönliche Ansichten** — Web hat beide; Mobile zeigt tägliche Zusammenfassung
- **Audit-Protokoll** — vollständiger Verlauf von Aufgaben-, Lern- und Finanzänderungen

---

## 📸 Screenshots

> 🚧 Screenshots folgen — PRs willkommen!

---

## 📱 Plattformunterstützung

| Plattform | Status | Hinweise |
|-----------|--------|----------|
| Web (Next.js) | ✅ Vollständig | Als PWA installierbar |
| iOS / Android (Expo) | ✅ Kernfunktionen | Aufgaben, Kalender, Nachrichten, Finanzen |
| Offline-Unterstützung | 🚧 Teilweise | Grundfunktionalität verfügbar |

---

## 🚀 Schnellstart

### Voraussetzungen

- Node.js 20+
- [InstantDB](https://instantdb.com)-Konto (kostenlos)
- S3-kompatible Objektspeicherung (MinIO in Docker Compose enthalten)

### 1. Klonen und installieren

```bash
git clone https://github.com/Rpeng666/family-organizer.git
cd family-organizer
npm install
```

### 2. Umgebungsvariablen konfigurieren

```bash
cp .env.example .env
cp mobile/.env.example mobile/.env
```

| Variable | Beschreibung |
|----------|-------------|
| `NEXT_PUBLIC_INSTANT_APP_ID` | InstantDB App-ID (Client) |
| `INSTANT_APP_ADMIN_TOKEN` | InstantDB Admin-Token |
| `DEVICE_ACCESS_KEY` | Gemeinsames Geheimnis für Geräteaktivierung |
| `NEXT_PUBLIC_S3_ENDPOINT` | Öffentlicher MinIO/S3-Endpunkt |
| `S3_ENDPOINT` | Interner Server-Endpunkt MinIO/S3 |
| `S3_BUCKET_NAME` | Bucket-Name |
| `S3_ACCESS_KEY_ID` | S3-Zugriffsschlüssel-ID |
| `S3_SECRET_ACCESS_KEY` | Geheimer S3-Zugriffsschlüssel |

### 3. InstantDB-Schema veröffentlichen

```bash
npx instant-cli push schema --yes
npx instant-cli push perms --yes
```

### 4. Entwicklungsserver starten

```bash
npm run dev
```

### 5. Gerät aktivieren

```
http://localhost:3000/?activate=<DEVICE_ACCESS_KEY>
```

---

## 🐳 Docker / Selbst hosten

```bash
docker compose up -d --build
git pull && docker compose up -d --build
```

---

## 🛠 Stack

| Schicht | Technologie |
|---------|-------------|
| Web-Framework | Next.js 16 + React 18 + TypeScript |
| Mobile | Expo / React Native |
| Datenbank & Echtzeit | InstantDB |
| Dateispeicherung | MinIO / S3 + Sharp |
| Rich Text | TipTap 3 |
| UI-Komponenten | Radix UI + Tailwind CSS |
| Tests | Vitest + Playwright |

---

## 🤝 Beitragen

Issues und PRs sind willkommen. Dies ist ein persönliches Projekt — das Iterationstempo folgt den realen Familienbedürfnissen, aber gute Beiträge werden sorgfältig geprüft.

---

## 📄 Lizenz

Lizenziert unter der [Apache License 2.0](./LICENSE).

Dieses Projekt ist ein Fork von [fivestones/family-organizer](https://github.com/fivestones/family-organizer), ursprünglich erstellt von **David Thomas** und unter der MIT-Lizenz veröffentlicht. Der vollständige MIT-Lizenztext ist in [LICENSE](./LICENSE) erhalten.
