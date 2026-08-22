# Presence Desktop Agent

Processo local (Electron + Node/TypeScript) do Presence — Fase 10 do backend (`PROJECT_SPEC.md`, repositório principal `presence-37deb226`). A arquitetura completa (stack, separação de processos, wake word, controle do computador, WhatsApp, permissões, riscos) foi auditada e aprovada antes de qualquer código — ver `IMPLEMENTATION_STATE.md` no repositório principal.

## Escopo desta fatia (Fase A)

Só fundação + pareamento de dispositivo. **Não implementado ainda** (fases futuras, cada uma com aprovação própria): wake word, detecção de duas palmas, controle do computador (mouse/teclado/janelas/arquivos), integração com Claude Code/Git/GitHub, fila de comandos, WhatsApp, planner, automações.

O que existe nesta fatia:
- Processo Electron com Main Process, Tray (bandeja) e uma janela de status mínima.
- **Fechar a janela nunca encerra o agente** — só esconde. Sair de verdade é só pelo item "Encerrar" da bandeja.
- **Iniciar com o Windows** (autostart), configurável pela própria bandeja.
- **Pareamento com o backend cloud** por código de 6 dígitos — reaproveita integralmente os endpoints já implementados no repositório principal (`/api/presence/agent/pair/start`, `/pair/status`), sem nenhum mecanismo paralelo.
- **Armazenamento seguro da credencial do dispositivo** via `safeStorage` do próprio Electron (cofre do SO — DPAPI no Windows), nunca em texto puro em disco, nunca exposta ao renderer.
- **Ping** — prova o round-trip credencial-de-dispositivo → nuvem (`/api/presence/agent/ping`) antes de qualquer capacidade mais arriscada.

## Rodando

```bash
npm install
npm run start
```

Isso compila o TypeScript (`tsc`) e abre o Electron. Na primeira execução, sem pareamento ainda, a janela mostra um botão "Parear" — clique, um código de 6 dígitos aparece, e você o digita em Settings → Desktop Agent no app web do Presence (`spark-mind-friend.lovable.app`) enquanto estiver logada. Depois de aprovado, a janela mostra o dispositivo pareado e um botão "Ping" pra confirmar a comunicação de ponta a ponta.

Por padrão aponta para `https://spark-mind-friend.lovable.app`. Para apontar para outro ambiente (ex. desenvolvimento local do backend), defina `PRESENCE_CLOUD_URL` antes de rodar.

## Limitações conhecidas desta fatia

- Testado só por leitura de código e verificação de tipos (`npm run typecheck`) — **não foi possível rodar o Electron de ponta a ponta** no ambiente onde este código foi escrito (sem Windows real, sem sessão gráfica). A validação real depende de rodar isto num Windows de verdade.
- Empacotamento/instalador (`electron-builder`, assinatura de código) ainda não configurado — roda hoje só via `npm run start`, em modo desenvolvimento.
- Ícone da bandeja é um placeholder mínimo (círculo sólido), sem identidade visual definida ainda.
