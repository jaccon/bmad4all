#!/usr/bin/env python3
"""
BMAD Method Installer — Instala o BMAD em qualquer projeto, independente da linguagem.

Uso:
  python bmad_install.py                    # Instalação interativa
  python bmad_install.py --dir /caminho     # Especificar diretório
  python bmad_install.py --yes              # Não-interativa (modo CI)
  python bmad_install.py --modules bmm,tea  # Selecionar módulos
  python bmad_install.py --tools claude-code,cursor  # Ferramentas AI
  python bmad_install.py --detect           # Apenas detecta o projeto
"""

import argparse
import json
import os
import platform
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path


# ─── Cores para terminal ───────────────────────────────────────────────
class Color:
    CYAN = "\033[96m"
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    RED = "\033[91m"
    MAGENTA = "\033[95m"
    BOLD = "\033[1m"
    DIM = "\033[2m"
    RESET = "\033[0m"


def log(msg: str, color: str = "") -> None:
    if not sys.stdout.isatty():
        color = ""
    print(f"{color}{msg}{Color.RESET}")


def log_step(msg: str) -> None:
    log(f"  {Color.CYAN}▶{Color.RESET} {msg}", Color.BOLD)


def log_ok(msg: str) -> None:
    log(f"  {Color.GREEN}✔{Color.RESET} {msg}")


def log_warn(msg: str) -> None:
    log(f"  {Color.YELLOW}⚠{Color.RESET} {msg}")


def log_err(msg: str) -> None:
    log(f"  {Color.RED}✘{Color.RESET} {msg}")


# ─── Detectores de projeto ──────────────────────────────────────────────
LANG_SIGNATURES: dict[str, list[str]] = {
    "python": ["setup.py", "setup.cfg", "pyproject.toml", "requirements.txt", "Pipfile", "poetry.lock"],
    "node": ["package.json", "package-lock.json", "yarn.lock", "pnpm-lock.yaml"],
    "ruby": ["Gemfile", "Gemfile.lock", "*.gemspec"],
    "php": ["composer.json", "composer.lock"],
    "java": ["pom.xml", "build.gradle", "build.gradle.kts"],
    "go": ["go.mod", "go.sum"],
    "rust": ["Cargo.toml", "Cargo.lock"],
    "dotnet": ["*.csproj", "*.fsproj", "*.sln"],
    "elixir": ["mix.exs", "mix.lock"],
    "swift": ["Package.swift"],
    "docker": ["Dockerfile", "docker-compose.yml"],
    "terraform": ["*.tf"],
    "c_cpp": ["CMakeLists.txt", "Makefile", "configure.ac"],
    "r": ["DESCRIPTION", "NAMESPACE"],
    "perl": ["Makefile.PL", "Build.PL", "cpanfile"],
    "haskell": ["*.cabal", "stack.yaml"],
}

LANG_LABELS: dict[str, str] = {
    "python": "Python",
    "node": "Node.js / JavaScript / TypeScript",
    "ruby": "Ruby",
    "php": "PHP",
    "java": "Java / JVM",
    "go": "Go",
    "rust": "Rust",
    "dotnet": ".NET",
    "elixir": "Elixir",
    "swift": "Swift",
    "docker": "Docker",
    "terraform": "Terraform",
    "c_cpp": "C / C++",
    "r": "R",
    "perl": "Perl",
    "haskell": "Haskell",
}

LANG_MODULES: dict[str, list[str]] = {
    "python": ["bmm", "tea"],
    "node": ["bmm", "tea"],
    "ruby": ["bmm"],
    "php": ["bmm"],
    "java": ["bmm", "tea"],
    "go": ["bmm"],
    "rust": ["bmm"],
    "dotnet": ["bmm", "tea"],
    "elixir": ["bmm"],
    "swift": ["bmm"],
    "docker": ["bmm"],
    "terraform": ["bmm"],
    "c_cpp": ["bmm"],
    "r": ["bmm"],
    "perl": ["bmm"],
    "haskell": ["bmm"],
    "generic": ["bmm"],
}


def detect_project(path: str) -> dict:
    """Detects the project language and framework based on files in the directory."""
    p = Path(path)
    if not p.is_dir():
        return {"language": "generic", "label": "Desconhecido", "framework": "", "files": []}

    found_files = []
    detected_lang = "generic"

    for lang, patterns in LANG_SIGNATURES.items():
        for pattern in patterns:
            if "*" in pattern:
                matches = list(p.glob(pattern))
                if matches:
                    found_files.extend(str(m.relative_to(p)) for m in matches)
                    detected_lang = lang
            elif (p / pattern).exists():
                found_files.append(pattern)
                detected_lang = lang

    detected_lang = detected_lang or "generic"

    framework = _detect_framework(p, detected_lang)

    return {
        "language": detected_lang,
        "label": LANG_LABELS.get(detected_lang, "Desconhecido"),
        "framework": framework,
        "files": found_files,
    }


def _detect_framework(path: Path, lang: str) -> str:
    """Detects specific framework within a language."""
    if lang == "python":
        if (path / "pyproject.toml").exists():
            content = (path / "pyproject.toml").read_text()
            for fw in ["django", "flask", "fastapi", "tornado"]:
                if fw in content.lower():
                    return fw.capitalize()
        if (path / "manage.py").exists():
            return "Django"
        if (path / "app.py").exists() or list(path.glob("*flask*")):
            return "Flask"
        if list(path.glob("*fastapi*")):
            return "FastAPI"

    elif lang == "node":
        pkg = path / "package.json"
        if pkg.exists():
            try:
                data = json.loads(pkg.read_text())
                deps = {**data.get("dependencies", {}), **data.get("devDependencies", {})}
                for fw in ["next", "nuxt", "remix", "svelte", "astro"]:
                    if fw in deps:
                        return fw.capitalize()
                if "react" in deps:
                    return "React"
                if "vue" in deps:
                    return "Vue"
                if "express" in deps:
                    return "Express"
            except (json.JSONDecodeError, KeyError):
                pass

    elif lang == "go":
        mod = path / "go.mod"
        if mod.exists():
            content = mod.read_text()
            for fw in ["gin", "echo", "fiber", "chi"]:
                if fw in content.lower():
                    return fw.capitalize()

    elif lang == "rust":
        cargo = path / "Cargo.toml"
        if cargo.exists():
            content = cargo.read_text()
            for fw in ["actix", "axum", "rocket", "tide"]:
                if fw in content.lower():
                    return fw.capitalize()

    elif lang == "java":
        if (path / "pom.xml").exists():
            return "Maven"
        if (path / "build.gradle").exists() or (path / "build.gradle.kts").exists():
            return "Gradle"
        if list(path.glob("**/*.java")):
            return "Java"

    return ""


def print_detection(info: dict) -> None:
    """Pretty-print project detection results."""
    log(f"\n{Color.BOLD}📋 Detecção do Projeto:{Color.RESET}")
    log(f"   Linguagem: {Color.MAGENTA}{info['label']}{Color.RESET}")
    if info["framework"]:
        log(f"   Framework: {Color.MAGENTA}{info['framework']}{Color.RESET}")
    if info["files"]:
        log(f"   Arquivos detectados: {Color.DIM}{', '.join(info['files'][:6])}{Color.RESET}")
        if len(info["files"]) > 6:
            log(f"   ... e mais {len(info['files']) - 6} arquivo(s)")


# ─── Instalação BMAD ────────────────────────────────────────────────────

BMAD_NPM = "bmad-method"
MIN_NODE_VERSION = (20, 12, 0)


def _parse_version(v: str) -> tuple:
    parts = v.lstrip("v").split(".")
    try:
        return tuple(int(p) for p in parts[:3])
    except ValueError:
        return (0, 0, 0)


def check_node() -> tuple[bool, str, tuple]:
    """Check if Node.js >= 20.12 is available."""
    node = shutil.which("node")
    if not node:
        return False, "Node.js não encontrado. Instale Node.js >= 20.12: https://nodejs.org", (0, 0, 0)

    try:
        result = subprocess.run([node, "--version"], capture_output=True, text=True, timeout=15)
        version_str = result.stdout.strip()
        version = _parse_version(version_str)
        ok = version >= MIN_NODE_VERSION
        msg = (
            f"Node.js {version_str} {'✓' if ok else '✗ (mínimo: v20.12+)'}"
        )
        return ok, msg, version
    except subprocess.TimeoutExpired:
        return False, "Node.js demorou para responder", (0, 0, 0)


def check_npx() -> bool:
    """Check if npx is available."""
    return shutil.which("npx") is not None


def check_github_token() -> str | None:
    """Check if GITHUB_TOKEN is set (avoids API rate limiting)."""
    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        token = os.environ.get("GH_TOKEN")
    return token


def run_npx_install(
    directory: str,
    modules: list[str] | None = None,
    tools: list[str] | None = None,
    yes: bool = False,
    use_next: bool = False,
    pin: str | None = None,
) -> bool:
    """Run the official BMAD installer via npx."""
    cmd = ["npx", BMAD_NPM, "install", "--directory", directory]

    if modules:
        cmd.extend(["--modules", ",".join(modules)])

    if tools:
        cmd.extend(["--tools", ",".join(tools)])

    if use_next:
        cmd.append("--all-next")

    if pin:
        cmd.extend(["--pin", pin])

    if yes:
        cmd.append("--yes")

    log(f"\n{Color.BOLD}🚀 Executando instalador oficial BMAD:{Color.RESET}")
    log(f"   {Color.DIM}{' '.join(cmd)}{Color.RESET}\n")

    try:
        result = subprocess.run(cmd)
        return result.returncode == 0
    except FileNotFoundError:
        log_err("Comando 'npx' não encontrado.")
        return False
    except KeyboardInterrupt:
        log_warn("\nInstalação cancelada pelo usuário.")
        return False


def run_npx_uninstall(directory: str) -> bool:
    """Run the official BMAD uninstaller."""
    cmd = ["npx", BMAD_NPM, "uninstall", "--directory", directory, "--yes"]

    log(f"\n{Color.BOLD}🗑️  Removendo BMAD:{Color.RESET}\n")

    try:
        result = subprocess.run(cmd)
        return result.returncode == 0
    except KeyboardInterrupt:
        log_warn("\nRemoção cancelada pelo usuário.")
        return False


# ─── Instalação alternativa (fallback) ──────────────────────────────────

def install_from_github_fallback(directory: str, version: str = "main") -> bool:
    """Fallback: download BMAD diretamente do GitHub e configura o projeto."""
    url = f"https://github.com/bmad-code-org/BMAD-METHOD/archive/refs/heads/{version}.zip"
    log_step(f"Baixando BMAD do GitHub ({version})...")

    try:
        with tempfile.TemporaryDirectory() as tmp:
            zip_path = os.path.join(tmp, "bmad.zip")
            urllib.request.urlretrieve(url, zip_path)

            extract_path = os.path.join(tmp, "extracted")
            with zipfile.ZipFile(zip_path, "r") as zf:
                zf.extractall(extract_path)

            repo_root = os.path.join(extract_path, f"BMAD-METHOD-{version}")
            if not os.path.isdir(repo_root):
                dirs = os.listdir(extract_path)
                if dirs:
                    repo_root = os.path.join(extract_path, dirs[0])

            dest = os.path.join(directory, "_bmad")
            if os.path.exists(dest):
                shutil.rmtree(dest)

            src_core = os.path.join(repo_root, "src")
            if os.path.isdir(src_core):
                shutil.copytree(src_core, dest)
                log_ok(f"BMAD instalado em {dest}/")
                return True
            else:
                log_err("Estrutura do BMAD não encontrada no repositório.")
                return False

    except Exception as e:
        log_err(f"Falha no download: {e}")
        return False


# ─── Interface interativa ───────────────────────────────────────────────

def prompt_yes_no(question: str, default: bool = True) -> bool:
    """Simple yes/no prompt."""
    suffix = " [Y/n]: " if default else " [y/N]: "
    while True:
        try:
            answer = input(f"{Color.BOLD}{question}{suffix}{Color.RESET}").strip().lower()
        except (EOFError, KeyboardInterrupt):
            print()
            return default
        if not answer:
            return default
        if answer in ("y", "yes", "s", "sim"):
            return True
        if answer in ("n", "no", "nao", "não"):
            return False
        print("  Responda com 'y' ou 'n'.")


def prompt_select(question: str, options: list[str], default: list[str] | None = None) -> list[str]:
    """Simple multi-select (comma-separated input)."""
    print(f"\n{Color.BOLD}{question}{Color.RESET}")
    for i, opt in enumerate(options, 1):
        sel = " [x]" if default and opt in default else " [ ]"
        print(f"  {i}.{sel} {opt}")
    print(f"  {Color.DIM}(digite números separados por vírgula, ex: 1,3){Color.RESET}")

    if default:
        default_nums = [str(i) for i, o in enumerate(options, 1) if o in default]
        print(f"  {Color.DIM}(padrão: {', '.join(default_nums)}){Color.RESET}")

    try:
        answer = input(f"{Color.BOLD}Seleção{Color.RESET}: ").strip()
    except (EOFError, KeyboardInterrupt):
        print()
        return default or []

    if not answer and default:
        return default

    selected = []
    for part in answer.split(","):
        part = part.strip()
        if part.isdigit():
            idx = int(part) - 1
            if 0 <= idx < len(options):
                selected.append(options[idx])
    return selected


def interactive_install(path: str, project_info: dict) -> bool:
    """Interactive installation flow."""
    log(f"\n{Color.BOLD}{'='*50}{Color.RESET}")
    log(f"{Color.BOLD}   BMAD Method Installer — v6{Color.RESET}")
    log(f"{Color.BOLD}{'='*50}{Color.RESET}")

    print_detection(project_info)

    # Check Node.js
    node_ok, node_msg, _ = check_node()
    log(f"\n{Color.BOLD}🔧 Pré-requisitos:{Color.RESET}")
    log(f"   {node_msg}")
    npx_ok = check_npx()
    log(f"   NPX: {'✓' if npx_ok else '✗'}")

    if not node_ok or not npx_ok:
        log_warn("\nNode.js >= 20.12 é necessário para o instalador oficial do BMAD.")
        fallback = prompt_yes_no("Deseja tentar instalação alternativa (download GitHub)?", False)
        if fallback:
            return install_from_github_fallback(path)
        log_err("Instalação cancelada. Instale Node.js: https://nodejs.org")
        return False

    # Module selection
    lang = project_info["language"]
    suggested = LANG_MODULES.get(lang, LANG_MODULES["generic"])
    all_modules = ["bmm", "tea", "bmb", "cis", "gds"]

    log(f"\n{Color.BOLD}📦 Módulos BMAD disponíveis:{Color.RESET}")
    module_desc = {
        "bmm": "BMad Method — Framework principal (34+ workflows)",
        "tea": "Test Architect — Estratégia de testes e automação",
        "bmb": "BMad Builder — Crie seus próprios agentes e workflows",
        "cis": "Creative Intelligence Suite — Brainstorming e design thinking",
        "gds": "Game Dev Studio — Workflows para desenvolvimento de jogos",
    }
    for m in all_modules:
        sel = " [x]" if m in suggested else " [ ]"
        desc = module_desc.get(m, "")
        log(f"    {sel} {Color.MAGENTA}{m}{Color.RESET} — {desc}")

    if not prompt_yes_no("Usar módulos sugeridos para este projeto?", True):
        selected_mods = prompt_select(
            "Selecione os módulos desejados:", all_modules, default=suggested
        )
    else:
        selected_mods = suggested
        log_ok(f"Módulos selecionados: {', '.join(selected_mods)}")

    # Tool selection
    all_tools = ["claude-code", "cursor", "github-copilot", "gemini", "codeium", "codex"]
    suggested_tools = ["claude-code"]
    for t in ["cursor", "github-copilot"]:
        if shutil.which(t.split("/")[0]) or shutil.which(t):
            suggested_tools.append(t)

    selected_tools = prompt_select(
        "Selecione as ferramentas AI para integração:", all_tools, default=suggested_tools
    )

    # Confirm
    log(f"\n{Color.BOLD}📋 Resumo da instalação:{Color.RESET}")
    log(f"   Diretório: {Color.MAGENTA}{path}{Color.RESET}")
    log(f"   Projeto:   {Color.MAGENTA}{project_info['label']}{Color.RESET}")
    log(f"   Módulos:   {Color.MAGENTA}{', '.join(selected_mods)}{Color.RESET}")
    log(f"   Ferramentas: {Color.MAGENTA}{', '.join(selected_tools)}{Color.RESET}")

    if not prompt_yes_no("\nConfirmar instalação?", True):
        log_warn("Instalação cancelada.")
        return False

    return run_npx_install(path, modules=selected_mods, tools=selected_tools)


# ─── List tools ─────────────────────────────────────────────────────────

def list_tools_via_npx() -> bool:
    """List supported AI tools via npx."""
    cmd = ["npx", BMAD_NPM, "install", "--list-tools"]
    log(f"\n{Color.BOLD}Ferramentas AI suportadas:{Color.RESET}\n")
    try:
        subprocess.run(cmd)
        return True
    except FileNotFoundError:
        log_err("Comando 'npx' não encontrado.")
        return False


# ─── CLI ────────────────────────────────────────────────────────────────

def main():
    banner = f"""{Color.CYAN}
  ╔══════════════════════════════════════════════╗
  ║    {Color.BOLD}BMAD Method Installer{Color.RESET}{Color.CYAN}              ║
  ║    {Color.DIM}Breakthrough Method for{Color.RESET}{Color.CYAN}              ║
  ║    {Color.DIM}Agile AI-driven Development{Color.RESET}{Color.CYAN}           ║
  ╚══════════════════════════════════════════════╝{Color.RESET}
"""
    log(banner)

    parser = argparse.ArgumentParser(
        description="BMAD Method Installer — Instala o BMAD em qualquer projeto.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=f"""
Exemplos:
  {os.path.basename(sys.argv[0])}                         Instalação interativa
  {os.path.basename(sys.argv[0])} --dir /meu/projeto       Instalar em diretório específico
  {os.path.basename(sys.argv[0])} --yes                    Modo não-interativo (CI/CD)
  {os.path.basename(sys.argv[0])} --modules bmm,tea        Instalar módulos específicos
  {os.path.basename(sys.argv[0])} --tools claude-code      Integrar com ferramentas específicas
  {os.path.basename(sys.argv[0])} --detect                 Apenas detectar o projeto
  {os.path.basename(sys.argv[0])} --uninstall              Remover BMAD do projeto
  {os.path.basename(sys.argv[0])} --list-tools             Listar ferramentas AI suportadas
  {os.path.basename(sys.argv[0])} --next --modules bmm     Usar branch main (sem rate limit)
  {os.path.basename(sys.argv[0])} --pin tea=v0.2.0         Fixar versão específica
        """,
    )

    parser.add_argument("--dir", "-d", default=".", help="Diretório do projeto (padrão: atual)")
    parser.add_argument("--modules", "-m", help="Módulos separados por vírgula (ex: bmm,tea)")
    parser.add_argument("--tools", "-t", help="Ferramentas AI separadas por vírgula (ex: claude-code,cursor)")
    parser.add_argument("--yes", "-y", action="store_true", help="Modo não-interativo (assume sim)")
    parser.add_argument("--detect", action="store_true", help="Apenas detectar o projeto e sair")
    parser.add_argument("--uninstall", action="store_true", help="Remover BMAD do projeto")
    parser.add_argument("--list-tools", action="store_true", help="Listar ferramentas AI suportadas")
    parser.add_argument("--next", action="store_true", help="Usar branch main dos módulos (evita resolução de tags)")
    parser.add_argument("--pin", help="Fixar versão de um módulo (ex: tea=v0.2.0)")
    parser.add_argument("--fallback", action="store_true", help="Usar instalação alternativa (GitHub)")

    args = parser.parse_args()
    project_path = os.path.abspath(args.dir)

    if args.list_tools:
        return list_tools_via_npx()

    if not os.path.isdir(project_path):
        log_err(f"Diretório não encontrado: {project_path}")
        sys.exit(1)

    # Detect project
    project_info = detect_project(project_path)

    if args.detect:
        print_detection(project_info)
        return

    if args.uninstall:
        node_ok, _, _ = check_node()
        if node_ok and check_npx():
            run_npx_uninstall(project_path)
        else:
            bmad_dir = os.path.join(project_path, "_bmad")
            if os.path.isdir(bmad_dir):
                shutil.rmtree(bmad_dir)
                log_ok("Diretório _bmad/ removido.")
            log_ok("BMAD removido do projeto.")
        return

    if args.next and not args.yes:
        log_warn("Usando --next: módulos serão instalados da branch main.")
        log_step("Pulando resolução de tags (útil se estiver com rate limit).")

    if args.pin and not args.yes:
        log_step(f"Versão fixada: {args.pin}")

    if args.fallback:
        success = install_from_github_fallback(project_path)
        sys.exit(0 if success else 1)

    # Check GitHub token (rate limit)
    gh_token = check_github_token()
    if not gh_token:
        if sys.stdout.isatty():
            log_warn(
                "GITHUB_TOKEN não definido. Limite de API: 60 req/h. "
                "Defina GITHUB_TOKEN para 5000 req/h."
            )

    # Validate Node.js for non-interactive mode
    node_ok, node_msg, _ = check_node()

    if args.yes or (args.modules and args.tools):
        # Non-interactive
        log(f"  {node_msg}")
        if not node_ok or not check_npx():
            log_err("Node.js >= 20.12 com npx é necessário. Instale em: https://nodejs.org")
            sys.exit(1)

        selected_mods = args.modules.split(",") if args.modules else LANG_MODULES.get(
            project_info["language"], LANG_MODULES["generic"]
        )
        selected_tools = args.tools.split(",") if args.tools else ["claude-code"]

        log_step(f"Projeto detectado: {project_info['label']}")
        log_step(f"Módulos: {', '.join(selected_mods)}")
        log_step(f"Ferramentas: {', '.join(selected_tools)}")

        success = run_npx_install(
            project_path,
            modules=selected_mods,
            tools=selected_tools,
            yes=True,
            use_next=args.next,
            pin=args.pin,
        )
        sys.exit(0 if success else 1)

    # Interactive
    success = interactive_install(project_path, project_info)

    if success:
        log(f"\n{Color.GREEN}{Color.BOLD}✅ BMAD instalado com sucesso!{Color.RESET}")
        log(f"\n{Color.BOLD}📘 Como usar o BMAD:{Color.RESET}")
        log(f"")
        log(f"  {Color.BOLD}1. Peça ajuda ao BMAD (recomendado):{Color.RESET}")
        log(f"     Na sua IDE AI (Claude Code, Cursor, Gemini etc.), digite:")
        log(f"     {Color.MAGENTA}bmad-help{Color.RESET}")
        log(f"     {Color.MAGENTA}bmad-help tenho uma ideia para um SaaS, por onde começo?{Color.RESET}")
        log(f"")
        log(f"  {Color.BOLD}2. Liste os agentes disponíveis:{Color.RESET}")
        log(f"     {Color.MAGENTA}bmad-agent-dev{Color.RESET}        — Desenvolvedor (implementação)")
        log(f"     {Color.MAGENTA}bmad-agent-pm{Color.RESET}         — Product Manager (PRD, épicos)")
        log(f"     {Color.MAGENTA}bmad-agent-architect{Color.RESET}  — Arquiteto (solução técnica)")
        log(f"     {Color.MAGENTA}bmad-agent-analyst{Color.RESET}    — Analista (brainstorming, pesquisa)")
        log(f"     {Color.MAGENTA}bmad-agent-ux-designer{Color.RESET} — UX Designer")
        log(f"")
        log(f"  {Color.BOLD}3. Fluxo completo para um novo projeto:{Color.RESET}")
        log(f"     {Color.DIM}# Chat 1:{Color.RESET} {Color.MAGENTA}bmad-prd{Color.RESET}              — Criar PRD (requisitos)")
        log(f"     {Color.DIM}# Chat 2:{Color.RESET} {Color.MAGENTA}bmad-agent-architect{Color.RESET}   — Carregar arquiteto")
        log(f"     {Color.DIM}# Chat 2:{Color.RESET} {Color.MAGENTA}bmad-create-architecture{Color.RESET} — Criar arquitetura")
        log(f"     {Color.DIM}# Chat 3:{Color.RESET} {Color.MAGENTA}bmad-agent-pm{Color.RESET}     → {Color.MAGENTA}bmad-create-epics-and-stories{Color.RESET}")
        log(f"     {Color.DIM}# Chat 4:{Color.RESET} {Color.MAGENTA}bmad-agent-dev{Color.RESET}     → {Color.MAGENTA}bmad-sprint-planning{Color.RESET}")
        log(f"     {Color.DIM}# Chat 5:{Color.RESET} {Color.MAGENTA}bmad-agent-dev{Color.RESET}     → {Color.MAGENTA}bmad-dev-story{Color.RESET}     — Implementar história")
        log(f"")
        log(f"  {Color.BOLD}4. Fluxo rápido (menos burocracia):{Color.RESET}")
        log(f"     {Color.MAGENTA}bmad-quick-dev{Color.RESET}  — Planeja + implementa em um único workflow")
        log(f"")
        log(f"  📖 Documentação completa: https://docs.bmad-method.org")
    else:
        log(f"\n{Color.RED}Falha na instalação do BMAD.{Color.RESET}")
        if not gh_token:
            log(f"\n{Color.YELLOW}💡 Dica: O erro pode ser limite de taxa da API do GitHub.{Color.RESET}")
            log(f"   Exporte um token: {Color.BOLD}export GITHUB_TOKEN=seu_token{Color.RESET}")
            log(f"   Ou use {Color.BOLD}--next{Color.RESET} para pular a resolução de tags:")
            log(f"   {Color.DIM}   bmad_install.py --modules bmm,tea --tools gemini --yes --next{Color.RESET}")
        sys.exit(1)


if __name__ == "__main__":
    main()
