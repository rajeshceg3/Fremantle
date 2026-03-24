#!/usr/bin/env python3
"""Autonomous GitHub PR merge-conflict resolution agent.

Input: one GitHub Pull Request URL.
Output: a new PR against the same base branch with conflict-resolution commits only.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Sequence
from urllib.parse import urlparse

CONFLICT_START = "<<<<<<<"
CONFLICT_MID = "======="
CONFLICT_END = ">>>>>>>"
SECURITY_API_HINTS = (
    "security",
    "auth",
    "permission",
    "token",
    "secret",
    "public api",
    "contract",
    "interface",
)


class AgentError(RuntimeError):
    """Controlled failure for user-facing errors."""


@dataclass(frozen=True)
class PullRequestRef:
    owner: str
    repo: str
    number: int

    @property
    def slug(self) -> str:
        return f"{self.owner}/{self.repo}"


@dataclass
class PullRequestMeta:
    url: str
    number: int
    title: str
    base_branch: str
    head_branch: str
    head_repo_clone_url: str


@dataclass
class ConflictDecision:
    path: Path
    blocks: int
    strategy: str


@dataclass
class ResolveStats:
    files_touched: int
    conflicts_resolved: int
    decisions: list[ConflictDecision]
    checks_ran: list[str]
    changed_files: list[str]


class Shell:
    """Minimal shell wrapper with deterministic env and safe error output."""

    def __init__(self, cwd: Path):
        self.cwd = cwd

    def run(self, cmd: Sequence[str], check: bool = True) -> subprocess.CompletedProcess[str]:
        process = subprocess.run(
            cmd,
            cwd=self.cwd,
            text=True,
            capture_output=True,
            check=False,
            env={**os.environ, "GIT_TERMINAL_PROMPT": "0"},
        )
        if check and process.returncode != 0:
            joined = " ".join(cmd)
            raise AgentError(
                f"Command failed: {joined}\n"
                f"stdout:\n{process.stdout}\n"
                f"stderr:\n{process.stderr}"
            )
        return process


def parse_pr_url(url: str) -> PullRequestRef:
    parsed = urlparse(url)
    parts = [part for part in parsed.path.split("/") if part]
    if parsed.netloc not in {"github.com", "www.github.com"} or len(parts) < 4 or parts[2] != "pull":
        raise AgentError("Expected GitHub URL format: https://github.com/<owner>/<repo>/pull/<number>")

    owner, repo, _, raw_number = parts[:4]
    if not raw_number.isdigit():
        raise AgentError(f"Invalid pull request number: {raw_number}")
    return PullRequestRef(owner=owner, repo=repo, number=int(raw_number))


def require_gh_cli() -> None:
    if shutil.which("gh") is None:
        raise AgentError("GitHub CLI (`gh`) is required and was not found in PATH.")


def fetch_pr_meta(shell: Shell, pr: PullRequestRef) -> PullRequestMeta:
    process = shell.run(
        [
            "gh",
            "api",
            f"repos/{pr.slug}/pulls/{pr.number}",
            "--jq",
            "{number,title,base:.base.ref,head:.head.ref,head_repo:.head.repo.clone_url,html:.html_url}",
        ]
    )
    data = json.loads(process.stdout)
    return PullRequestMeta(
        url=data["html"],
        number=int(data["number"]),
        title=data.get("title") or "",
        base_branch=data["base"],
        head_branch=data["head"],
        head_repo_clone_url=data["head_repo"],
    )


def fetch_viewer_login(shell: Shell) -> str:
    process = shell.run(["gh", "api", "user", "--jq", ".login"])
    login = process.stdout.strip()
    if not login:
        raise AgentError("Unable to determine authenticated GitHub user login.")
    return login


def clone_and_prepare(workdir: Path, pr: PullRequestRef, meta: PullRequestMeta) -> Shell:
    host_shell = Shell(workdir)
    host_shell.run(["git", "clone", "--quiet", f"https://github.com/{pr.slug}.git", "repo"])
    repo_shell = Shell(workdir / "repo")

    # Always fetch both base and head refs explicitly to avoid stale local state.
    repo_shell.run(["git", "remote", "add", "headfork", meta.head_repo_clone_url], check=False)
    repo_shell.run(["git", "fetch", "--quiet", "origin", meta.base_branch])
    repo_shell.run(["git", "fetch", "--quiet", "headfork", meta.head_branch])

    resolution_branch = f"codex/resolve-pr-{meta.number}"
    repo_shell.run(["git", "checkout", "--quiet", "-B", resolution_branch, f"headfork/{meta.head_branch}"])
    return repo_shell


def summarize_head_changes(shell: Shell, meta: PullRequestMeta) -> list[str]:
    process = shell.run(
        ["git", "diff", "--name-only", f"origin/{meta.base_branch}...HEAD"],
        check=False,
    )
    return sorted(line.strip() for line in process.stdout.splitlines() if line.strip())


def list_conflicted_files(shell: Shell) -> list[Path]:
    process = shell.run(["git", "diff", "--name-only", "--diff-filter=U"], check=False)
    return sorted(Path(line.strip()) for line in process.stdout.splitlines() if line.strip())


def choose_conflict_side(ours_text: str, theirs_text: str) -> tuple[str, str]:
    """Resolve one conflict block.

    During merge: current branch=head PR ("ours"), merged branch=base ("theirs").
    We prefer base ("theirs") for shared contracts/security/public API hints.
    """

    segment = (ours_text + theirs_text).lower()
    prefer_base = any(hint in segment for hint in SECURITY_API_HINTS)
    if prefer_base:
        return theirs_text, "prefer-base"
    return ours_text, "prefer-pr-intent"


def resolve_text_conflicts(text: str) -> tuple[str, int, set[str]]:
    lines = text.splitlines(keepends=True)
    out: list[str] = []
    idx = 0
    blocks = 0
    strategies: set[str] = set()

    while idx < len(lines):
        line = lines[idx]
        if not line.startswith(CONFLICT_START):
            out.append(line)
            idx += 1
            continue

        blocks += 1
        idx += 1
        ours: list[str] = []
        theirs: list[str] = []

        while idx < len(lines) and not lines[idx].startswith(CONFLICT_MID):
            ours.append(lines[idx])
            idx += 1
        if idx >= len(lines):
            raise AgentError("Malformed conflict marker: missing =======")
        idx += 1
        while idx < len(lines) and not lines[idx].startswith(CONFLICT_END):
            theirs.append(lines[idx])
            idx += 1
        if idx >= len(lines):
            raise AgentError("Malformed conflict marker: missing >>>>>>>")
        idx += 1

        chosen, strategy = choose_conflict_side("".join(ours), "".join(theirs))
        out.append(chosen)
        strategies.add(strategy)

    return "".join(out), blocks, strategies


def resolve_conflicts(shell: Shell, repo_root: Path) -> list[ConflictDecision]:
    decisions: list[ConflictDecision] = []
    for rel_path in list_conflicted_files(shell):
        abs_path = repo_root / rel_path

        try:
            original = abs_path.read_text(encoding="utf-8")
            resolved, blocks, strategies = resolve_text_conflicts(original)
            abs_path.write_text(resolved, encoding="utf-8")
            strategy = ",".join(sorted(strategies)) if strategies else "unknown"
        except UnicodeDecodeError:
            # Binary/unreadable conflict: safest default is upstream/base behavior.
            shell.run(["git", "checkout", "--theirs", str(rel_path)])
            blocks = 1
            strategy = "prefer-base-binary"

        shell.run(["git", "add", str(rel_path)])
        decisions.append(ConflictDecision(path=rel_path, blocks=blocks, strategy=strategy))

    return decisions


def ensure_clean_merge_state(shell: Shell) -> None:
    remaining = list_conflicted_files(shell)
    if remaining:
        lines = "\n".join(str(path) for path in remaining)
        raise AgentError(f"Unresolved conflicts remain:\n{lines}")


def discover_checks(repo_root: Path) -> list[list[str]]:
    checks: list[list[str]] = []
    if (repo_root / "package.json").exists():
        checks.append(["npm", "test", "--", "--runInBand"])
        checks.append(["npm", "run", "lint", "--if-present"])
    if (repo_root / "tests").exists():
        checks.append([sys.executable, "-m", "unittest", "-q"])
    if (repo_root / "pyproject.toml").exists():
        checks.append([sys.executable, "-m", "pytest", "-q"])
    if (repo_root / "Makefile").exists():
        checks.append(["make", "test"])
    return checks


def run_checks(shell: Shell, checks: Iterable[Sequence[str]]) -> list[str]:
    executed: list[str] = []
    for cmd in checks:
        shell.run(list(cmd), check=True)
        executed.append(" ".join(cmd))
    return executed


def commit_resolution(shell: Shell, meta: PullRequestMeta, stats: ResolveStats) -> None:
    if stats.conflicts_resolved == 0:
        raise AgentError("No conflict blocks were resolved; refusing to commit.")

    shell.run(
        [
            "git",
            "commit",
            "-m",
            f"Resolve merge conflicts for PR #{meta.number}",
            "-m",
            (
                f"Resolved {stats.conflicts_resolved} conflict block(s) across {stats.files_touched} file(s). "
                "Policy: preserve PR intent by default; prefer base for shared contract/security/public API conflicts."
            ),
        ]
    )


def format_resolution_summary(decisions: Iterable[ConflictDecision]) -> str:
    rows = [f"- `{item.path}`: {item.blocks} block(s), strategy `{item.strategy}`" for item in decisions]
    return "\n".join(rows) if rows else "- No conflicted files."


def ensure_fork_remote(shell: Shell, pr: PullRequestRef, viewer_login: str) -> tuple[str, str]:
    fork_slug = f"{viewer_login}/{pr.repo}"
    fork_url = f"https://github.com/{fork_slug}.git"
    shell.run(["git", "remote", "add", "autofork", fork_url], check=False)
    # Create fork if missing; no-op when already present.
    shell.run(["gh", "repo", "fork", pr.slug, "--remote=false", "--clone=false"], check=False)
    shell.run(["git", "fetch", "--quiet", "autofork"], check=False)
    return "autofork", fork_slug


def open_resolution_pr(shell: Shell, pr: PullRequestRef, meta: PullRequestMeta, stats: ResolveStats, viewer_login: str) -> str:
    branch = shell.run(["git", "rev-parse", "--abbrev-ref", "HEAD"]).stdout.strip()
    push_remote, fork_slug = ensure_fork_remote(shell, pr, viewer_login)
    shell.run(["git", "push", "-u", push_remote, branch])

    checks_summary = "\n".join(f"- `{cmd}`" for cmd in stats.checks_ran) if stats.checks_ran else "- No project test command detected."
    file_summary = "\n".join(f"- `{path}`" for path in stats.changed_files[:40]) or "- Unable to enumerate changed files."
    body = (
        f"Resolves merge conflicts for original PR: {meta.url}\n\n"
        "### PR files analyzed\n"
        f"{file_summary}\n\n"
        "### Conflict summary\n"
        f"{format_resolution_summary(stats.decisions)}\n\n"
        "### Rationale\n"
        "- Minimal, deterministic conflict-only changes.\n"
        "- Base-side preference for shared contracts/security/public APIs.\n"
        "- Otherwise kept PR-intent behavior and style.\n\n"
        "### CI readiness\n"
        f"{checks_summary}"
    )

    process = shell.run(
        [
            "gh",
            "pr",
            "create",
            "--repo",
            pr.slug,
            "--base",
            meta.base_branch,
            "--head",
            f"{viewer_login}:{branch}",
            "--title",
            f"Resolve conflicts for #{meta.number}: {meta.title}",
            "--body",
            body,
        ]
    )
    return process.stdout.strip()


def main() -> int:
    parser = argparse.ArgumentParser(description="Resolve merge conflicts in a GitHub PR and open a clean follow-up PR.")
    parser.add_argument("pr_url", help="GitHub PR URL, e.g. https://github.com/org/repo/pull/123")
    args = parser.parse_args()

    require_gh_cli()
    pr = parse_pr_url(args.pr_url)

    with tempfile.TemporaryDirectory(prefix="pr-resolver-") as temp:
        workdir = Path(temp)
        host_shell = Shell(workdir)
        viewer_login = fetch_viewer_login(host_shell)
        meta = fetch_pr_meta(host_shell, pr)
        repo_shell = clone_and_prepare(workdir, pr, meta)
        repo_root = workdir / "repo"
        changed_files = summarize_head_changes(repo_shell, meta)

        merge = repo_shell.run(["git", "merge", "--no-ff", "--no-commit", f"origin/{meta.base_branch}"], check=False)
        if merge.returncode == 0:
            print("No merge conflicts detected; no resolution PR created.")
            return 0

        decisions = resolve_conflicts(repo_shell, repo_root)
        ensure_clean_merge_state(repo_shell)
        checks_ran = run_checks(repo_shell, discover_checks(repo_root))

        stats = ResolveStats(
            files_touched=len(decisions),
            conflicts_resolved=sum(item.blocks for item in decisions),
            decisions=decisions,
            checks_ran=checks_ran,
            changed_files=changed_files,
        )
        commit_resolution(repo_shell, meta, stats)
        print(open_resolution_pr(repo_shell, pr, meta, stats, viewer_login))

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except AgentError as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(1)
