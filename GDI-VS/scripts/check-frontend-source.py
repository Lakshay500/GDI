#!/usr/bin/env python3
"""Offline structural and TS/TSX syntax preflight for the GDI-VS frontend.

This is deliberately not a substitute for TypeScript semantic checking or Vite's
production bundle. Those require the locked frontend dependencies.
"""
from __future__ import annotations
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / 'frontend'
SOURCE = FRONTEND / 'src'
REQUIRED_SCRIPTS = {'dev', 'typecheck', 'build', 'preview', 'check:source'}


def find_typescript() -> Path | None:
    candidates = [FRONTEND / 'node_modules/typescript/lib/typescript.js']
    node = shutil.which('node')
    npm = shutil.which('npm')
    if npm:
        try:
            global_root = subprocess.run([npm, 'root', '-g'], check=True, capture_output=True, text=True, timeout=5).stdout.strip()
            if global_root:
                candidates.append(Path(global_root) / 'typescript/lib/typescript.js')
        except (subprocess.SubprocessError, OSError):
            pass
    env_root = os.environ.get('NODE_PATH')
    if env_root:
        candidates.extend(Path(part) / 'typescript/lib/typescript.js' for part in env_root.split(os.pathsep) if part)
    return next((candidate for candidate in candidates if candidate.is_file()), None)


def main() -> int:
    errors: list[str] = []
    package_path = FRONTEND / 'package.json'
    try:
        package = json.loads(package_path.read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError) as exc:
        print(f'FAIL: cannot read frontend package manifest: {exc}', file=sys.stderr)
        return 2

    missing_scripts = sorted(REQUIRED_SCRIPTS - set(package.get('scripts', {})))
    if missing_scripts:
        errors.append('missing package scripts: ' + ', '.join(missing_scripts))

    tsconfig = FRONTEND / 'tsconfig.json'
    try:
        config = json.loads(tsconfig.read_text(encoding='utf-8'))
        if config.get('compilerOptions', {}).get('strict') is not True:
            errors.append('frontend/tsconfig.json must keep strict=true')
        if config.get('compilerOptions', {}).get('noEmit') is not True:
            errors.append('frontend/tsconfig.json must keep noEmit=true')
    except (OSError, json.JSONDecodeError) as exc:
        errors.append(f'invalid tsconfig: {exc}')

    entry = FRONTEND / 'index.html'
    if not entry.is_file() or 'id="root"' not in entry.read_text(encoding='utf-8'):
        errors.append('frontend/index.html must provide the #root mount element')

    sources = sorted(path for path in SOURCE.rglob('*') if path.suffix in {'.ts', '.tsx'})
    if not sources:
        errors.append('no TypeScript source files found under frontend/src')

    # Resolve only relative imports; bare imports are supplied by package dependencies.
    import re
    import_pattern = re.compile(r'''(?:from\s*|import\s*)["'](\.[^"']+)["']''')
    for source in sources:
        body = source.read_text(encoding='utf-8')
        for specifier in import_pattern.findall(body):
            target = (source.parent / specifier)
            possibilities = [target, *(target.with_suffix(ext) for ext in ('.ts', '.tsx', '.js', '.jsx', '.css'))]
            possibilities.extend(target / f'index{ext}' for ext in ('.ts', '.tsx', '.js', '.jsx'))
            if not any(candidate.is_file() for candidate in possibilities):
                errors.append(f'{source.relative_to(ROOT)}: unresolved relative import {specifier!r}')

    node = shutil.which('node')
    ts_module = find_typescript()
    if not node:
        errors.append('Node.js is required for TypeScript/TSX syntax parsing')
    elif not ts_module:
        errors.append('TypeScript compiler is unavailable; install frontend dependencies or global TypeScript')
    else:
        js = r'''const ts = require(process.argv[1]);
const fs = require('fs');
const files = JSON.parse(fs.readFileSync(0, 'utf8'));
let failed = false;
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const result = ts.transpileModule(source, {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX, isolatedModules: true }
  });
  for (const diagnostic of result.diagnostics || []) {
    failed = true;
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\\n');
    process.stderr.write(`${file}: ${message}\\n`);
  }
}
process.exit(failed ? 1 : 0);'''
        try:
            run = subprocess.run([node, '-e', js, str(ts_module)], input=json.dumps([str(p) for p in sources]),
                                 text=True, capture_output=True, timeout=30)
            if run.returncode:
                errors.append('TypeScript/TSX syntax parsing failed: ' + (run.stderr.strip() or run.stdout.strip()))
        except subprocess.SubprocessError as exc:
            errors.append(f'TypeScript/TSX syntax parser failed: {exc}')

    if errors:
        for error in errors:
            print(f'FAIL: {error}', file=sys.stderr)
        return 1
    print(json.dumps({'status': 'passed', 'source_files': len(sources),
                      'checks': ['package scripts', 'strict tsconfig', 'HTML mount',
                                 'relative imports', 'TypeScript/TSX syntax'],
                      'semantic_typecheck': 'not_performed', 'vite_production_build': 'not_performed'}, indent=2))
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
