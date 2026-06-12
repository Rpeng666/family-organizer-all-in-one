<div align="center">

<img src="public/icon-192x192.png" alt="Family Organizer" width="96" height="96" />

# Family Organizer

**Gerenciamento familiar de código aberto e auto-hospedado — calendário familiar compartilhado, tarefas, currículo, mensagens e finanças, sincronizados em tempo real**

**Uma alternativa ao Cozi, auto-hospedada e focada em privacidade**

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](./LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![React Native](https://img.shields.io/badge/React%20Native-Expo-0080ff?logo=expo)](https://expo.dev)
[![InstantDB](https://img.shields.io/badge/Database-InstantDB-6c47ff)](https://instantdb.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript)](https://www.typescriptlang.org)

[Funcionalidades](#-funcionalidades) · [Capturas de tela](#-capturas-de-tela) · [Início rápido](#-início-rápido) · [Docker](#-docker--auto-hospedagem) · [Stack](#-stack)

**Idioma:** [English](./README.md) | [中文](./README.zh.md) | [Español](./README.es.md) | [Français](./README.fr.md) | [Deutsch](./README.de.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | Português

</div>

---

<div align="center">

### Não quer fazer auto-hospedagem? Experimente também o Nestify Family Organizer

<a href="https://www.nestifyapp.org">
  <img src="https://nestifyapp.org/_next/image?url=%2Flogo.png&w=256&q=75" alt="Nestify" height="48" />
</a>

**[Nestify Family Organizer](https://www.nestifyapp.org)** — Com IA · Entrada de voz · Planejamento de refeições · Pronto para usar

[![App Store](https://img.shields.io/badge/App_Store-Baixar-black?logo=apple&logoColor=white)](https://apps.apple.com/us/app/nestify-family-organizer/id6751864069)
[![Google Play](https://img.shields.io/badge/Google_Play-Baixar-black?logo=google-play&logoColor=white)](https://play.google.com/store/apps/details?id=com.nestify.familyorganizerapp)

</div>

---

## ✨ O que é isso?

Family Organizer é um **aplicativo web + mobile de código aberto para gerenciamento familiar** projetado para dispositivos compartilhados. Cada membro da família faz login com um PIN. Conclusões de tarefas, progresso do currículo, mensagens e saldos de mesada ficam **sincronizados em tempo real** em todos os dispositivos. Permissões de pais e filhos são completamente separadas.

> Construído a partir de necessidades familiares reais. Mais indicado para famílias que desejam total propriedade dos dados e estão confortáveis com auto-hospedagem.

### Family Organizer vs. Nestify

| | <img src="public/icon-192x192.png" height="20"/> Family Organizer | <img src="https://nestifyapp.org/_next/image?url=%2Flogo.png&w=64&q=75" height="20"/> [Nestify Family Organizer](https://www.nestifyapp.org) |
|---|---|---|
| | *(capturas de tela em breve)* | <a href="https://www.nestifyapp.org"><img src="https://nestifyapp.org/_next/image?url=%2Fimgs%2Ffamily-modes%2Ffm-calendar.png%3Fv%3D2026060726&w=1200&q=75" width="280"/></a> |
| Implantação | Auto-hospedado, requer servidor | Sem configuração, pronto para usar |
| Assistente IA | ❌ | ✅ Nestie IA |
| App mobile | Compilar do fonte (Expo) | App Store / Google Play |
| Planejamento de refeições | ❌ | ✅ |
| Propriedade dos dados | Totalmente sua | Criptografia E2E, hospedado na nuvem |

---

## 🎯 Funcionalidades

### 📋 Gestão de tarefas domésticas
- **Recorrência rrule** — agendamentos diários, semanais ou mensais com datas de início/fim e suporte a pausa
- **Rotação de membros** — atribui tarefas automaticamente a diferentes membros em ciclos
- **Recompensas livres** — defina uma recompensa fixa; quem concluir ganha
- **Rastreamento de conclusões** — registra qual membro marcou cada tarefa

### 📚 Séries de tarefas (ótimo para ensino domiciliar)
- **Fila deslizante** — tarefas avançam com base na conclusão, não na data
- **Subtarefas aninhadas + separadores de dia** — estrutura multinível e agendamento de sessões de vários dias
- **Campos de resposta + avaliação** — alunos enviam respostas; pais anotam e avaliam
- **Anexos de arquivo** — anexe imagens, PDFs, áudio ou vídeo a qualquer tarefa

### 📅 Calendário
- **Sistema de calendário duplo** — gregoriano e Bikram Samvat (nepalês) lado a lado
- **Múltiplas visualizações** — dia, vários dias, mês e ano
- **Sincronização com Apple Calendar** — importação unidirecional CalDAV do iCloud
- **Sobreposição de tarefas** — ver atribuições diretamente no calendário

### 💬 Mensagens familiares
- **Baseado em tópicos** — conversas organizadas por assunto
- **Confirmação de leitura** — marcar mensagens que exigem confirmação
- **Anexos** — compartilhar imagens e arquivos na conversa
- **Supervisão parental** — pais podem ver todos os tópicos da casa

### 💰 Finanças
- **Orçamento por envelopes** — múltiplos envelopes por membro com suporte a múltiplas moedas
- **Distribuição de mesada** — calcula automaticamente pagamentos por peso de tarefas concluídas
- **Recompensas fixas** — conclusões livres são depositadas diretamente
- **Histórico completo** — depósitos, saques, transferências e mesada recorrente

### 🗂️ Armazenamento de arquivos
- **Armazenamento centralizado** — S3/MinIO; imagens redimensionadas automaticamente para 64/320/1200px
- **Sistema de anexos** — mensagens e tarefas podem referenciar qualquer arquivo

### 📊 Painel e histórico
- **Visualizações familiar e pessoal** — web tem ambas; mobile mostra resumo diário
- **Log de auditoria** — histórico completo de alterações em tarefas, currículo e finanças

---

## 📸 Capturas de tela

> 🚧 Capturas de tela em breve — PRs são bem-vindos!

---

## 📱 Suporte de plataformas

| Plataforma | Status | Notas |
|------------|--------|-------|
| Web (Next.js) | ✅ Completo | Instalável como PWA |
| iOS / Android (Expo) | ✅ Funções principais | Tarefas, calendário, mensagens, finanças |
| Suporte offline | 🚧 Parcial | Funcionalidade básica disponível |

---

## 🚀 Início rápido

### Pré-requisitos

- Node.js 20+
- Conta [InstantDB](https://instantdb.com) (gratuita)
- Armazenamento compatível com S3 (MinIO incluído no Docker Compose)

### 1. Clonar e instalar

```bash
git clone https://github.com/your-username/family-organizer.git
cd family-organizer
npm install
```

### 2. Configurar variáveis de ambiente

```bash
cp .env.example .env
cp mobile/.env.example mobile/.env
```

| Variável | Descrição |
|----------|-----------|
| `NEXT_PUBLIC_INSTANT_APP_ID` | ID do app InstantDB (cliente) |
| `INSTANT_APP_ADMIN_TOKEN` | Token de administrador InstantDB |
| `DEVICE_ACCESS_KEY` | Segredo compartilhado para ativação do dispositivo |
| `NEXT_PUBLIC_S3_ENDPOINT` | Endpoint público MinIO/S3 |
| `S3_ENDPOINT` | Endpoint interno do servidor MinIO/S3 |
| `S3_BUCKET_NAME` | Nome do bucket |
| `S3_ACCESS_KEY_ID` | ID da chave de acesso S3 |
| `S3_SECRET_ACCESS_KEY` | Chave secreta de acesso S3 |

### 3. Publicar o schema do InstantDB

```bash
npx instant-cli push schema --yes
npx instant-cli push perms --yes
```

### 4. Iniciar o servidor de desenvolvimento

```bash
npm run dev
```

### 5. Ativar o dispositivo

```
http://localhost:3000/?activate=<DEVICE_ACCESS_KEY>
```

---

## 🐳 Docker / Auto-hospedagem

```bash
docker compose up -d --build
git pull && docker compose up -d --build
```

---

## 🛠 Stack

| Camada | Tecnologia |
|--------|------------|
| Framework web | Next.js 16 + React 18 + TypeScript |
| Mobile | Expo / React Native |
| Banco de dados e tempo real | InstantDB |
| Armazenamento de arquivos | MinIO / S3 + Sharp |
| Texto rico | TipTap 3 |
| Componentes UI | Radix UI + Tailwind CSS |
| Testes | Vitest + Playwright |

---

## 🤝 Contribuindo

Issues e PRs são bem-vindos. Este é um projeto pessoal — o ritmo de iteração segue as necessidades familiares reais, mas boas contribuições são revisadas com cuidado.

---

## 📄 Licença

Licenciado sob a [Apache License 2.0](./LICENSE).

Este projeto é um fork de [fivestones/family-organizer](https://github.com/fivestones/family-organizer), originalmente criado por **David Thomas** e lançado sob a licença MIT. O texto completo da licença MIT está preservado em [LICENSE](./LICENSE).
