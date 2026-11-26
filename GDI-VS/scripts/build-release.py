#!/usr/bin/env python3
"""Create deterministic project/Debug archives and a SHA-256 provenance record."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
EXCLUDED_DIRS = {'.git', '.venv', 'node_modules', '__pycache__', '.pytest_cache', 'dist', 'build', '.mypy_cache', '.ruff_cache'}
EXCLUDED_NAMES = {'.env', '.DS_Store'}
FIXED_TIME = (2020, 1, 1, 0, 0, 0)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def source_files(base: Path):
    for path in sorted(base.rglob('*')):
        if not path.is_file() or path.name in EXCLUDED_NAMES:
            continue
        relative = path.relative_to(base)
        if any(part in EXCLUDED_DIRS for part in relative.parts):
            continue
        if path.name.endswith(('.pyc', '.pyo')):
            continue
        yield path, relative


def tree_digest(files) -> str:
    digest = hashlib.sha256()
    for path, relative in files:
        digest.update(relative.as_posix().encode())
        digest.update(b'\0')
        digest.update(bytes.fromhex(sha256(path)))
    return digest.hexdigest()


def write_zip(target: Path, files, prefix: str = '') -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path, relative in files:
            name = f'{prefix}/{relative.as_posix()}' if prefix else relative.as_posix()
            info = zipfile.ZipInfo(name, FIXED_TIME)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (0o100644 & 0xFFFF) << 16
            archive.writestr(info, path.read_bytes())


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path, default=ROOT / 'release-output')
    parser.add_argument('--allow-incomplete-lockfiles', action='store_true', help='Package a development build while preserving lockfile blockers in provenance.')
    args = parser.parse_args()
    version = (ROOT / 'VERSION').read_text().strip()
    if not version or any(c not in '0123456789.' for c in version):
        raise SystemExit('VERSION must be a numeric semantic version.')

    lockfiles = {
        'frontend/package-lock.json': ROOT / 'frontend/package-lock.json',
        'backend/uv.lock': ROOT / 'backend/uv.lock',
        'blockchain/gateway/go.sum': ROOT / 'blockchain/gateway/go.sum',
        'blockchain/chaincode/gdi-document-contract/go.sum': ROOT / 'blockchain/chaincode/gdi-document-contract/go.sum',
    }
    missing = sorted(name for name, path in lockfiles.items() if not path.is_file() or path.stat().st_size == 0)
    if missing and not args.allow_incomplete_lockfiles:
        raise SystemExit('Release blocked; missing lockfiles: ' + ', '.join(missing))

    all_files = list(source_files(ROOT))
    debug_files = [(p, r.relative_to('Debug')) for p, r in all_files if r.parts and r.parts[0] == 'Debug' and len(r.parts) > 1]
    if not debug_files:
        raise SystemExit('Debug directory is empty; refusing to package.')
    source_hash = tree_digest(all_files)
    out = args.output_dir.resolve()
    project_zip = out / f'GDI-VS-v{version}-Project.zip'
    debug_zip = out / f'GDI-VS-v{version}-Debug.zip'
    write_zip(project_zip, all_files, 'GDI-VS')
    write_zip(debug_zip, debug_files)

    with zipfile.ZipFile(project_zip) as project, zipfile.ZipFile(debug_zip) as debug:
        embedded = {n.removeprefix('GDI-VS/Debug/'): hashlib.sha256(project.read(n)).hexdigest()
                    for n in project.namelist() if n.startswith('GDI-VS/Debug/') and not n.endswith('/')}
        standalone = {n: hashlib.sha256(debug.read(n)).hexdigest() for n in debug.namelist() if not n.endswith('/')}
    if embedded != standalone:
        raise SystemExit('Debug parity check failed between project and standalone archives.')

    provenance = {
        'schema': 'gdi-vs-release-provenance/v1',
        'product': 'GDI-VS',
        'version': version,
        'release_status': 'development' if missing else 'candidate',
        'source_tree_sha256': source_hash,
        'archives': {
            project_zip.name: {'sha256': sha256(project_zip), 'size_bytes': project_zip.stat().st_size},
            debug_zip.name: {'sha256': sha256(debug_zip), 'size_bytes': debug_zip.stat().st_size},
        },
        'debug_parity': {'status': 'passed', 'file_count': len(standalone)},
        'dependency_lockfiles': {name: ('missing' if name in missing else 'present') for name in lockfiles},
        'non_lockfile_module_checks': {'blockchain/evidence-verifier/go.mod': 'standard_library_only_no_go_sum_required'},
        'release_signing': 'not_performed',
        'slsa_attestation': 'not_generated_locally',
        'build_reproducibility': 'deterministic_zip_metadata_and_order',
    }
    provenance_path = out / f'GDI-VS-v{version}-PROVENANCE.json'
    provenance_path.write_text(json.dumps(provenance, indent=2) + '\n', encoding='utf-8')
    sums_path = out / f'GDI-VS-v{version}-SHA256SUMS.txt'
    sums_path.write_text(''.join(f'{sha256(p)}  {p.name}\n' for p in (project_zip, debug_zip, provenance_path)), encoding='utf-8')
    print(json.dumps(provenance, indent=2))
    print(f'Checksums: {sums_path}')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
