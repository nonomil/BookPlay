"""Check this delivery's links, plan consistency, and status update safeguards."""
from pathlib import Path
import importlib.util
import json
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[4]
REPORT = ROOT / 'docs/reports/2026-09-06-全项目审查'
PLAN = ROOT / 'docs/plans/2026-09-06-全项目优化'
broken = []
md_files = list(REPORT.rglob('*.md')) + list(PLAN.rglob('*.md'))
for file in md_files:
    for target in re.findall(r'\]\(([^)]+)\)', file.read_text(encoding='utf-8')):
        if target.startswith(('http:', 'https:', '#')): continue
        target = target.split('#')[0]
        if not (file.parent / target).exists(): broken.append({'file': str(file.relative_to(ROOT)), 'target': target})
checks = []
with tempfile.TemporaryDirectory(prefix='bookplay-plan-check-') as folder:
    copied = Path(folder) / 'plan'
    shutil.copytree(PLAN, copied)
    script = copied / 'tools/sync_status.py'
    def run(label, args, expected_ok):
        result = subprocess.run([sys.executable, '-X', 'utf8', str(script), *args], text=True, encoding='utf-8', capture_output=True)
        ok = (result.returncode == 0) == expected_ok
        checks.append({'case': label, 'pass': ok, 'exit': result.returncode, 'output': (result.stdout + result.stderr).strip()})
    run('initial board', ['--check'], True)
    before = (copied / 'tasks/state.json').read_bytes()
    run('reject done without evidence', ['--subtask','T01-S01','--status','done','--owner','fixture'], False)
    assert (copied / 'tasks/state.json').read_bytes() == before
    run('reject unmet dependency', ['--subtask','T02-S01','--status','doing','--owner','fixture'], False)
    run('claim first subtask', ['--subtask','T01-S01','--status','doing','--owner','fixture'], True)
    run('reject README placeholder', ['--subtask','T01-S01','--status','review','--evidence','tasks/T01/evidence/README.md'], False)
    receipt = copied / 'tasks/T01/evidence/S01-fixture.md'
    receipt.write_text('Fixture only, outside project.\n', encoding='utf-8')
    run('submit evidence', ['--subtask','T01-S01','--status','review','--evidence','tasks/T01/evidence/S01-fixture.md'], True)
    run('finish first subtask', ['--subtask','T01-S01','--status','done'], True)
    run('board remains consistent', ['--check'], True)
    run('reject blocked without reason', ['--subtask','T01-S02','--status','blocked'], False)
    run('record blocker', ['--subtask','T01-S02','--status','blocked','--blocker','fixture dependency missing'], True)

result = {'markdown_files': len(md_files), 'task_files': len(list((PLAN / 'tasks').glob('T*/TASK.md'))), 'subtask_files': len(list((PLAN / 'tasks').glob('T*/subtasks/S*.md'))), 'broken_links': broken, 'status_guard_checks': checks}
print(json.dumps(result, ensure_ascii=False, indent=2))
raise SystemExit(1 if broken or any(not c['pass'] for c in checks) else 0)
