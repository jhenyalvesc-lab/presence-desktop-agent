# Presence Desktop Agent

Processo local (Electron + Node/TypeScript) do Presence — Fase 10 do backend (`PROJECT_SPEC.md`, repositório principal `presence-37deb226`). A arquitetura completa (stack, separação de processos, wake word, controle do computador, WhatsApp, permissões, riscos) foi auditada e aprovada antes de qualquer código — ver `IMPLEMENTATION_STATE.md` no repositório principal.

## Escopo implementado

**Fase A** — fundação + pareamento de dispositivo:
- Processo Electron com Main Process, Tray (bandeja) e uma janela de status mínima.
- **Fechar a janela nunca encerra o agente** — só esconde. Sair de verdade é só pelo item "Encerrar" da bandeja.
- **Iniciar com o Windows** (autostart), configurável pela própria bandeja.
- **Pareamento com o backend cloud** por código de 6 dígitos — reaproveita integralmente os endpoints já implementados no repositório principal (`/api/presence/agent/pair/start`, `/pair/status`), sem nenhum mecanismo paralelo.
- **Armazenamento seguro da credencial do dispositivo** via `safeStorage` do próprio Electron (cofre do SO — DPAPI no Windows), nunca em texto puro em disco, nunca exposta ao renderer.
- **Ping** — prova o round-trip credencial-de-dispositivo → nuvem (`/api/presence/agent/ping`) antes de qualquer capacidade mais arriscada.

**Fase 10B** — Audio Worker + Wake Word ("Presence"):
- **Audio Worker isolado** (`electron.utilityProcess`, `src/audio/audio-worker.ts`) — processo separado do Main, sobrevive a crash sem derrubar o resto do agente. Captura contínua de PCM via `@picovoice/pvrecorder-node`.
- **Wake Word Engine** (`src/audio/wake-word-engine.ts`), wrapper sobre `@picovoice/porcupine-node`. **"Presence" é uma keyword custom — não vem pronta no Porcupine.** Ativar de verdade exige duas coisas pessoais, que este código nunca fabrica nem simula:
  1. Uma **AccessKey gratuita** da conta da Jheny no [Picovoice Console](https://console.picovoice.ai/).
  2. Um **arquivo `.ppn`** da keyword "Presence" treinado nesse mesmo console, exportado para Windows.

  Configure via variáveis de ambiente antes de `npm run start`:
  ```
  PICOVOICE_ACCESS_KEY=<sua-access-key>
  PRESENCE_WAKE_WORD_KEYWORD_PATH=<caminho-para-o-arquivo-.ppn-treinado>
  PRESENCE_WAKE_WORD_SENSITIVITY=0.6   # opcional, 0–1
  ```
  Sem essas variáveis, o Audio Worker continua rodando normalmente (mic ativo, pronto para a Fase 10C de duas palmas) e a janela mostra "wake word não configurada" em vez de travar ou fingir que está ativa.
- O Main Process nunca processa PCM diretamente — só recebe eventos discretos do worker (`status`, `wake_detected`) via `audio-manager.ts`, exibidos na janela de status.
- Encerrar pela bandeja para o Audio Worker de forma limpa antes de sair.

**Ainda não implementado** (fases futuras, cada uma com sua própria entrega): detecção de duas palmas, controle do computador (mouse/teclado/janelas/arquivos), integração com Claude Code/Git/GitHub, fila de comandos, WhatsApp, planner, automações, permissões/confirmação, auditoria.

## Rodando

```bash
npm install
npm run start
```

Isso compila o TypeScript (`tsc`) e abre o Electron. Na primeira execução, sem pareamento ainda, a janela mostra um botão "Parear" — clique, um código de 6 dígitos aparece, e você o digita em Settings → Desktop Agent no app web do Presence (`spark-mind-friend.lovable.app`) enquanto estiver logada. Depois de aprovado, a janela mostra o dispositivo pareado e um botão "Ping" pra confirmar a comunicação de ponta a ponta.

Por padrão aponta para `https://spark-mind-friend.lovable.app`. Para apontar para outro ambiente (ex. desenvolvimento local do backend), defina `PRESENCE_CLOUD_URL` antes de rodar.

## Limitações conhecidas

- Validado por verificação de tipos (`npm run typecheck`) e por execução real do Electron sob `xvfb-run` (display virtual) neste ambiente de escrita — confirma que Main/Tray/Audio Worker sobem sem exceção e que os estados de status se comportam como esperado. **Não há microfone real neste ambiente** (`PvRecorder failed to initialize` é o erro esperado aqui, não um bug) nem Windows real — a validação de ponta a ponta com hardware de verdade depende de rodar isto num Windows de verdade.
- Wake word ("Presence") depende de uma AccessKey pessoal do Picovoice Console + um arquivo `.ppn` custom treinado — nenhum dos dois existe ainda; sem eles o Audio Worker roda com wake word desativada (`not_configured`), sem quebrar o resto do agente.
- Empacotamento/instalador (`electron-builder`, assinatura de código) ainda não configurado — roda hoje só via `npm run start`, em modo desenvolvimento.
- Ícone da bandeja é um placeholder mínimo (círculo sólido), sem identidade visual definida ainda.
