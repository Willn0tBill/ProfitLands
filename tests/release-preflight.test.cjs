'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');

test('worker health uses an explicit version compatible with rollback preflight',()=>{
 const source=fs.readFileSync(path.join(root,'cloudflare/src/index.mjs'),'utf8');
 assert.match(source,/const API_VERSION=\d+;/);
 assert.match(source,/version:API_VERSION,catalog:/);
});

test('PowerShell deployment rejects newer live API before D1 schema or Worker writes',()=>{
 const script=fs.readFileSync(path.join(root,'cloudflare/deploy-free-world1.ps1'),'utf8');
 const probe=script.indexOf("Invoke-RestMethod -Uri ($workerUrl+'/health')");
 const guard=script.indexOf('if($liveVersion -gt $localVersion)');
 const schema=script.indexOf('d1 execute $database --remote');
 const deploy=script.indexOf('deploy --config $config');
 assert.ok(probe>=0&&guard>probe&&schema>guard&&deploy>guard,
  'live version must be checked before touching the database or deployment');
 assert.match(script,/Refusing Worker API rollback/);
 assert.match(script,/Deployment stopped before any D1 changes/);
});

test('CI covers all PR changes and checks all tracked JavaScript',()=>{
 const script=fs.readFileSync(path.join(root,'.github/workflows/economy-tests.yml'),'utf8');
 assert.match(script,/  pull_request:\s*\n/);
 assert.match(script,/  push:\s*\n    branches: \[main\]/);
 assert.doesNotMatch(script,/    paths:/);
 assert.match(script,/git ls-files -z -- '\*\.js' '\*\.cjs' '\*\.mjs'/);
});
