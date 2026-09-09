# LinkedIn Post — Introducing URL Inspector

*Image to attach:* `build/linkedin_banner.jpg` (or `src/renderer/assets/linkedin_banner.jpg`)  
*Article link:* https://www.jaccon.com.br/post/introducing-url-inspector-a-high-performance-desktop-suite-for-real-time-web-diagnostics-core-web-vitals-traffic-shaping.html  
*GitHub repository:* https://github.com/jaccon/url-inspector  

---

### Option 1: English (Global Reach — Recommended)

🚀 Ever wondered why your web application feels slow in production, even when synthetic cloud audits give you a clean bill of health?

Traditional cloud-hosted audits run in pristine datacenter VMs with zero packet loss and infinite bandwidth. They don’t reflect real users navigating on volatile cellular connections — and once you close standard browser DevTools, your request waterfalls and telemetry are gone forever.

To solve this, I built and open-sourced **URL Inspector**: a high-performance desktop suite designed for deep real-time web diagnostics, deterministic traffic shaping, and Core Web Vitals engineering.

Built with **Electron 30**, **Node.js 20**, and pure Vanilla JS/CSS, URL Inspector binds directly to Chromium via the **Chrome DevTools Protocol (CDP)** at the socket layer to deliver:

🔹 **Pre-Audit Client Bandwidth Probing**: Validates your machine's throughput (Mbps) and ping latency first, separating local connection bottlenecks from remote server latency.
🔹 **Deterministic Network Traffic Shaping**: Accurately simulates Fast 4G, Slow 4G, 3G, and Cable connections at the socket level.
🔹 **Microsecond Timing Waterfalls**: Full visibility into DNS resolution, TCP handshakes, TLS negotiation, TTFB, and chunked downloads.
🔹 **Google Core Web Vitals**: Real-time evaluation of LCP, FCP, CLS, and TTFB against official thresholds, coupled with an overall Lighthouse performance score.
🔹 **API Origin & HTTP Status Filtering**: Isolate 1st-party backend services from 3rd-party trackers, and filter by status codes (2xx, 3xx, 4xx, 5xx).
🔹 **Full-Screen SQLite History**: Embedded WebAssembly SQLite (`sql.js`) indexing your entire run-over-run test history locally on your machine.
🔹 **One-Click .log Export**: Instant plaintext telemetry export for incident post-mortems and team benchmarks.

Zero telemetry tracking. Zero framework bloat. 100% private and local.

📖 Read the full deep-dive article detailing the architecture and engineering principles on my blog:
👉 https://www.jaccon.com.br/post/introducing-url-inspector-a-high-performance-desktop-suite-for-real-time-web-diagnostics-core-web-vitals-traffic-shaping.html

💻 Download the prebuilt macOS packages (native for both Apple Silicon and Intel) or explore the code on GitHub:
⭐ https://github.com/jaccon/url-inspector

Feedback, bug reports, and contributions are very welcome!

#WebPerformance #CoreWebVitals #SoftwareEngineering #DevTools #Electron #JavaScript #OpenSource #SRE #FrontendArchitecture #WebPerf

---

### Option 2: Português (Rede Brasil / LATAM)

🚀 Você já se perguntou por que uma aplicação web parece lenta para os usuários reais, mesmo quando auditorias sintéticas em nuvem mostram notas altas?

Testes convencionais em nuvem rodam em servidores de datacenters com banda quase infinita e sem oscilações de rede. Eles não reproduzem as limitações reais de conexões móveis — e assim que você fecha as DevTools do navegador, todos os dados de waterfall e requisições se perdem.

Para resolver esse gap, desenvolvi e disponibilizei como open source o **URL Inspector**: uma suíte desktop de alta performance voltada para diagnóstico de rede em tempo real, traffic shaping determinístico e análise profunda de Core Web Vitals.

Construído com **Electron 30**, **Node.js 20** e Vanilla JS/CSS, o URL Inspector se conecta diretamente ao motor do Chromium via **Chrome DevTools Protocol (CDP)** para entregar:

🔹 **Medição Prévia da Banda do Testador**: Mede sua velocidade real (Mbps) e ping antes do teste para isolar gargalos da sua conexão local de problemas no servidor.
🔹 **Traffic Shaping Determinístico**: Emula conexões celulares reais (Fast 4G, Slow 4G, 3G e Cabo) direto no nível de socket.
🔹 **Waterfalls em Microssegundos**: Visibilidade completa de resolução DNS, handshake TCP, negociação TLS, TTFB e download de conteúdo.
🔹 **Google Core Web Vitals**: Monitoramento em tempo real de LCP, FCP, CLS e TTFB com limiares oficiais do Google e score ponderado.
🔹 **Filtros por Status HTTP e Origem de APIs**: Separa chamadas dos seus microsserviços internos de scripts de terceiros e permite filtrar por status (2xx, 3xx, 4xx, 5xx).
🔹 **Histórico Persistente em SQLite**: Banco local embarcado via WebAssembly (`sql.js`) para comparar execuções passadas em tela cheia.
🔹 **Exportação de Logs (.log)**: Relatório completo em texto estruturado com um clique para anexar em post-mortems e auditorias.

Sem tracking, sem frameworks pesados de frontend e com privacidade total (100% local).

📖 Confira o artigo completo no meu blog com todos os detalhes arquiteturais e decisões técnicas:
👉 https://www.jaccon.com.br/post/introducing-url-inspector-a-high-performance-desktop-suite-for-real-time-web-diagnostics-core-web-vitals-traffic-shaping.html

💻 Baixe os instaladores nativos para macOS (Apple Silicon e Intel) ou confira o código no GitHub:
⭐ https://github.com/jaccon/url-inspector

Feedbacks e contribuições são muito bem-vindos!

#WebPerformance #CoreWebVitals #EngenhariaDeSoftware #DevTools #Electron #JavaScript #OpenSource #SRE #FrontendArchitecture
