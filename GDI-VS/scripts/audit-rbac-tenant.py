#!/usr/bin/env python3
"""Generate a conservative endpoint RBAC/tenant-scope review register.

Static indicators are triage aids only; they do not prove runtime authorization.
"""
from __future__ import annotations
import ast, csv, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parents[1]
API_DIR = ROOT / "backend/app/api/v1"
OUT = ROOT / "docs/audit/rbac-tenant-review-register.csv"
METHODS = {"get", "post", "put", "patch", "delete", "options", "head"}

def literal(node):
    try: return str(ast.literal_eval(node))
    except Exception: return ast.unparse(node)

def prefix_for(tree):
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "router" for t in node.targets):
            call = node.value
            if isinstance(call, ast.Call) and isinstance(call.func, ast.Name) and call.func.id == "APIRouter":
                for kw in call.keywords:
                    if kw.arg == "prefix": return literal(kw.value)
    return ""

rows=[]
for path in sorted(API_DIR.glob("*.py")):
    source=path.read_text(encoding="utf-8")
    tree=ast.parse(source)
    prefix=prefix_for(tree)
    for node in ast.walk(tree):
        if not isinstance(node,(ast.FunctionDef,ast.AsyncFunctionDef)): continue
        decs=[d for d in node.decorator_list if isinstance(d,ast.Call) and isinstance(d.func,ast.Attribute) and d.func.attr in METHODS]
        if not decs: continue
        params=[]
        for arg in node.args.args + node.args.kwonlyargs:
            default=None
            positional=node.args.args
            if arg in positional and node.args.defaults:
                idx=positional.index(arg)-(len(positional)-len(node.args.defaults))
                if idx>=0: default=node.args.defaults[idx]
            if default is not None and "Depends(" in ast.unparse(default): params.append(ast.unparse(default))
            if arg.annotation and "Depends(" in ast.unparse(arg.annotation): params.append(ast.unparse(arg.annotation))
        dep=" | ".join(sorted(set(params))) or "NONE"
        if "require_roles" in dep: auth="ROLE_GUARDED"
        elif "get_current_user" in dep or "oauth2_scheme" in dep: auth="AUTHENTICATED"
        elif path.name=="auth.py" and node.name in {"login","refresh"}: auth="PUBLIC_AUTH_FLOW"
        elif path.name=="public_verification.py" and node.name=="public_verify": auth="PUBLIC_BEARER_LINK"
        else: auth="REVIEW_REQUIRED"
        role_expr=""
        m=re.search(r"require_roles\((.*?)\)",dep)
        if m: role_expr=m.group(1)
        body=ast.get_source_segment(source,node) or ast.unparse(node)
        lower=body.lower()
        tenant="EXPLICIT_ORG_FILTER_SIGNAL" if "organisation_id" in lower or "organization_id" in lower else "NO_STATIC_ORG_FILTER_SIGNAL"
        if "_tenant_" in lower or "_owned_" in lower: tenant="TENANT_HELPER_SIGNAL"
        for d in decs:
            route=literal(d.args[0]) if d.args else ""
            full=re.sub(r"/{2,}","/",prefix.rstrip("/")+"/"+route.lstrip("/")) or "/"
            rows.append({"method":d.func.attr.upper(),"path":full,"module":path.name,"handler":node.name,
                         "auth_classification":auth,"dependency_expression":dep,"role_expression":role_expr,
                         "tenant_scope_signal":tenant,"runtime_test_status":"NOT_TESTED_BY_STATIC_AUDIT",
                         "review_status":"MANUAL_REVIEW_REQUIRED"})
rows.sort(key=lambda r:(r["path"],r["method"],r["module"]))
OUT.parent.mkdir(parents=True,exist_ok=True)
with OUT.open("w",newline="",encoding="utf-8") as f:
    w=csv.DictWriter(f,fieldnames=list(rows[0]) if rows else []); w.writeheader(); w.writerows(rows)
print(f"Endpoint RBAC/tenant review rows: {len(rows)}")
print(f"Role guarded: {sum(r['auth_classification']=='ROLE_GUARDED' for r in rows)}")
print(f"Authenticated: {sum(r['auth_classification']=='AUTHENTICATED' for r in rows)}")
print(f"Public flows: {sum(r['auth_classification'] in {'PUBLIC_AUTH_FLOW','PUBLIC_BEARER_LINK'} for r in rows)}")
print(f"Review required: {sum(r['auth_classification']=='REVIEW_REQUIRED' for r in rows)}")
print(f"No static org filter signal: {sum(r['tenant_scope_signal']=='NO_STATIC_ORG_FILTER_SIGNAL' for r in rows)}")
