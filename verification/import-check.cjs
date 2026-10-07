const {chromium}=require('playwright-core');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),dir=path.join(__dirname,'fixtures');
(async()=>{
 const browser=await chromium.launch(require('./serve.cjs').launchOptions());
 try{
 const page=await browser.newPage({viewport:{width:1200,height:850}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const served=await require('./serve.cjs')();process.on('exit',served.close);await page.goto(served.origin);await page.waitForFunction(()=>window.viewerReady);
 const results=[];
 for(const ext of ['glb','gltf','fbx','obj','ply','stl','dae','3mf','3ds']){
  const name='triangle.'+ext;
  await page.locator('#files').setInputFiles([path.join(dir,name),...(ext==='gltf'?[path.join(dir,'triangle.bin')]:[])]);
  await page.waitForFunction(()=>!document.querySelector('#open').disabled);
  assert.equal(await page.locator('#filename').textContent(),name,await page.locator('#status').textContent());
  assert.match(await page.locator('#stats').textContent(),/^1 triangles/);
  assert.equal(await page.locator('#status').textContent(),'');results.push(ext);
 }
 await page.locator('#grid').uncheck();
 const render=async()=>{await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));return page.locator('canvas').evaluate(c=>(window.mobiusDebug.render(),c.toDataURL()));};
 const load=async files=>{await page.locator('#files').setInputFiles(files);await page.waitForFunction(()=>!document.querySelector('#open').disabled);await page.locator('[data-view=front]').click();};
 await load(['textured.obj','textured.mtl','checker.png'].map(n=>path.join(dir,n)));
 assert.equal(await page.locator('#status').textContent(),'');
 const on=await render();await page.locator('#textures').uncheck();const off=await render();assert.notEqual(on,off);
 await page.locator('#textures').check();assert.equal(await render(),on);
 await page.screenshot({path:path.join(__dirname,'textures-on.png')});
 await page.locator('#textures').uncheck();await page.screenshot({path:path.join(__dirname,'textures-off.png')});
 const obj=await fs.readFile(path.join(dir,'textured.obj'));
 await load([{name:'textured.obj',mimeType:'text/plain',buffer:obj},{name:'textured.mtl',mimeType:'text/plain',buffer:Buffer.from('newmtl Painted\nKd 0.7 0.8 0.9\n')}]);
 assert.equal(await render(),off,'Texture-off preserves original base material color');
 const colored=Buffer.from('v -1 0 0 1 0 0\nv 1 0 0 0 1 0\nv 0 2 0 0 0 1\nf 1 2 3\n');
 await load([{name:'colored.obj',mimeType:'text/plain',buffer:colored}]);const vertexOff=await render();await page.locator('#textures').check();assert.equal(await render(),vertexOff);
 await page.locator('#mode').selectOption('raw');assert.equal(await page.locator('#textures').isDisabled(),true);
 assert.deepEqual(errors,[]);
 const report={passed:true,formats:results,texturePixelsChange:true,texturePixelsRestore:true,baseColorPreserved:true,vertexColorsPreserved:true,errors};
 await fs.writeFile(path.join(__dirname,'import-results.json'),JSON.stringify(report,null,2));console.log(report);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
