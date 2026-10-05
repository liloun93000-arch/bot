#!/bin/sh
cd "$(dirname "$0")"
node build_demo.js >/dev/null && node -e "new Function(require('fs').readFileSync('bundle.js','utf8'))" && python3 - <<'PY'
d='/tmp/claude-0/-home-claude/f32c9d5d-51dc-59e6-9c7d-a5ae0e8f5c09/scratchpad/intro/'
t=open(d+'demo.tpl.html',encoding='utf-8').read()
t=t.replace('/*THREE*/',open(d+'three.iife.min.js',encoding='utf-8').read()).replace('/*INTROCSS*/',open(d+'intro.css',encoding='utf-8').read()).replace('/*BUNDLE*/',open(d+'bundle.js',encoding='utf-8').read())
open(d+'demo.html','w',encoding='utf-8').write(t)
PY
