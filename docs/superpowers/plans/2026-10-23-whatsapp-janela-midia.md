# Página WhatsApp: janela, mídia e áudio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A janela de conversa da página WhatsApp rola por painel, separa por dia, carrega o histórico aos poucos, mostra e envia foto, vídeo, documento e mensagem de voz.

**Architecture:** As regras puras (o que pode ser exibido, como classificar um arquivo, agrupar por dia, juntar páginas) ficam em `src/lib/whatsapp/midia.ts` e `src/lib/whatsapp/janela.ts`, testadas com `node:test`. As rotas `midia/[id]` e `enviar` usam essas regras. A tela (`ConversasClient`, `MensagemBolha`, `Composer`) consome tudo.

**Tech Stack:** Next.js 14 (app router), React 18, Tailwind, Postgres (`query`), Evolution API v2.3.7 (`sendMedia`, `sendWhatsAppAudio`, `getBase64FromMediaMessage`), MediaRecorder do navegador.

**Spec:** `docs/superpowers/specs/2026-10-23-whatsapp-janela-midia-design.md`

## Global Constraints

- **Exibição na tela:** só foto (`image/jpeg|png|webp|gif`), áudio (`audio/*`) e vídeo (`video/mp4|3gpp|webm`). O resto só baixa, como attachment.
- **Envio:** limite de 16 MB por arquivo; gravação de voz de no máximo 5 minutos; mesmas regras de envio do texto (permissão, escopo, 20 por minuto, registro "Não enviada").
- **Paginação:** 50 mensagens por página; a atualização a cada 10 s não descarta as mensagens antigas já carregadas.
- **Textos de tela:** em português, sem jargão; padrões visuais do PROJETE (tokens `ink`, `line`, `surface`, `raised`, `accent`; claro e escuro).
- **Novidades:** v1.16 no `NewsBanner`.

## Review Focus

1. Documento recebido com tipo `text/html` ou `image/svg+xml`, aberto com `?ver=1`: tem de sair como download, nunca inline.
2. Pessoa rolou para cima e carregou páginas antigas; chega o polling de 10 s: as antigas continuam e a rolagem não pula.
3. Gravação no Safari (`audio/mp4`) e no Chrome (`audio/webm`): as duas chegam como mensagem de voz.
4. Arquivo maior que 16 MB, ou vazio: erro claro, nada é enviado.
5. Envio de mídia falha no Evolution: fica "Não enviada", sem "Tentar de novo" (não há texto para reenviar).

---

### Task 1: Regras de mídia, rota de exibição e tamanho/duração no webhook

**Files:**
- Create: `web/src/lib/whatsapp/midia.ts`
- Create: `web/src/lib/whatsapp/midia.test.ts`
- Modify: `web/src/app/api/whatsapp/midia/[mensagemId]/route.ts`
- Modify: `web/src/lib/whatsapp/webhook.ts`
- Modify: `web/src/lib/whatsapp/webhook.test.ts`

**Interfaces:**
- Produces:
  - `exibivel(mimetype: string): boolean`
  - `classificarArquivo(a: { tamanho: number; mimetype: string; voz: boolean }): { ok: true; tipo: MensagemTipo; mediatype: 'image'|'video'|'document'|'audio' } | { ok: false; erro: string }`
  - `MAX_ARQUIVO = 16 * 1024 * 1024`
  - `midia` no `MensagemEvent` com `tamanho?: number` e `segundos?: number`

- [ ] Testes:
  - `exibivel` aceita jpeg, png, webp, gif, `audio/ogg; codecs=opus`, mp4 e webm.
  - `exibivel` recusa `text/html`, `image/svg+xml`, `application/pdf` e vazio.
  - `classificarArquivo`:
    - voz → `audio`;
    - jpeg → `imagem`/`image`;
    - mp4 → `video`/`video`;
    - pdf → `documento`/`document`;
    - `image/heic` → `documento`/`document`;
    - 0 bytes → erro;
    - 16 MB + 1 → erro "até 16 MB".
  - Parser: `imageMessage` com `fileLength: "34567"` e `audioMessage` com `seconds: 7` guardam `tamanho` e `segundos`.
- [ ] Implementar e ver passar.
- [ ] Rota de mídia com `?ver=1`:
  - exibível → `inline`, com `Content-Security-Policy: sandbox`, `nosniff` e `private, max-age=86400`;
  - os outros tipos continuam como download.
- [ ] Commit.

### Task 2: Envio de arquivo e de voz

**Files:**
- Modify: `web/src/lib/whatsapp/evolution.ts`
- Modify: `web/src/app/api/whatsapp/enviar/route.ts`

**Interfaces:**
- Consumes: `classificarArquivo`, `MAX_ARQUIVO`
- Produces:
  - `sendMedia(numero, { mediatype, mimetype, caption, fileName, base64 }): Promise<{ waId }>`
  - `sendVoice(numero, base64): Promise<{ waId }>`
  - `/api/whatsapp/enviar` aceita `multipart/form-data` com `arquivo`, `voz`, `legenda`, `conversa_id` | `telefone` + `cnpj`

- [ ] Simulador: `evolution-mock.mjs` responde `sendMedia` e `sendWhatsAppAudio` com `key.id`.
- [ ] Cenário local: envio de pdf, foto e voz pela rota grava a mensagem com tipo e mídia certos. Arquivo de 17 MB volta 400.
- [ ] Commit.

### Task 3: Janela — rolagem por painel, dia, histórico aos poucos

**Files:**
- Create: `web/src/lib/whatsapp/janela.ts`
- Create: `web/src/lib/whatsapp/janela.test.ts`
- Modify: `web/src/app/conversas/ConversasClient.tsx`

**Interfaces:**
- Produces:
  - `rotuloDia(iso: string, agora: Date): string` → "Hoje" | "Ontem" | "dd/mm/aaaa" (fuso America/Sao_Paulo)
  - `juntarMensagens<T extends { id: number; enviada_em: string }>(atuais: T[], novas: T[]): T[]` → por id, ordenado por `enviada_em` e `id`

- [ ] Testes:
  - `rotuloDia`: hoje, ontem e anterior. Uma mensagem às 23:30 de São Paulo é do dia de São Paulo, não do dia UTC.
  - `juntarMensagens`: junta sem repetir; a versão nova de um id substitui a antiga (status); ordena.
- [ ] Implementar e ver passar.
- [ ] Tela:
  - grade com altura da janela (`h-[calc(100dvh-…)]`), cada painel com rolagem própria;
  - separador por dia;
  - "carregar anteriores" ao chegar no topo, mantendo a posição;
  - polling junta;
  - só desce para o fim se a pessoa já estava no fim ou se enviou;
  - abas sem corte.
- [ ] Conferir no navegador: claro, escuro, 375 px.
- [ ] Commit.

### Task 4: Balão com mídia e caixa de envio com clipe e microfone

**Files:**
- Modify: `web/src/components/whatsapp/MensagemBolha.tsx`
- Create: `web/src/components/whatsapp/Gravador.tsx`
- Modify: `web/src/app/conversas/ConversasClient.tsx` (Composer)

- [ ] Balão:
  - foto e figurinha com `<img loading=lazy>` que abre em outra aba;
  - áudio com `<audio controls preload=none>`;
  - vídeo com `<video controls preload=none>`;
  - documento como cartão com nome, tamanho e download;
  - hora HH:MM sem quebra.
- [ ] Composer:
  - clipe (input file) e arrastar-soltar;
  - prévia do arquivo com legenda, enviar ou cancelar;
  - microfone (`Gravador`), com tempo correndo, cancelar, enviar e parada automática em 5 min.
  - Formato preferido da gravação: `audio/ogg;codecs=opus`; se o navegador não tiver, `audio/webm;codecs=opus`, depois `audio/mp4`.
- [ ] Conferir no navegador com o simulador.
- [ ] Commit.

### Task 5: Novidades, build, revisão final

- [ ] `NewsBanner` v1.16.
- [ ] `npm test`, `tsc`, lint e `next build`.
- [ ] Revisor final (subagente) e correções.
