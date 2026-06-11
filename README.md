# BMAD4ALL

Instalador do **BMAD Method** (Breakthrough Method for Agile AI-driven Development) para qualquer projeto, independente da linguagem.

Detecta automaticamente o tipo de projeto, sugere módulos apropriados e configura a integração com ferramentas AI.

## Pré-requisitos

- **Python 3.9+**
- **Node.js 20.12+** (recomendado) — para o instalador oficial
- **Git** — para módulos externos

> Sem Node.js, use `--fallback` para instalação alternativa via GitHub.

> **Limite de API GitHub:** O instalador oficial faz chamadas à API do GitHub.
> Anonimamente: 60 req/h. Defina `export GITHUB_TOKEN=seu_token` para 5000 req/h.
> Se atingir o limite, use `--next` ou `--pin tea=<tag>` para pular a resolução de tags.

## Instalação

```bash
git clone <repo> && cd bmad4all
python3 bmad_install.py
```

## Opções

| Flag | Descrição |
|------|-----------|
| `--dir, -d DIR` | Diretório do projeto (padrão: atual) |
| `--modules, -m MODULES` | Módulos separados por vírgula |
| `--tools, -t TOOLS` | Ferramentas AI separadas por vírgula |
| `--yes, -y` | Modo não-interativo (CI/CD) |
| `--detect` | Apenas detectar o projeto e sair |
| `--uninstall` | Remover BMAD do projeto |
| `--list-tools` | Listar ferramentas AI suportadas |
| `--fallback` | Instalação alternativa via GitHub (sem Node.js) |
| `--next` | Usar branch main dos módulos (evita resolução de tags) |
| `--pin tea=1.0.0` | Fixar versão específica de um módulo |

## Exemplos

```bash
# Instalação interativa (recomendado)
python3 bmad_install.py

# Instalar em diretório específico
python3 bmad_install.py --dir /caminho/do/projeto

# Modo CI/CD (não-interativo)
python3 bmad_install.py --dir /projeto --modules bmm,tea --tools claude-code --yes

# Apenas detectar o projeto
python3 bmad_install.py --detect --dir /projeto

# Instalação com Gemini + GitHub Copilot + Cursor
python3 bmad_install.py --tools gemini,github-copilot,cursor

# Instalação não-interativa com Gemini
python3 bmad_install.py --dir /projeto --modules bmm,tea --tools gemini --yes

# Pular resolução de tags (evita rate limit da API GitHub)
python3 bmad_install.py --modules bmm,tea --tools gemini --yes --next

# Fixar versão específica de um módulo
python3 bmad_install.py --modules bmm,tea --tools gemini --yes --pin tea=v0.2.0

# Contornar rate limit com GITHUB_TOKEN
export GITHUB_TOKEN=seu_token_github
python3 bmad_install.py --modules bmm,tea --tools gemini --yes

# Instalação sem Node.js
python3 bmad_install.py --fallback --dir /projeto

# Remover BMAD
python3 bmad_install.py --uninstall --dir /projeto
```

## Módulos

| Código | Nome | Descrição |
|--------|------|-----------|
| `bmm` | BMad Method | Framework principal com 34+ workflows |
| `tea` | Test Architect | Estratégia de testes e automação |
| `bmb` | BMad Builder | Criação de agentes e workflows |
| `cis` | Creative Intelligence Suite | Brainstorming e design thinking |
| `gds` | Game Dev Studio | Workflows para desenvolvimento de jogos |

## Ferramentas AI Suportadas

- `claude-code` — Claude Code CLI
- `cursor` — Cursor IDE
- `github-copilot` — GitHub Copilot
- `gemini` — Google Gemini CLI
- `codeium` — Codeium / Windsurf
- `codex` — Codex CLI

## Detecção de Projetos

Linguagens detectadas automaticamente:

Python, Node.js, Ruby, PHP, Java/Kotlin, Go, Rust, .NET, Elixir, Swift, C/C++, Terraform, R, Perl, Haskell, Docker.

A detecção de frameworks inclui: Django, Flask, FastAPI, React, Vue, Next.js, Nuxt, Svelte, Express, Gin, Echo, Fiber, Actix, Axum, Rocket, Maven, Gradle.

## Documentação

- [BMAD Method Docs](https://docs.bmad-method.org)
- [Instalação Não-Interativa](https://docs.bmad-method.org/how-to/non-interactive-installation/)
- [GitHub](https://github.com/bmad-code-org/BMAD-METHOD)
