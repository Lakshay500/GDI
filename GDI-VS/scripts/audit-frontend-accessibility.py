#!/usr/bin/env python3
from __future__ import annotations
import json, os, shutil, subprocess, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def main():
    node=shutil.which('node'); npm=shutil.which('npm')
    if not node: print('Node.js is required',file=sys.stderr); return 2
    candidates=[ROOT/'frontend/node_modules/typescript/lib/typescript.js']
    if npm:
        try:
            result=subprocess.run([npm,'root','-g'],capture_output=True,text=True,timeout=5,check=True)
            candidates.append(Path(result.stdout.strip())/'typescript/lib/typescript.js')
        except (OSError,subprocess.SubprocessError): pass
    module=next((p for p in candidates if p.is_file()),None)
    if not module: print('TypeScript compiler API unavailable; install frontend dependencies or global TypeScript',file=sys.stderr); return 2
    run=subprocess.run([node,str(ROOT/'scripts/audit-frontend-accessibility.cjs'),str(module)],cwd=ROOT,capture_output=True,text=True,timeout=30)
    try: report=json.loads(run.stdout)
    except json.JSONDecodeError:
        print(run.stderr or run.stdout,file=sys.stderr); return run.returncode or 2
    out=ROOT/'artifacts/frontend-accessibility-audit-v0.94.0.json'; out.parent.mkdir(parents=True,exist_ok=True); out.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2)); return run.returncode
if __name__=='__main__': raise SystemExit(main())
