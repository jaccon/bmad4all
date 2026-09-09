---
title: 'Network Monitor Enhancements: Validation Toast, Connection Failure Retry & Request Details Drawer'
type: 'feature'
created: '2026-09-08'
status: 'done'
baseline_commit: 'a9907f1ae003623ca24f701df4f2db9a563a5233'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Usuários e desenvolvedores enfrentam falta de feedback visual imediato para URLs inválidas (toast ausente), ausência de recuperação rápida (botão de retry) no banner de falha de conexão/DNS do Chromium, e impossibilidade de inspecionar cabeçalhos HTTP, timing e payload detalhados ao selecionar uma requisição na tabela de rede em tempo real.

**Approach:** Implementar sistema de toasts não intrusivo para validação de formato e protocolo de URLs; aprimorar o banner de erro com código de falha do Chromium e botão funcional de "Tentar novamente"; capturar cabeçalhos HTTP de requisição/resposta no motor CDP e exibir um Drawer lateral expansível para inspeção detalhada de cada requisição selecionada.

## Boundaries & Constraints

**Always:**
- Preservar a paleta Dark Mode existente (#090d16 / #111827 / #1e293b / #38bdf8) e isolamento seguro (`contextIsolation: true`, `nodeIntegration: false`).
- Sanitizar e escapar todo conteúdo renderizado no DOM (especialmente cabeçalhos HTTP e URLs para prevenção rigorosa contra XSS).
- O botão de "Tentar novamente" no banner de falha deve redisparar a auditoria com a mesma URL sem recarregar a janela do app.
- O Drawer de inspeção de detalhes deve abrir ao clicar na linha da requisição na tabela e fechar ao clicar em "Fechar" ou tecla `ESC`.
- Todos os testes unitários existentes e novos devem passar com 100% de sucesso.

**Ask First:**
- Emulação de throttling de rede móvel (Fast 3G / Slow 4G) por padrão.
- Integração de visualizador binário para payloads de imagens no Drawer.

**Never:**
- Não utilizar `innerHTML` com interpolação direta de dados de rede não sanitizados.
- Não introduzir dependências externas de UI (usar JavaScript vanilla no renderer e APIs nativas do Electron/Node).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| URL Inválida | Digitação de URL com caracteres ilegais ou protocolo não suportado (ex: `ftp://` ou formato inválido) | Exibe toast com mensagem de erro de validação e destaca o campo de URL | Não dispara navegação nem limpa estado anterior |
| Falha de Conexão / DNS | Falha no carregamento (evento `did-fail-load` com código Chromium, ex: `-105` ou `-102`) | Banner de erro exibe mensagem contextual, código de erro Chromium e botão "Tentar Novamente" visível | Clicar em "Tentar Novamente" reinicia a auditoria para a mesma URL |
| Clique em Linha de Requisição | Usuário clica em uma linha da tabela de rede | Abre Drawer lateral deslizando da direita com abas: Cabeçalhos (Geral, Request, Response) e Timing | Se a requisição ainda estiver pendente, indica estado dinâmico sem quebrar a UI |
| Fechar Drawer de Inspeção | Usuário pressiona tecla ESC ou clica no botão ✕ do Drawer | Drawer fecha suavemente e desmarca a linha selecionada na tabela | N/A |
| Múltiplos Toasts Consecutivos | Validações repetidas | Toasts empilham suavemente no canto inferior direito com auto-dismiss após 4 segundos | N/A |

</frozen-after-approval>

## Code Map

- `src/shared/network-tracker.js` -- Armazenamento de cabeçalhos (`requestHeaders`, `responseHeaders`) e dados de timing detalhados em cada registro de requisição
- `tests/network-tracker.test.js` -- Testes unitários para persistência de cabeçalhos e integridade dos dados detalhados da requisição
- `src/main/auditor.js` -- Repasse dos cabeçalhos capturados no CDP (`request.headers`, `response.headers`) para o tracker
- `src/renderer/index.html` -- Marcação para container de Toasts, botão de Retry no banner de status e Drawer lateral de inspeção com abas
- `src/renderer/styles.css` -- Folha de estilo para animação dos Toasts, botão de Retry no banner de erro e Drawer lateral Dark Mode com tabs
- `src/renderer/renderer.js` -- Controlador de Toasts, ação do botão Retry, seleção de linhas e binding de dados de cabeçalhos no Drawer

## Tasks & Acceptance

**Execution:**
- [x] `src/shared/network-tracker.js` -- Atualizar captura e retenção de requestHeaders e responseHeaders na estrutura de dados do tracker -- Suporte à inspeção profunda de rede
- [x] `tests/network-tracker.test.js` -- Adicionar testes unitários para verificação de retenção de cabeçalhos de requisição e resposta -- Garantia de não regressão do modelo de dados
- [x] `src/main/auditor.js` -- Garantir que parâmetros de cabeçalhos vindos do CDP `Network.requestWillBeSent` e `Network.responseReceived` sejam passados ao tracker -- Integração CDP de cabeçalhos
- [x] `src/renderer/index.html` -- Adicionar container de toasts, botão de retry no banner de status e marcação do Drawer de detalhes de requisição -- Elementos de interface na DOM
- [x] `src/renderer/styles.css` -- Definir estilização Dark Mode para Toasts com animação, layout do Drawer com backdrop/docking e botão de retry -- Experiência visual Dark Mode fluida
- [x] `src/renderer/renderer.js` -- Implementar sistema de toasts, ação do botão Tentar Novamente e abertura/fechamento do Drawer com inspeção de cabeçalhos sanitizados -- Comportamento interativo do usuário

**Acceptance Criteria:**
- Given uma URL com protocolo não permitido ou inválida, when o usuário tenta disparar a auditoria, then exibe um Toast estilizado no canto da tela informando o erro de validação sem travar a interface.
- Given um erro de conexão reportado pelo Chromium (`did-fail-load`), when o banner de erro é exibido, then apresenta o código de erro numérico, a mensagem descritiva e um botão "Tentar Novamente" funcional.
- Given requisições capturadas na tabela, when o usuário clica em qualquer linha, then abre o Drawer lateral exibindo a URL completa, método, status, cabeçalhos de requisição e cabeçalhos de resposta de forma sanitizada.
- Given o Drawer lateral aberto, when o usuário pressiona ESC ou clica no botão fechar, then o Drawer fecha e a seleção da tabela é removida.

## Spec Change Log

*(Vazio - versão inicial do refinamento)*

## Verification

**Commands:**
- `npm test` -- expected: Todos os testes unitários passando com 100% de sucesso incluindo novos testes de cabeçalhos.
- `npm run check` -- expected: Sintaxe válida sem erros em todos os arquivos alterados.

## Suggested Review Order

**Inspeção de Cabeçalhos e Modelo de Dados**

- Captura e preservação de requestHeaders e responseHeaders na estrutura de dados
  [`network-tracker.js:88`](../src/shared/network-tracker.js#L88)

- Testes unitários para retenção e validação de integridade dos cabeçalhos
  [`network-tracker.test.js:175`](../tests/network-tracker.test.js#L175)

- Tratamento de erro de navegação Chromium com salvaguarda de sub-recursos e abort
  [`auditor.js:247`](../src/main/auditor.js#L247)

**Interface e Componentes Dark Mode**

- Estrutura HTML do Drawer lateral de inspeção, banner de erro com retry e container de toasts
  [`index.html:294`](../src/renderer/index.html#L294)

- Estilos Dark Mode para o Drawer deslizante, animações de Toast e estados de erro
  [`styles.css:1055`](../src/renderer/styles.css#L1055)

**Comportamento Reativo e Validações no Renderer**

- Validação de entrada de URL e sistema de toasts com limite de buffer FIFO
  [`renderer.js:130`](../src/renderer/renderer.js#L130)

- Ciclo de vida de abertura, fechamento e binding de dados sanitizados no Drawer
  [`renderer.js:658`](../src/renderer/renderer.js#L658)

- Tratamento de falha de conexão com código de erro e re-disparo via botão de retry
  [`renderer.js:828`](../src/renderer/renderer.js#L828)
