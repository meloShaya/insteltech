"""Import the upstream reference library without credentials or repository metadata."""
import json
import re
import shutil
import subprocess
from pathlib import Path

source = Path('/home/j-a-r-v-i-s/Documents/coldoutboundskills')
root = Path(__file__).resolve().parents[1]
target = root / 'crm' / 'library'
target.mkdir(parents=True, exist_ok=True)
for name in ('skills', 'docs', 'Common Outbound Lists'):
    if (source / name).exists():
        shutil.copytree(source / name, target / name, dirs_exist_ok=True,
                        ignore=shutil.ignore_patterns('.git', '.env', '.env.*', 'node_modules', '__pycache__', '*.pyc'))
for name in ('LICENSE', 'README.md'):
    shutil.copy2(source / name, target / name)
if (source / '.env.example').exists():
    keys = re.findall(r'^([A-Z][A-Z0-9_]*)\s*=', (source / '.env.example').read_text(), re.M)
    (target / '.env.example').write_text('# Original provider variable names, with all values removed.\n' + '\n'.join(key + '=' for key in dict.fromkeys(keys)) + '\n')
catalog = []
groups = {
    'Strategy': ['cold-email-kickoff', 'icp-onboarding', 'lead-magnet-brainstorm', 'campaign-strategy', 'campaign-copywriting', 'cold-email-starter-kit'],
    'Infrastructure': ['zapmail-domain-setup-public', 'smartlead-inbox-manager', 'email-deliverability-audit', 'deliverability-incident-response'],
    'Prospecting': ['list-builder', 'list-expander', 'prospeo-full-export', 'prospeo-search-api', 'blitz-list-builder', 'google-maps-list-builder', 'disco-like', 'competitor-engagers', 'icp-prompt-builder', 'list-quality-scorecard'],
    'Copy & send': ['spam-word-checker', 'smartlead-spintax', 'smartlead-api', 'smartlead-campaign-upload-public'],
}
for path in sorted((target / 'skills').rglob('SKILL.md')):
    raw = path.read_text()
    slug = path.parent.name
    description = re.search(r'^description:\s*(.*)', raw, re.M)
    description = description.group(1).strip().strip('"\'') if description else ''
    if description in ('>', '|', '>-', '|-') or not description:
        description = next((line.strip() for line in raw.splitlines() if len(line.strip()) > 70 and not line.startswith(('#', 'name:', 'description:'))), '')
    group = 'Signals' if 'playbooks' in path.parts else next((k for k, v in groups.items() if slug in v), 'Operations')
    catalog.append({'id': slug, 'title': slug.replace('-public', '').replace('-', ' ').title().replace('Icp', 'ICP'),
                    'description': description[:320].replace('Claude Code Task sub-agents', 'Codex sub-agents').replace('Claude', 'Codex'), 'group': group,
                    'path': str(path.relative_to(root / 'crm')),
                    'mode': 'codex'})
(root / 'crm' / 'catalog.json').write_text(json.dumps(catalog, indent=2) + '\n')
revision = subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip()
(target / 'SOURCE.json').write_text(json.dumps({'repository': 'https://github.com/growthenginenowoslawski/coldoutboundskills', 'revision': revision, 'license': 'MIT', 'imported': '2026-09-13', 'skills': len(catalog)}, indent=2) + '\n')
print(f'Imported {len(catalog)} workflows and their supporting references.')
