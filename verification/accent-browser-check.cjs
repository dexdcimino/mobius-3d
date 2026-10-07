const {chromium}=require('playwright-core');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
(async()=>{
 const {ACCENTS,gridPalette,luminance,contrast}=await import('../src/accent.js');
 const {Color}=await import('three');
 const browser=await chromium.launch(require('./serve.cjs').launchOptions());
 try {
  const page=await browser.newPage({viewport:{width:1200,height:850}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const served=await require('./serve.cjs')();process.on('exit',served.close);await page.goto(served.origin);await page.waitForFunction(()=>window.viewerReady);
  const settle=()=>page.evaluate(()=>new Promise(resolve=>{let n=30;const tick=()=>--n?requestAnimationFrame(tick):resolve();requestAnimationFrame(tick);}));
  await settle();
  const state=()=>page.evaluate(()=>({hex:document.querySelector('#color-hex').value,stored:localStorage.getItem('mobius-background'),accent:localStorage.getItem('mobius-accent'),canvas:(window.mobiusDebug.render(),document.querySelector('canvas').toDataURL())}));
  const opening=[];
  for(const hex of ['#0a1821','#ffffff','#88aaff']) {
   await page.locator('#background').click();await page.locator('#color-hex').fill(hex);await page.locator('#color-hex').press('Tab');await page.locator('#color-close').click();await settle();
   const before=await state(),screenshot=await page.screenshot({clip:{x:180,y:80,width:600,height:500}});
   await page.locator('#background').click();assert.deepEqual(await state(),before);
   assert.deepEqual(await page.screenshot({clip:{x:180,y:80,width:600,height:500}}),screenshot,'Opening does not dim the composited scene');
   assert.equal(await page.locator('dialog').evaluate(e=>getComputedStyle(e,'::backdrop').backgroundColor),'rgba(0, 0, 0, 0)');
   opening.push(hex);await page.locator('#color-close').click();
  }
  const rendered=[];
  const backgrounds=['#000000','#ffffff','#0a1821','#20232b','#444444','#808080','#bbbbbb','#ff0000','#00ff00','#0000ff',...ACCENTS.map(a=>a[1])];
  for(const [name,accent] of ACCENTS) {
   await page.locator(`[data-accent="${name}"]`).click();
   for(const hex of backgrounds) {
    await page.locator('#background').click();await page.locator('#color-hex').fill(hex);await page.locator('#color-hex').press('Tab');await page.locator('#color-close').click();
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const palette=gridPalette(hex,accent),expected=contrast(luminance(new Color(hex)),luminance(palette.major));
    assert.equal(await page.evaluate(()=>document.documentElement.style.getPropertyValue('--accent')),palette.effectiveHex);
    assert.equal(await page.locator('.accent-swatch[aria-pressed=true]').evaluate(e=>e.style.getPropertyValue('--swatch')),palette.effectiveHex);
    const result=await page.evaluate(()=>{
     window.mobiusDebug.render();const source=document.querySelector('canvas'),c=document.createElement('canvas');c.width=source.width;c.height=source.height;const ctx=c.getContext('2d');ctx.drawImage(source,0,0);const pixels=ctx.getImageData(0,0,c.width,c.height).data;
     const y=(r,g,b)=>[r,g,b].map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
     const bg=y(...pixels.slice(0,3));let max=1;for(let i=0;i<pixels.length;i+=4){const v=y(pixels[i],pixels[i+1],pixels[i+2]);max=Math.max(max,(Math.max(bg,v)+.05)/(Math.min(bg,v)+.05));}return max;
    });
    assert.ok(result>=2.7&&Math.abs(result-expected)<.12,JSON.stringify({name,hex,result,expected}));
    rendered.push({name,background:hex,effective:palette.effectiveHex,contrast:result});
   }
   await page.reload();await page.waitForFunction(()=>window.viewerReady);
   assert.equal(await page.locator('#accent-name').textContent(),name);assert.equal(await page.locator('#color-hex').inputValue(),backgrounds.at(-1).toUpperCase());
   await page.locator('#grid').uncheck();await page.locator('#background').click();await page.locator('#color-reset').click();
   assert.equal(await page.locator('#color-hex').inputValue(),'#0A1821');assert.equal(await page.evaluate(()=>localStorage.getItem('mobius-background')),'#0a1821');
   assert.equal(await page.evaluate(()=>document.documentElement.style.getPropertyValue('--accent')),accent);assert.equal(await page.locator('#grid').isChecked(),false);
   await page.locator('#color-close').click();await page.locator('#grid').check();
  }
  await page.evaluate(()=>localStorage.setItem('mobius-background','#0b1b24'));await page.reload();await page.waitForFunction(()=>window.viewerReady);
  assert.equal(await page.locator('#color-hex').inputValue(),'#0A1821');assert.equal(await page.evaluate(()=>localStorage.getItem('mobius-background')),'#0a1821');
  await page.locator('[data-accent=Orange]').click();await page.screenshot({path:path.join(__dirname,'accent-grid-default.png')});
  await page.locator('#background').click();await page.locator('#color-hex').fill('#ffad66');await page.locator('#color-hex').press('Tab');await page.locator('#color-close').click();
  await page.screenshot({path:path.join(__dirname,'accent-grid-matching.png')});
  assert.deepEqual(errors,[]);
  const report={passed:true,oldDefault:'#0b1b24',newDefault:'#0a1821',openingChecks:opening,renderedCases:rendered.length,minimumRenderedContrast:Math.min(...rendered.map(r=>r.contrast)),sixAccentPersistenceAndReset:true,previousDefaultMigrated:true,rendered,errors};
  await fs.writeFile(path.join(__dirname,'accent-results.json'),JSON.stringify(report,null,2));console.log({...report,rendered:undefined});
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
