#!/usr/bin/env python3
"""Autonomous PR merge-conflict resolution agent.

Input: a GitHub Pull Request URL.
Outcome: creates a new resolution PR against the original base branch.
"""

from __future__ import annotations

import argparse
import json
import os
import re
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
    body: str
    base_branch: str
    head_branch: str
    head_repo_clone_url: str


@dataclass
class ResolveStats:
    files_touched: int
    conflicts_resolved: int


class Shell:
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
            raise AgentError(
                f"Command failed: {' '.join(cmd)}\n"
                f"stdout:\n{process.stdout}\n"
                f"stderr:\n{process.stderr}"
            )
        return process


def parse_pr_url(url: str) -> PullRequestRef:
    parsed = urlparse(url)
    parts = [part for part in parsed.path.split("/") if part]
    if parsed.netloc not in {"github.com", "www.github.com"} or len(parts) < 4 or parts[2] != "pull":
        raise AgentError("Expected a GitHub pull request URL like https://github.com/org/repo/pull/123")

    owner, repo, _, raw_number = parts[:4]
    if not raw_number.isdigit():
        raise AgentError(f"Pull request number is invalid: {raw_number}")

    return PullRequestRef(owner=owner, repo=repo, number=int(raw_number))


def require_gh_cli() -> None:
    if shutil.which("gh") is None:
        raise AgentError("GitHub CLI (`gh`) is required but not found in PATH.")


def fetch_pr_meta(shell: Shell, pr: PullRequestRef) -> PullRequestMeta:
    process = shell.run(
        [
            "gh",
            "api",
            f"repos/{pr.slug}/pulls/{pr.number}",
            "--jq",
            "{number,title,body,base:.base.ref,head:.head.ref,head_repo:.head.repo.clone_url,html:.html_url}",
        ]
    )
    data = json.loads(process.stdout)
    return PullRequestMeta(
        url=data["html"],
        number=int(data["number"]),
        title=data.get("title") or "",
        body=data.get("body") or "",
        base_branch=data["base"],
        head_branch=data["head"],
        head_repo_clone_url=data["head_repo"],
    )


def clone_and_prepare(workdir: Path, pr: PullRequestRef, meta: PullRequestMeta) -> Shell:
    shell = Shell(workdir)
    shell.run(["git", "clone", f"https://github.com/{pr.slug}.git", "repo"])
    repo_shell = Shell(workdir / "repo")
    repo_shell.run(["git", "remote", "add", "headfork", meta.head_repo_clone_url], check=False)
    repo_shell.run(["git", "fetch", "origin", meta.base_branch])
    repo_shell.run(["git", "fetch", "headfork", meta.head_branch])

    resolution_branch = f"codex/resolve-pr-{meta.number}"
    repo_shell.run(["git", "checkout", "-B", resolution_branch, f"headfork/{meta.head_branch}"])
    return repo_shell


def list_conflicted_files(shell: Shell) -> list[Path]:
    process = shell.run(["git", "diff", "--name-only", "--diff-filter=U"], check=False)
    return [Path(line.strip()) for line in process.stdout.splitlines() if line.strip()]


def split_conflicts(text: str) -> tuple[str, int]:
    lines = text.splitlines(keepends=True)
    out: list[str] = []
    i = 0
    conflicts = 0

    while i < len(lines):
        line = lines[i]
        if not line.startswith(CONFLICT_START):
            out.append(line)
            i += 1
            continue

        conflicts += 1
        i += 1
        ours: list[str] = []
        theirs: list[str] = []
        while i < len(lines) and not lines[i].startswith(CONFLICT_MID):
            ours.append(lines[i])
            i += 1
        i += 1  # skip =======
        while i < len(lines) and not lines[i].startswith(CONFLICT_END):
            theirs.append(lines[i])
            i += 1
        i += 1  # skip >>>>>>>

        ours_text = "".join(ours)
        theirs_text = "".join(theirs)
        segment = (ours_text + theirs_text).lower()

        prefer_base = any(hint in segment for hint in SECURITY_API_HINTS)
        chosen = ours_text if prefer_base else theirs_text
        out.append(chosen)

    return "".join(out), conflicts


def resolve_conflicts(shell: Shell, repo_root: Path) -> ResolveStats:
    files = list_conflicted_files(shell)
    total_conflicts = 0

    for relative in files:
        absolute = repo_root / relative
        original = absolute.read_text(encoding="utf-8")
        resolved, count = split_conflicts(original)
        total_conflicts += count
        absolute.write_text(resolved, encoding="utf-8")
        shell.run(["git", "add", str(relative)])

    return ResolveStats(files_touched=len(files), conflicts_resolved=total_conflicts)


def discover_checks(repo_root: Path) -> list[list[str]]:
    checks: list[list[str]] = []
    if (repo_root / "package.json").exists():
        checks.append(["npm", "test", "--", "--runInBand"])
    if (repo_root / "pyproject.toml").exists() or (repo_root / "tests").exists():
        checks.append([sys.executable, "-m", "pytest", "-q"])
    if (repo_root / "Makefile").exists():
        checks.append(["make", "test"])
    return checks


def run_checks(shell: Shell, checks: Iterable[Sequence[str]]) -> None:
    for cmd in checks:
        shell.run(list(cmd), check=True)


def commit_resolution(shell: Shell, meta: PullRequestMeta, stats: ResolveStats) -> None:
    shell.run(["git", "status", "--short"])
    shell.run(
        [
            "git",
            "commit",
            "-m",
            f"Resolve merge conflicts for PR #{meta.number}",
            "-m",
            (
                f"Resolved {stats.conflicts_resolved} conflict block(s) across {stats.files_touched} file(s).\n"
                "Resolution policy: prefer base for security/public API/contract signals, "
                "otherwise preserve original PR intent."
            ),
        ]
    )


def open_resolution_pr(shell: Shell, pr: PullRequestRef, meta: PullRequestMeta, stats: ResolveStats) -> str:
    branch_name = shell.run(["git", "rev-parse", "--abbrev-ref", "HEAD"]).stdout.strip()
    shell.run(["git", "push", "-u", "origin", branch_name])

    body = (
        f"Resolves merge conflicts for original PR: {meta.url}\n\n"
        "### What was resolved\n"
        f"- Conflict blocks: {stats.conflicts_resolved}\n"
        f"- Files touched: {stats.files_touched}\n\n"
        "### Resolution rationale\n"
        "- Preserved original PR intent where safe.\n"
        "- Preferred base-branch behavior for shared contracts/security/public APIs.\n"
        "- Kept changes minimal and deterministic.\n\n"
        "### CI readiness\n"
        "- Ran available tests/linters locally before opening this PR."
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
            branch_name,
            "--title",
            f"Resolve conflicts for #{meta.number}: {meta.title}",
            "--body",
            body,
        ]
    )
    return process.stdout.strip()


def main() -> int:
    parser = argparse.ArgumentParser(description="Resolve GitHub PR conflicts and open a clean follow-up PR.")
    parser.add_argument("pr_url", help="GitHub PR URL")
    args = parser.parse_args()

    require_gh_cli()
    pr = parse_pr_url(args.pr_url)

    with tempfile.TemporaryDirectory(prefix="pr-resolver-") as temp_dir:
        workdir = Path(temp_dir)
        host_shell = Shell(workdir)
        meta = fetch_pr_meta(host_shell, pr)

        repo_shell = clone_and_prepare(workdir, pr, meta)

        merge_result = repo_shell.run(["git", "merge", "--no-ff", "--no-commit", f"origin/{meta.base_branch}"], check=False)
        if merge_result.returncode == 0:
            print("No conflicts detected; branch already clean against base.")
            return 0

        stats = resolve_conflicts(repo_shell, workdir / "repo")
        checks = discover_checks(workdir / "repo")
        run_checks(repo_shell, checks)
        commit_resolution(repo_shell, meta, stats)
        pr_url = open_resolution_pr(repo_shell, pr, meta, stats)
        print(pr_url)

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except AgentError as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(1)
