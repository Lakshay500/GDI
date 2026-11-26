#!/usr/bin/env python3
"""Static FastAPI route inventory for release security review.

This is a source-level heuristic. It does not prove runtime authorization or
organisation isolation; each row must be confirmed with tests and review.
"""
from __future__ import annotations
import ast, csv, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
API_DIR = ROOT / "backend/app/api/v1"
OUT = ROOT / "docs/audit/api-security-register.csv"
METHODS = {"get", "post", "put", "patch", "delete", "options", "head"}

def literal(node):
    try: return ast.literal_eval(node)
    except Exception: return ast.unparse(node)

def router_prefix(tree):
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "router" for t in node.targets):
            if isinstance(node.value, ast.Call) and isinstance(node.value.func, ast.Name) and node.value.func.id == "APIRouter":
                for kw in node.value.keywords:
                    if kw.arg == "prefix": return str(literal(kw.value))
    return ""

rows=[]
for path in sorted(API_DIR.glob("*.py")):
    source=path.read_text(encoding="utf-8")
    tree=ast.parse(source)
    prefix=router_prefix(tree)
    for node in ast.walk(tree):
        if not isinstance(node,(ast.FunctionDef,ast.AsyncFunctionDef)): continue
        route_decorators=[]
        for dec in node.decorator_list:
            if isinstance(dec,ast.Call) and isinstance(dec.func,ast.Attribute) and dec.func.attr in METHODS:
                route_decorators.append(dec)
        if not route_decorators: continue
        fn=ast.get_source_segment(source,node) or ast.unparse(node)
        deps=[]
        for arg in node.args.args + node.args.kwonlyargs:
            if arg.annotation:
                annotation=ast.unparse(arg.annotation)
                if "Depends(" in annotation: deps.append(annotation)
            default=None
            args=node.args.args
            if arg in args and node.args.defaults:
                idx=args.index(arg)-(len(args)-len(node.args.defaults))
                if idx>=0: default=node.args.defaults[idx]
            if default is not None and "Depends(" in ast.unparse(default): deps.append(ast.unparse(default))
        dep_text=" | ".join(sorted(set(deps)))
        if "require_roles" in dep_text: auth="ROLE_GUARDED"
        elif "get_current_user" in dep_text or "oauth2_scheme" in dep_text: auth="AUTHENTICATED"
        elif path.name == "auth.py" and node.name in {"login","refresh"}: auth="PUBLIC_AUTH_FLOW"
        elif path.name == "public_verification.py" and node.name == "public_verify": auth="PUBLIC_BEARER_LINK"
        else: auth="REVIEW_REQUIRED_UNGUARDED"
        lower=fn.lower()
        tenant="EXPLICIT_ORGANISATION_FILTER" if ("organisation_id" in lower or "organization_id" in lower) else ("TENANT_HELPER" if re.search(r"_tenant_|_owned_|_issuer\(",lower) else "NOT_OBVIOUS_STATICALLY")
        for dec in route_decorators:
            method=dec.func.attr.upper()
            route=literal(dec.args[0]) if dec.args else ""
            full=(prefix.rstrip("/")+"/"+str(route).lstrip("/")) or "/"
            full=re.sub(r"/{2,}","/",full)
            rows.append({"method":method,"path":full,"module":path.name,"handler":node.name,
                         "auth_classification":auth,"dependency":dep_text or "NONE",
                         "tenant_scope_static_signal":tenant,
                         "review_status":"STATIC_REVIEW_REQUIRED"})
rows.sort(key=lambda r:(r['path'],r['method'],r['module']))
OUT.parent.mkdir(parents=True,exist_ok=True)
with OUT.open('w',newline='',encoding='utf-8') as f:
    writer=csv.DictWriter(f,fieldnames=list(rows[0]) if rows else [])
    writer.writeheader(); writer.writerows(rows)
print(f"API routes inventoried: {len(rows)}")
print(f"Role guarded: {sum(r['auth_classification']=='ROLE_GUARDED' for r in rows)}")
print(f"Authenticated: {sum(r['auth_classification']=='AUTHENTICATED' for r in rows)}")
print(f"Public auth flows: {sum(r['auth_classification']=='PUBLIC_AUTH_FLOW' for r in rows)}")
print(f"Public bearer-link routes: {sum(r['auth_classification']=='PUBLIC_BEARER_LINK' for r in rows)}")
print(f"Unclassified/unguarded: {sum(r['auth_classification']=='REVIEW_REQUIRED_UNGUARDED' for r in rows)}")
print(f"Register: {OUT.relative_to(ROOT)}")
if any(r['auth_classification']=='REVIEW_REQUIRED_UNGUARDED' for r in rows): sys.exit(2)
