---
title: 'Electron PageSpeed & Real-time Network Monitor'
type: 'feature'
created: '2026-09-08'
status: 'done'
baseline_commit: '28d93494af5e6587dfd1b608685605e977599b8f'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Desenvolvedores e analistas de performance precisam inspecionar requisições de rede (APIs, recursos) e métricas Core Web Vitals (LCP, FCP, CLS, TTFB) em tempo real enquanto um site carrega, dentro de uma aplicação desktop dedicada com interface Dark Mode elegante.

**Approach:** Construir uma aplicação Electron nativa com layout dark mode estruturado (header com login/usuário e relógio ao vivo, barra de URL com gatilho de auditoria, painel de métricas PageSpeed/Core Web Vitals e tabela/stream de requisições de rede em tempo real capturadas via Chrome DevTools Protocol/CDP e PerformanceObserver).

## Boundaries & Constraints

**Always:**
- Interface moderna Dark Mode (#0f172a / #1e293b / #334155 / acentos verde, azul e roxo).
- Header contendo: controle de login/perfil do usuário e relógio em tempo real com segundos (HH:mm:ss).
- Injeção segura e isolada via Electron `preload.js` usando `contextBridge` (`contextIsolation: true`, `nodeIntegration: false`).
- Coleta de métricas Core Web Vitals alinhada aos thresholds do Google PageSpeed/Lighthouse (LCP bom <= 2.5s, precisa melhorar <= 4.0s, ruim > 4.0s; FCP bom <= 1.8s; CLS bom <= 0.1; TTFB bom <= 800ms).
- Streaming de requisições de rede ao vivo enquanto a página carrega com detalhes: método, URL/endpoint, status code, tipo do recurso, tempo de resposta e tamanho transferido.
- Filtros por tipo de requisição (All, Fetch/XHR, JS, CSS, Img/Media, Doc) e busca textual por URL.

**Ask First:**
- Executar testes automatizados com emulação de throttling de rede móvel (Fast 3G / Slow 4G) por padrão.
- Integração com provedor OAuth externo real para login em vez de autenticação com sessão local/modal.

**Never:**
- Não usar `nodeIntegration: true` no processo de renderização por razões de segurança.
- Não depender de chaves de API pagas ou serviços externos bloqueados por rate limit para coletar métricas e rede (usar inspeção direta via motor Chromium/CDP nativo do Electron).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Início de Auditoria | URL válida: `https://example.com` | Limpa auditoria anterior, abre navegação em background, ativa streaming de rede e atualiza métricas LCP/FCP/CLS/TTFB em tempo real | Exibe estado de carregamento e progresso |
| URL Inválida ou sem protocolo | Entrada: `localhost:3000` ou `site.com` | Normaliza automaticamente para `http://` ou `https://` antes de disparar | Se formato inválido, exibe toast de validação |
| Falha de Conexão / DNS | URL inacessível (`https://site-inexistente-12345.xyz`) | Notifica erro de navegação no painel, registra requests com status de falha | Exibe banner de erro com código de falha do Chromium e botão para tentar novamente |
| Requisições Assíncronas Típicas | APIs XHR / Fetch disparadas após o onload | Continua capturando e adicionando à tabela de requisições em tempo real | Limite de buffer configurável para evitar sobrecarga de memória |
| Toggle / Modal de Login | Clique no botão de Login no Header | Exibe modal com campos de login/credenciais ou simulação de sessão ativa com avatar | Validação de formulário e persistência local de sessão |

</frozen-after-approval>

## Code Map

- `package.json` -- Configuração do projeto Electron, scripts de inicialização (`start`), build e dependências
- `src/main/main.js` -- Processo principal Electron, gerenciamento de janela principal, controle de sessão de auditoria e captura CDP/Network
- `src/main/auditor.js` -- Módulo responsável por carregar a URL em background, anexar Chrome DevTools Protocol, coletar requisições em tempo real e extrair Web Vitals (LCP, FCP, CLS, TTFB)
- `src/preload/preload.js` -- Script de preload com `contextBridge` expondo APIs seguras de auditoria, eventos de rede e sistema para o renderer
- `src/renderer/index.html` -- Estrutura HTML da interface: Header (login + relógio), Barra de URL, Painel Core Web Vitals, Tabela/Stream de Requests e Modal de Login
- `src/renderer/styles.css` -- Folha de estilos Dark Mode com design responsivo, variáveis CSS, badges de status e layout flex/grid
- `src/renderer/renderer.js` -- Lógica do renderer: atualização do relógio em tempo real, envio de comandos IPC, manipulação do DOM e atualização em tempo real de requisições e métricas
- `tests/metrics.test.js` -- Testes unitários para normalização de URLs, cálculo e categorização de thresholds de Core Web Vitals (LCP, FCP, CLS, TTFB)

## Tasks & Acceptance

**Execution:**
- [x] `package.json` -- Configurar projeto Node/Electron com scripts e dependências de teste e dev -- Base para execução e testes do app
- [x] `src/main/auditor.js` -- Implementar motor de auditoria usando `webContents.debugger` (CDP Network e Page) e injeção de PerformanceObserver para Web Vitals -- Captura precisa de requisições e métricas
- [x] `src/main/main.js` -- Configurar BrowserWindow, registrar canais IPC (`audit:start`, `audit:stop`) e despachar eventos ao vivo -- Orquestração do processo principal
- [x] `src/preload/preload.js` -- Expor canais seguros via `contextBridge` -- Comunicação bidirecional segura IPC
- [x] `src/renderer/index.html` -- Criar layout Dark Mode estruturado com Header (relógio + login), Input de URL, Painel Web Vitals e Tabela de Requests -- Interface visual do usuário
- [x] `src/renderer/styles.css` -- Definir paleta Dark Mode elegante, tipografia, transições, cards de métricas e tabela de requests -- Experiência visual moderna
- [x] `src/renderer/renderer.js` -- Implementar relógio em tempo real, formulário de login/sessão, filtros de requests, renderização reativa da tabela e cards de métricas -- Interatividade da UI
- [x] `tests/metrics.test.js` -- Criar testes unitários para cálculo de thresholds do PageSpeed e processamento de eventos de rede -- Garantia de qualidade e regressão

**Acceptance Criteria:**
- Given o app iniciado, when a tela abre, then exibe interface em Dark Mode, com relógio atualizando a cada segundo e botão de login funcional no header.
- Given uma URL digitada no campo, when o usuário clica em 'Analisar' (ou pressiona Enter), then o auditor inicia a navegação e exibe requisições de rede em tempo real à medida que são disparadas.
- Given o carregamento da página, when os eventos de renderização ocorrem, then os indicadores de LCP, FCP, CLS e TTFB são calculados e exibidos com cores indicativas (verde = bom, amarelo = precisa melhorar, vermelho = ruim).
- Given a lista de requisições sendo preenchida, when o usuário clica em um filtro (Ex: 'Fetch/XHR', 'JS') ou digita no campo de busca, then a tabela filtra instantaneamente os registros exibidos.

## Spec Change Log

*(Vazio - versão inicial)*

## Design Notes

- **Captura em Tempo Real:** O auditor cria um `WebContents` em background ou janela offscreen com `debugger.attach('1.3')`. Habilita `Network.enable` e `Page.enable`.
- **Eventos CDP:**
  - `Network.requestWillBeSent`: Cria linha com estado 'pending', URL, método, timestamp inicial e tipo de recurso.
  - `Network.responseReceived`: Atualiza status HTTP (200, 404, etc.), MIME type e headers.
  - `Network.loadingFinished` / `loadingFailed`: Calcula duração total (ms), tamanho transferido e finaliza o status.
- **Web Vitals no Navegador:** Script injetado via `Page.addScriptToEvaluateOnNewDocument` que registra `PerformanceObserver` para `'largest-contentful-paint'`, `'paint'` (FCP), `'layout-shift'` (CLS) e `navigation` (TTFB) emitindo eventos via `console.debug` capturados pelo CDP `Runtime.consoleAPICalled` ou polling IPC.

## Verification

**Commands:**
- `npm test` -- expected: Testes unitários de métricas e parsing de requisições passando com 100% de sucesso.
- `npm run check` -- expected: Validação de sintaxe e lint sem erros.

## Suggested Review Order

**Ponto de Entrada e Orquestração Desktop**

- Janela principal Dark Mode, ciclo de vida e registro de IPC handlers seguros
  [`main.js:1`](../src/main/main.js#L1)

- Auditoria CDP, captura de requisições e injeção do observer de Web Vitals
  [`auditor.js:1`](../src/main/auditor.js#L1)

- Bridge isolada de comunicação IPC segura entre processos com contextBridge
  [`preload.js:1`](../src/preload/preload.js#L1)

**Cálculo de Métricas e Rastreamento de Rede**

- Thresholds oficiais do Google PageSpeed (LCP, FCP, CLS, TTFB) e score composto
  [`metrics-calculator.js:1`](../src/shared/metrics-calculator.js#L1)

- Buffer de requisições, detecção de tipos, preservação de redirects e estatísticas
  [`network-tracker.js:1`](../src/shared/network-tracker.js#L1)

**Interface Dark Mode e Experiência do Usuário**

- Layout com Header (login e relógio ao vivo), barra de URL, vitals e tabela
  [`index.html:1`](../src/renderer/index.html#L1)

- Paleta Dark Mode, animação do gauge circular de score e timeline waterfall
  [`styles.css:1`](../src/renderer/styles.css#L1)

- Lógica do relógio, filtros por tipo, mitigação de XSS e renderização rAF
  [`renderer.js:1`](../src/renderer/renderer.js#L1)

**Testes Unitários e Validação**

- Cobertura de thresholds, sanitização de protocolos e formatação de unidades
  [`metrics.test.js:1`](../tests/metrics.test.js#L1)

- Validação do ciclo de vida de rede, evicção de buffer e redirects
  [`network-tracker.test.js:1`](../tests/network-tracker.test.js#L1)

