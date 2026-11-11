#!/usr/bin/env python3
"""Verification runner for Fremantle. See SKILL.md."""
import json, os, re, subprocess, sys, time
from pathlib import Path
REPO = Path(__file__).resolve().parents[3]
failures = []
def check(name, ok, detail=''):
    print(('PASS' if ok else 'FAIL'), name, (':: ' + str(detail))[:400] if detail else '')
    if not ok: failures.append(name)
def run(cmd, **kw):
    return subprocess.run(cmd, cwd=REPO, capture_output=True, text=True, timeout=900, **kw)
def main():
    if not (REPO / 'node_modules').is_dir():
        check('npm install', run(['npm', 'install', '--no-audit', '--no-fund']).returncode == 0)
    proc = run(['npm', 'run', 'build'])
    check('vite build', proc.returncode == 0, (proc.stdout + proc.stderr)[-300:])
    proc = run(['npm', 'run', 'check'])
    check('node --check core modules', proc.returncode == 0, (proc.stdout + proc.stderr)[-200:])
    proc = run([sys.executable, '-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_*.py'])
    check('immersion contract (static checks)', proc.returncode == 0 and 'OK' in proc.stderr, proc.stderr[-200:])
    proc = run(['npx', 'playwright', 'test'])
    tail = re.sub(r'\x1b\[[0-9;]*m', '', proc.stdout + proc.stderr)
    check('playwright worlds spec (6 viewport/motion states, real Chromium)', proc.returncode == 0 and ' failed' not in tail and 'passed' in tail, tail[-300:])
    print('FAILURES=%d' % len(failures))
    with open(REPO / '.cursor/skills/verify-fremantle/evidence.json', 'w') as f:
        json.dump({'repo': 'Fremantle', 'ts': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'failures': failures}, f, indent=2)
    return 1 if failures else 0
if __name__ == '__main__':
    sys.exit(main())
