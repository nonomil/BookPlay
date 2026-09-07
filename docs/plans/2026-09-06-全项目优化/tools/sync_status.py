"""Validate the living plan and regenerate STATUS.md. No background scheduling."""
from __future__ import annotations
import argparse
from datetime import datetime
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / 'tasks/state.json'
BOARD = ROOT / 'STATUS.md'
VALID = {'todo', 'doing', 'review', 'done', 'blocked'}

def derived(task):
    states = [s['status'] for s in task['subtasks']]
    if all(s == 'done' for s in states): return 'done'
    if 'blocked' in states: return 'blocked'
    if 'doing' in states: return 'doing'
    if 'review' in states: return 'review'
    if 'done' in states: return 'doing'
    return 'todo'

def validate(data):
    tasks = data['tasks']
    ids = [t['id'] for t in tasks]
    if len(ids) != len(set(ids)): raise ValueError('duplicate task id')
    by_id = {t['id']: t for t in tasks}
    seen = set()
    for task in tasks:
        if not task['subtasks']: raise ValueError('empty task')
        if task['status'] != derived(task): raise ValueError(f"{task['id']}: task status must be derived")
        for dep in task['depends_on']:
            if dep not in by_id: raise ValueError(f'unknown dependency {dep}')
        for index, sub in enumerate(task['subtasks']):
            if sub['id'] in seen: raise ValueError('duplicate subtask id')
            seen.add(sub['id'])
            if sub['status'] not in VALID: raise ValueError('invalid status')
            if sub['status'] == 'blocked' and not sub.get('blocker'): raise ValueError('blocked requires reason')
            if sub['status'] in {'doing', 'review', 'done'}:
                if not task.get('owner'): raise ValueError('active task requires owner')
                if any(by_id[d]['status'] != 'done' for d in task['depends_on']): raise ValueError(f"{sub['id']}: dependency not done")
                if any(s['status'] != 'done' for s in task['subtasks'][:index]): raise ValueError(f"{sub['id']}: prior subtask not done")
            if sub['status'] in {'review', 'done'} and not sub.get('evidence'): raise ValueError('review/done requires evidence')
            for name in sub.get('evidence', []):
                path = (ROOT / name).resolve()
                if not path.is_relative_to(ROOT): raise ValueError('evidence must stay in plan folder')
                if not path.is_file() or path.name.lower() == 'readme.md': raise ValueError(f'missing or placeholder evidence: {name}')
    visiting, visited = set(), set()
    def visit(key):
        if key in visiting: raise ValueError('dependency cycle')
        if key in visited: return
        visiting.add(key)
        for dep in by_id[key]['depends_on']: visit(dep)
        visiting.remove(key)
        visited.add(key)
    for key in by_id: visit(key)

def render(data):
    tasks = data['tasks']
    subs = [s for t in tasks for s in t['subtasks']]
    done = sum(s['status'] == 'done' for s in subs)
    lines = ['# 全项目优化实时看板', '', f"更新时间：{data['updated_at']}。由 tasks/state.json 生成，请勿手动修改。", '',
        '审查与计划已交付；此表仅统计后续优化实施。状态反映实际执行，未开始不等于已排期。', '',
        f"任务完成：{sum(t['status'] == 'done' for t in tasks)}/{len(tasks)}；子任务完成：{done}/{len(subs)}。", '',
        '| 任务 | 状态 | 负责人 | 依赖 | 子任务 |', '|---|---|---|---|---|']
    for t in tasks:
        lines.append(f"| [{t['id']} {t['title']}](tasks/{t['id']}/TASK.md) | {t['status']} | {t.get('owner') or '待领取'} | {', '.join(t['depends_on']) or '无'} | " + ' / '.join(s['status'] for s in t['subtasks']) + ' |')
    lines += ['', '## 下一步', '']
    by_id = {t['id']: t for t in tasks}
    for t in tasks:
        if all(by_id[d]['status'] == 'done' for d in t['depends_on']):
            pending = next((s for s in t['subtasks'] if s['status'] != 'done'), None)
            if pending: lines.append(f"- {pending['id']}：{pending['title']}（{pending['status']}）")
    lines += ['', '## 阻塞与证据', '']
    entries = 0
    for t in tasks:
        for s in t['subtasks']:
            if s.get('blocker'):
                lines.append(f"- {s['id']} 阻塞：{s['blocker']}"); entries += 1
            for evidence in s.get('evidence', []):
                lines.append(f"- {s['id']}：[验收证据]({evidence})"); entries += 1
    if not entries: lines.append('尚无优化执行证据；当前基线的五项失败见审查报告，不能据此看板声称已修复。')
    return '\n'.join(lines) + '\n'

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--subtask')
    parser.add_argument('--status', choices=sorted(VALID))
    parser.add_argument('--owner')
    parser.add_argument('--evidence', action='append', default=[])
    parser.add_argument('--blocker')
    args = parser.parse_args()
    if args.check and any([args.subtask, args.status, args.owner, args.evidence, args.blocker]): parser.error('--check is read-only')
    if bool(args.subtask) != bool(args.status): parser.error('--subtask and --status are required together')
    if not args.subtask and any([args.owner, args.evidence, args.blocker]): parser.error('updates require --subtask')
    data = json.loads(STATE.read_text(encoding='utf-8'))
    if args.subtask:
        found = False
        for task in data['tasks']:
            for sub in task['subtasks']:
                if sub['id'] != args.subtask: continue
                found = True
                sub['status'] = args.status
                sub['blocker'] = args.blocker if args.status == 'blocked' else None
                sub['evidence'] = list(dict.fromkeys(sub.get('evidence', []) + args.evidence))
                sub['updated_at'] = datetime.now().astimezone().isoformat(timespec='seconds')
                if args.owner: task['owner'] = args.owner
        if not found: raise ValueError('unknown subtask')
        data['updated_at'] = datetime.now().astimezone().isoformat(timespec='seconds')
        for task in data['tasks']: task['status'] = derived(task)
    validate(data)
    board = render(data)
    if args.check:
        if not BOARD.is_file() or BOARD.read_text(encoding='utf-8') != board: raise ValueError('STATUS.md is stale; run without --check')
        print('OK: 10-task plan structure, dependencies, evidence and board are consistent')
        return
    if args.subtask:
        temporary = STATE.with_suffix('.tmp')
        temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        temporary.replace(STATE)
    BOARD.write_text(board, encoding='utf-8')
    print('STATUS.md updated')

if __name__ == '__main__':
    try: main()
    except (ValueError, KeyError, OSError) as exc:
        raise SystemExit(f'ERROR: {exc}')
