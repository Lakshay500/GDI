#!/usr/bin/env node
/* Static JSX accessibility audit. This is a source-level aid, not a WCAG certification. */
const fs = require('fs');
const path = require('path');
const ts = require(process.argv[2]);
const root = path.resolve(__dirname, '..');
const src = path.join(root, 'frontend', 'src');
const files = [];
function walk(dir) { for (const entry of fs.readdirSync(dir, {withFileTypes:true})) { const p=path.join(dir,entry.name); if(entry.isDirectory()) walk(p); else if(/\.(tsx|jsx)$/.test(entry.name)) files.push(p); } }
walk(src);
const issues=[]; const counts={files:files.length,buttons:0,links:0,form_controls:0,images:0,aria_attributes:0};
function attr(node,name){return node.attributes.properties.find(a=>ts.isJsxAttribute(a)&&a.name.getText()==name);}
function value(node,name){const a=attr(node,name); if(!a||!a.initializer)return null; if(ts.isStringLiteral(a.initializer))return a.initializer.text; return a.initializer.getText();}
function hasAttr(node,name){return !!attr(node,name);}
function hasLabelAncestor(node){let parent=node.parent; while(parent){if(ts.isJsxElement(parent)&&parent.openingElement.tagName.getText()==='label')return true; parent=parent.parent;} return false;}
for(const file of files){
 const text=fs.readFileSync(file,'utf8'); const sf=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const idsWithLabels=new Set();
 function collectLabels(n){ if(ts.isJsxElement(n)&&n.openingElement.tagName.getText()==='label'){const f=value(n.openingElement,'htmlFor');if(f)idsWithLabels.add(f);} ts.forEachChild(n,collectLabels); }
 collectLabels(sf);
 function visit(n){
  if(ts.isJsxSelfClosingElement(n)||ts.isJsxOpeningElement(n)){
   const tag=n.tagName.getText(); const line=sf.getLineAndCharacterOfPosition(n.getStart()).line+1;
   if(['button'].includes(tag)) counts.buttons++;
   if(['a'].includes(tag)) counts.links++;
   if(['input','select','textarea'].includes(tag)) counts.form_controls++;
   if(tag==='img') counts.images++;
   counts.aria_attributes+=n.attributes.properties.filter(a=>ts.isJsxAttribute(a)&&a.name.getText().startsWith('aria-')).length;
   const named=hasAttr(n,'aria-label')||hasAttr(n,'aria-labelledby')||hasAttr(n,'title');
   if(['input','select','textarea'].includes(tag)){
    const id=value(n,'id'); const type=value(n,'type');
    const hiddenInput=tag==='input'&&type==='hidden';
    if(!hiddenInput&&!named&&!hasLabelAncestor(n)&&!(id&&idsWithLabels.has(id))) issues.push({file:path.relative(root,file),line,element:tag,reason:'No explicit aria name/title or matching label htmlFor found; review nested-label and custom-control cases.'});
   }
   if(tag==='img'&&!hasAttr(n,'alt')) issues.push({file:path.relative(root,file),line,element:tag,reason:'Missing alt attribute.'});
   if(tag==='button'&&!named){
    const parent=n.parent;
    const hasChildren=ts.isJsxOpeningElement(n)?!!parent&&ts.isJsxElement(parent)&&parent.children.some(c=>ts.isJsxText(c)?c.text.trim().length>0:true):false;
    if(!hasChildren) issues.push({file:path.relative(root,file),line,element:tag,reason:'Button has no discernible text or explicit accessible name.'});
   }
  }
  ts.forEachChild(n,visit);
 }
 visit(sf);
}
const report={schema:'gdi-vs-frontend-accessibility-source-audit/v1',status:issues.length?'review_required':'passed',scope:'Static JSX source inspection only; nested label associations, dynamic names and rendered contrast/focus behaviour require manual/browser testing.',counts,issue_count:issues.length,issues};
console.log(JSON.stringify(report,null,2));
process.exitCode=issues.length?1:0;
