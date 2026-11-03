/* Build an isolated CrazyGames HTML5 upload; no changes to the normal site.
 * Run: node scripts/build-crazygames.cjs
 * Upload the CONTENTS of dist/crazygames as a zip through Developer Portal.
 */
'use strict';
const fs=require('node:fs');
const path=require('node:path');

function buildCrazyGames({root=path.resolve(__dirname,'..'),output=path.resolve(root,'dist/crazygames')}={}){
  const input=fs.readFileSync(path.join(root,'play','index.html'),'utf8');
  let html=input;
  // Dedicated marker: the same adapter can run in a local preview iframe.
  html=html.replace('</head>','  <meta name="profitlands-platform" content="crazygames">\n  <link rel="stylesheet" href="crazygames.css">\n  <link rel="stylesheet" href="crazygames-coach.css">\n</head>');
  // The first-session coach runs after the core workspace and never ships to
  // the regular website. It is optional and keeps its own UI-only preferences.
  html=html.replace('</body>','  <script src="crazygames-coach.js"></script>\n</body>');
  html=html.replace('<body class="pl-play-page">','<body class="pl-play-page pl-crazygames">');

  // CrazyGames accounts are automatic; email/password sign-in is not allowed.
  // Firebase is preserved intact on the main website and Steam builds.
  html=html.replace(/<script\s+src="https:\/\/www\.gstatic\.com\/firebasejs\/[^"]+"><\/script>\s*/g,'');
  html=html.replace(/<script\s+src="\.\.\/(?:firebase-config|firebase-auth|play-route)\.js[^"]*"><\/script>\s*/g,'');

  // No navigation to external games or out of the packaged game root.
  html=html.replace(/<a\b[^>]*href="(?:\.\.\/[^"]*|https?:\/\/[^"]*)"[^>]*>[\s\S]*?<\/a>/g,'');

  // Play page assets live alongside index.html in the zipped release.
  html=html.replace(/(href|src)="\.\.\/([^"]+)"/g,'$1="$2"');
  if(!html.includes('name="profitlands-platform"')||!/src="crazygames\.js"/.test(html))throw Error('Failed to build CrazyGames entry point');
  if(/src="\.\.\//.test(html)||/href="\.\.\//.test(html)||/www\.gstatic\.com\/firebasejs/.test(html))throw Error('Invalid external or parent dependency in game entry point');

  fs.rmSync(output,{recursive:true,force:true});
  fs.mkdirSync(output,{recursive:true});
  const excluded=new Set(['firebase-auth.js','firebase-config.js','play-route.js','landing.js']);
  for(const name of fs.readdirSync(root)){
    if(!/\.(?:js|css)$/.test(name)||excluded.has(name))continue;
    const source=path.join(root,name);
    if(fs.statSync(source).isFile())fs.copyFileSync(source,path.join(output,name));
  }
  fs.writeFileSync(path.join(output,'index.html'),html);
  const files=fs.readdirSync(output);
  const bytes=files.reduce((sum,name)=>sum+fs.statSync(path.join(output,name)).size,0);
  if(files.length>1500||bytes>50*1024*1024)throw Error('CrazyGames upload budget exceeded');
  return {output,fileCount:files.length,bytes};
}

if(require.main===module){
  const result=buildCrazyGames();
  process.stdout.write('CrazyGames build ready: '+result.output+' ('+result.fileCount+' files; '+result.bytes+' bytes)\n');
}
module.exports=buildCrazyGames;
