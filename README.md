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
  Sem essas variáveis, o Audio Worker continua rodando normalmente (mic ativo) e a janela mostra "wake word não configurada" em vez de travar ou fingir que está ativa.
- O Main Process nunca processa PCM diretamente — só recebe eventos discretos do worker (`status`, `wake_detected`) via `audio-manager.ts`, exibidos na janela de status.
- Encerrar pela bandeja para o Audio Worker de forma limpa antes de sair.

**Fase 10C** — Duas palmas:
- **Detector de transiente em DSP puro** (`src/audio/clap-detector.ts`), sem lib pronta (não existe uma equivalente ao Porcupine pra isso) — plugado no mesmo laço de frames do Audio Worker, sobre o mesmo stream de PCM que já alimenta o Wake Word, sem um segundo pipeline de áudio. Detecta um pico de amplitude ("onset"), ignora a cauda/reverberação da mesma palma (debounce) e confirma "duas palmas" só quando um segundo onset aparece dentro de uma janela de tempo configurável depois do primeiro.
- **Ligado por padrão** (ao contrário do wake word, não depende de nenhuma credencial externa) — mas com falsos positivos/negativos esperados nesse tipo de detector, por isso a sensibilidade e a janela de tempo são configuráveis via variáveis de ambiente:
  ```
  PRESENCE_CLAP_ENABLED=true          # false desativa a detecção de duas palmas
  PRESENCE_CLAP_SENSITIVITY=0.5       # 0–1, mais alto = mais sensível (mais falsos positivos)
  PRESENCE_CLAP_MIN_GAP_MS=150        # menor intervalo aceito entre as duas palmas
  PRESENCE_CLAP_MAX_GAP_MS=600        # maior intervalo aceito entre as duas palmas
  PRESENCE_CLAP_DEBOUNCE_MS=100       # tempo mínimo entre dois onsets distintos
  ```
- Validado com um harness sintético (frames de PCM simulando silêncio/palmas com timestamps controlados) cobrindo 5 cenários: par dentro da janela detecta, uma palma isolada nunca detecta, intervalo maior que o máximo não conta como par, a cauda da mesma palma não vira uma segunda detecção, e som abaixo do limiar de sensibilidade não dispara — os cinco passaram.

**Fase 10D** — Voice Mode / interação por comando (STT):
- Quando a wake word ou as duas palmas disparam, o agente entra em modo de escuta e captura o próximo comando falado via um **STT Renderer** dedicado (`src/stt-window.ts` + `renderer/stt.js`) — uma `BrowserWindow` oculta que usa a Web Speech API do próprio Chromium embutido no Electron. **Exceção explícita e temporária ao Local-First** (já prevista na arquitetura aprovada): esse reconhecimento manda o áudio pros servidores do Google, não roda localmente.
- **Risco adicional, descoberto durante esta implementação, não coberto pela auditoria original:** builds "unbranded" do Chromium — como o do Electron — costumam não ter a chave de API do Google que a Web Speech API depende pra funcionar de verdade em produção (limitação conhecida do Electron, documentada em várias issues públicas do projeto). Só um teste real no Windows confirma se funciona; se não funcionar, a alternativa já prevista na arquitetura original é Whisper local (`whisper.cpp`).
- `src/voice-interaction.ts` orquestra o ciclo: wake word/duas palmas → "ouvindo" → captura via STT → texto do comando exposto pro Main/UI. **Só captura e mostra o texto nesta fatia** — executar o que foi pedido é escopo da Fase 10E (Tool Registry), ainda não implementada.
- Validado com `tsc --strict`/build limpos e execução real do Electron sob `xvfb-run`: a janela do STT é criada, a página roda `recognition.start()`, e o resultado (aqui, `not-allowed` — sem microfone/permissão real neste sandbox) volta corretamente por IPC até `captureVoiceCommand()`, sem travar nem derrubar o processo; o app completo (Tray + Audio Worker + Voice Interaction) sobe e permanece de pé sem erro.

**Ainda não implementado** (fases futuras, cada uma com sua própria entrega): execução de ações no Windows (Tool Registry), permissões/confirmação, scheduler, integração com Claude Code/Git/GitHub, fila de comandos, WhatsApp, planner, auditoria completa.

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
- Duas palmas: a lógica de DSP foi validada com dados sintéticos (sem hardware envolvido), mas os valores padrão de sensibilidade/janela de tempo nunca foram calibrados contra um microfone/ambiente real — bem provável que precisem de ajuste depois do primeiro teste real no Windows.
- STT (Fase 10D): a Web Speech API pode simplesmente não funcionar no Electron em produção (ver risco acima) — não confirmado nem descartado, só um teste real resolve.
- Empacotamento/instalador (`electron-builder`, assinatura de código) ainda não configurado — roda hoje só via `npm run start`, em modo desenvolvimento.
- Ícone da bandeja é um placeholder mínimo (círculo sólido), sem identidade visual definida ainda.
