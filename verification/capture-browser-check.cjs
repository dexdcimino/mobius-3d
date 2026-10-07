const {chromium}=require('playwright-core');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
(async()=>{
 const browser=await chromium.launch(require('./serve.cjs').launchOptions());
 try {
  const page=await browser.newPage({viewport:{width:1200,height:850},acceptDownloads:true});
  const served=await require('./serve.cjs')();process.on('exit',served.close);await page.goto(served.origin);await page.waitForFunction(()=>window.viewerReady);
  await page.locator('#files').setInputFiles(path.join(__dirname,'fixtures','triangle.glb'));await page.waitForFunction(()=>!document.querySelector('#open').disabled);
  const settle=()=>page.evaluate(()=>new Promise(resolve=>{let n=100;const tick=()=>--n?requestAnimationFrame(tick):resolve();requestAnimationFrame(tick);}));
  const capture=async name=>{
   await settle();
   const downloadPromise=page.waitForEvent('download');
   const unchanged=await page.evaluate(()=>{const canvas=document.querySelector('canvas');window.mobiusDebug.render();const before=canvas.toDataURL();document.querySelector('#capture').click();window.mobiusDebug.render();return canvas.toDataURL()===before;});
   assert.equal(unchanged,true,'Capture preserves the live rendering');
   const download=await downloadPromise;const output=path.join(__dirname,name);await download.saveAs(output);return fs.readFile(output);
  };
  const views=[];
  for(const direction of ['front','iso']) {
   await page.locator(`[data-view=${direction}]`).click();
   // Deliberately pan and zoom away from composed framing.
   await page.mouse.move(400,400);await page.mouse.down({button:'right'});await page.mouse.move(485,430,{steps:5});await page.mouse.up({button:'right'});await page.mouse.wheel(0,-300);
   await page.locator('#grid').check();const withGrid=await capture(`capture-${direction}.png`);assert.equal(await page.locator('#grid').isChecked(),true);
   await page.locator('#grid').uncheck();const withoutGrid=await capture(`capture-${direction}-grid-off.png`);assert.deepEqual(withGrid,withoutGrid,'Capture excludes enabled grid');
   const stats=await page.evaluate(async src=>{
    const image=new Image();image.src=src;await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);const p=ctx.getImageData(0,0,c.width,c.height).data;
    let minX=c.width,minY=c.height,maxX=0,maxY=0,count=0;for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const i=(y*c.width+x)*4;if(Math.abs(p[i]-p[0])+Math.abs(p[i+1]-p[1])+Math.abs(p[i+2]-p[2])>15){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);count++;}}
    return {width:c.width,height:c.height,minX,minY,maxX,maxY,count};
   },'data:image/png;base64,'+withGrid.toString('base64'));
   assert.equal(stats.width,1200);assert.equal(stats.height,850);assert.ok(stats.count>10000);
   assert.ok(Math.abs((stats.minX+stats.maxX)/2-600)<90&&Math.abs((stats.minY+stats.maxY)/2-425)<80,JSON.stringify(stats));
   assert.ok(stats.minX>35&&stats.maxX<1165&&stats.minY>35&&stats.maxY<815,JSON.stringify(stats));
   assert.equal(await page.locator('#controls-panel').isVisible(),true);views.push({direction,...stats});
  }
  assert.notDeepEqual(await fs.readFile(path.join(__dirname,'capture-front.png')),await fs.readFile(path.join(__dirname,'capture-iso.png')),'Viewing direction affects export');
  const report={passed:true,liveCanvasUnchanged:true,gridExcluded:true,uiExcluded:true,centeredDespitePanAndZoom:true,views};
  await fs.writeFile(path.join(__dirname,'capture-results.json'),JSON.stringify(report,null,2));console.log(report);
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
