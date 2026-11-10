// Run: node tests/fitme.test.js   (serves ./ on a local port, drives it with Playwright)
const {chromium}=require('playwright');const http=require('http');const fs=require('fs');const path=require('path');
const ROOT=path.join(__dirname,'..');
const MIME={'.html':'text/html','.js':'text/javascript','.png':'image/png','.webmanifest':'application/manifest+json'};
const srv=http.createServer((q,r)=>{let f=path.join(ROOT,q.url.split('?')[0]);if(f.endsWith('/'))f+='index.html';
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end()}r.writeHead(200,{'content-type':MIME[path.extname(f)]||'application/octet-stream'});r.end(d)})});
const results=[];let page,ctx,errs;
const iso=d=>{const x=new Date(d);x.setMinutes(x.getMinutes()-x.getTimezoneOffset());return x.toISOString().slice(0,10)};
const ago=n=>{const d=new Date();d.setDate(d.getDate()-n);return iso(d)};
const eq=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`${m||'eq'}: got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`)};
const ok=(c,m)=>{if(!c)throw new Error('assert: '+m)};
const text=()=>page.evaluate(()=>document.body.innerText);
const store=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('fitme:v1')));
const tab=async t=>{await page.click(`nav [data-tab=${t}]`)};
async function fresh(url){ctx=await browser.newContext({viewport:{width:390,height:844}});page=await ctx.newPage();errs=[];
  page.on('pageerror',e=>errs.push(e.message));page.on('console',m=>m.type()==='error'&&errs.push(m.text()));
  await page.goto(url||base+'/index.html')}
let browser,base;
async function T(name,fn){try{await fresh();await fn();ok(!errs.length,'console errors: '+errs.join('|'));results.push([name,true])}catch(e){results.push([name,false,e.message.split('\n')[0]])}await ctx.close()}
const seed=fn=>page.evaluate(fn).then(()=>page.reload());

(async()=>{
await new Promise(r=>srv.listen(0,r));base='http://localhost:'+srv.address().port;browser=await chromium.launch();

await T('loads with 5 tabs and Today view',async()=>{eq(await page.locator('nav button').count(),5);ok((await text()).includes('Steps'),'Steps ring')});
await T('steps: save, ring percent, +1000 helper',async()=>{
  await page.click('[data-act=sheet-steps]');await page.click('[data-add="1000"]');await page.click('[data-add="500"]');await page.click('[data-savest]');
  const t=await text();ok(t.includes('1,500'),'1,500 shown');ok(t.includes('19%'),'19% of 8000');eq((await store()).profiles[(await store()).active].days[iso(new Date())].steps,1500)});
await T('water: quick add, subtract floors at 0, set total sheet',async()=>{
  await page.click('[data-water="750"]');await page.click('[data-water="-250"]');ok((await text()).includes('0.5 L'),'0.5 L');
  for(let i=0;i<3;i++)await page.click('[data-water="-250"]');ok(!(await text()).includes('-0.')&&(await text()).includes('0 L'),'floor 0');
  await page.click('[data-act=sheet-water]');await page.fill('#wa','1800');await page.click('[data-savewa]');ok((await text()).includes('1.8 L'),'1.8 L')});
await T('weight: save and clear',async()=>{
  await page.fill('#wt','72.4');await page.click('[data-act=saveweight]');ok(await page.inputValue('#wt')==='72.4','kept');
  await page.fill('#wt','');await page.click('[data-act=saveweight]');ok(await page.inputValue('#wt')==='','cleared')});
await T('workout: strength with sets saves + summary + recent chip',async()=>{
  await tab('workout');await page.click('[data-act=newworkout]');await page.fill('#w-name','Bench press');
  await page.fill('[data-sr="0"]','10');await page.fill('[data-sk="0"]','60');await page.click('[data-addset]');
  await page.fill('[data-sr="1"]','8');await page.fill('[data-sk="1"]','65');await page.fill('#w-mins','35');await page.click('[data-savew]');
  const t=await text();ok(t.includes('Bench press')&&t.includes('10×60, 8×65')&&t.includes('35 min'),'row text: '+t.slice(0,200));
  ok(await page.locator('[data-recent="Bench press"]').count()===1,'recent chip')});
await T('workout: cardio hides sets, validation blocks empty',async()=>{
  await tab('workout');await page.click('[data-act=newworkout]');await page.click('[data-wt=Cardio]');eq(await page.locator('[data-sr]').count(),0,'no sets');
  await page.click('[data-savew]');ok(await page.locator('#sheet').count()===1,'sheet stays open on empty name');
  await page.fill('#w-name','Run');await page.click('[data-savew]');ok(await page.locator('#sheet').count()===1,'needs duration');
  await page.fill('#w-mins','30');await page.click('[data-savew]');ok((await text()).includes('Run'),'saved')});
await T('workout: delete entry and recent chip prefill',async()=>{
  await tab('workout');await page.click('[data-act=newworkout]');await page.fill('#w-name','Squat');await page.fill('[data-sr="0"]','5');await page.click('[data-savew]');
  await page.click('[data-delw]');eq(await page.locator('[data-delw]').count(),0,'entry removed');
  await page.click('[data-recent="Squat"]');eq(await page.inputValue('#w-name'),'Squat')});
await T('food: macros auto-calc calories (4/4/9)',async()=>{
  await tab('food');await page.click('[data-act=newmeal]');await page.fill('#m-name','Chicken rice');await page.fill('#m-p','40');await page.fill('#m-c','60');await page.fill('#m-f','10');await page.click('[data-savem]');
  const t=await text();ok(t.includes('490'),'40*4+60*4+10*9=490');ok(t.includes('Chicken rice'),'name')});
await T('food: explicit calories, meal chip, delete, validation',async()=>{
  await tab('food');await page.click('[data-act=newmeal]');await page.click('[data-savem]');ok(await page.locator('#sheet').count()===1,'blocked');
  await page.fill('#m-name','Apple');await page.click('[data-savem]');ok(await page.locator('#sheet').count()===1,'needs calories');
  await page.click('[data-meal=Snack]');await page.fill('#m-cal','95');await page.click('[data-savem]');
  ok((await text()).includes('Snack')&&(await text()).includes('Apple'),'in Snack');
  await page.click('[data-delm]');ok(!(await text()).includes('Apple'),'deleted')});
await T('food: recent chip fills form',async()=>{
  await tab('food');await page.click('[data-act=newmeal]');await page.fill('#m-name','Oats');await page.fill('#m-cal','300');await page.click('[data-savem]');
  await page.click('[data-act=newmeal]');await page.click('[data-fill="0"]');eq(await page.inputValue('#m-cal'),'300')});
await T('today dashboard aggregates calories + workout minutes',async()=>{
  await tab('food');await page.click('[data-act=newmeal]');await page.fill('#m-name','X');await page.fill('#m-cal','500');await page.click('[data-savem]');
  await tab('workout');await page.click('[data-act=newworkout]');await page.fill('#w-name','Y');await page.click('[data-wt=Yoga]');await page.fill('#w-mins','45');await page.click('[data-savew]');
  await tab('today');const t=await text();ok(t.includes('500')&&t.includes('1,500 left'),'cal left');ok(t.includes('45 min')&&t.includes('150%'),'workout 150%')});
await T('day navigation: prev/next, data isolated, next disabled today',async()=>{
  ok(await page.locator('[data-act=next]').isDisabled(),'next disabled');await page.click('[data-water="500"]');
  await page.click('[data-act=prev]');ok((await text()).includes('Yesterday'),'Yesterday');ok((await text()).includes('0 L'),'yesterday empty');
  await page.click('[data-water="250"]');await page.click('[data-act=next]');ok((await text()).includes('0.5 L'),'today kept');
  const s=await store();eq(s.profiles[s.active].days[ago(1)].water,250)});
await T('progress: stats from seeded week are correct',async()=>{
  await seed(()=>{const p=S.profiles[S.active];const iso=d=>{const x=new Date(d);x.setMinutes(x.getMinutes()-x.getTimezoneOffset());return x.toISOString().slice(0,10)};
    for(let i=0;i<7;i++){const d=new Date();d.setDate(d.getDate()-i);p.days[iso(d)]={steps:i<3?10000:4000,water:2000,weight:80-i*0.5,workouts:i%2?[]:[{id:'w'+i,name:'Run',type:'Cardio',mins:30,sets:[]}],meals:[{id:'m'+i,name:'f',meal:'Lunch',cal:2000,p:100,c:200,f:50}]}}
    save()});
  await tab('progress');const t=(await text()).replace(/\s+/g,' ');
  ok(t.includes('7 day streak'),'streak 7: '+t.slice(0,160));ok(t.includes('4/7 workout days'),'workout days 4/7');ok(t.includes('3/7 step goals hit'),'steps hit 3/7');
  ok(t.includes('6,571 avg steps'),'avg steps 6857');ok(t.includes('2,000 avg kcal'),'avg kcal');ok(t.includes('+3.0 kg change'),'kg change +3.0 (oldest 77 -> newest 80)');
  eq(await page.locator('svg.chart').count(),5,'5 charts')});
await T('progress: 14 and 30 day ranges render, no errors',async()=>{
  await tab('progress');for(const r of [14,30,7]){await page.click(`[data-range="${r}"]`);ok(await page.locator(`[data-range="${r}"].on`).count()===1,'seg '+r);ok(await page.locator('svg.chart').count()===4,'charts '+r)}});
await T('progress: empty state shows hint, streak 0',async()=>{await tab('progress');const t=await text();ok(t.includes('Start logging'),'hint');ok(t.replace(/\s+/g,' ').includes('0 day streak'),'0 streak')});
await T('goals: edit persists and changes ring math; invalid rejected',async()=>{
  await tab('more');await page.fill('[data-goal=steps]','4000');await page.dispatchEvent('[data-goal=steps]','change');
  await page.fill('[data-goal=cal]','-5');await page.dispatchEvent('[data-goal=cal]','change');eq(await page.inputValue('[data-goal=cal]'),'2000','reverted');
  await tab('today');await page.click('[data-act=sheet-steps]');await page.fill('#st','2000');await page.click('[data-savest]');ok((await text()).includes('50%'),'50%')});
await T('profiles: add, isolated data, rename, switch, delete',async()=>{
  await page.click('[data-water="500"]');await tab('more');await page.click('[data-act=addprofile]');await page.fill('#dlg-in','Wife');await page.click('[data-ok]');
  ok((await text()).includes('Wife'),'created');await tab('today');ok((await text()).includes('0 L')&&(await text()).includes('Wife ▾'),'wife empty');
  await tab('more');await page.click('[data-switch]:has-text("Me")');await tab('today');ok((await text()).includes('0.5 L'),'me data intact');
  await tab('more');await page.click('[data-ren]');await page.fill('#dlg-in','Sandeep');await page.click('[data-ok]');ok((await text()).includes('Sandeep'),'renamed');
  await page.click('[data-delp]:near(:text("Wife"))');await page.click('[data-ok]');ok(!(await text()).includes('Wife'),'wife deleted');eq(Object.keys((await store()).profiles).length,1)});
await T('profile dialog: cancel and empty name do nothing',async()=>{
  await tab('more');await page.click('[data-act=addprofile]');await page.click('[data-ok]');ok(await page.locator('#dlg-in').count()===1,'empty blocked');await page.click('[data-x]');eq(await page.evaluate(()=>Object.keys(S.profiles).length),1)});
await T('theme: dark/light/auto toggles attribute and persists',async()=>{
  await tab('more');await page.click('[data-theme=dark]');eq(await page.evaluate(()=>document.documentElement.dataset.theme),'dark');
  await page.reload();eq(await page.evaluate(()=>document.documentElement.dataset.theme),'dark','persist');
  await tab('more');await page.click('[data-theme=auto]');eq(await page.evaluate(()=>document.documentElement.dataset.theme),undefined)});
await T('persistence: data survives reload',async()=>{
  await page.click('[data-water="750"]');await page.reload();ok((await text()).includes('0.75 L'),'0.75 L')});
await T('backup: export downloads JSON, import restores',async()=>{
  await page.click('[data-water="500"]');await tab('more');
  const [dl]=await Promise.all([page.waitForEvent('download'),page.click('[data-act=export]')]);
  const f=await dl.path();const json=fs.readFileSync(f,'utf8');ok(JSON.parse(json).profiles,'valid json');
  await tab('today');await page.click('[data-water="-250"]');await tab('more');await page.click('[data-act=resetday]');await page.click('[data-ok]');
  await page.setInputFiles('#file',{name:'b.json',mimeType:'application/json',buffer:Buffer.from(json)});await page.click('[data-ok]');
  await tab('today');ok((await text()).includes('0.5 L'),'restored 0.5 L');
  await tab('more');await page.setInputFiles('#file',{name:'bad.json',mimeType:'application/json',buffer:Buffer.from('nope')});await page.waitForTimeout(150);ok((await text()).includes('Invalid backup'),'bad file rejected')});
await T('clear day removes only that day',async()=>{
  await page.click('[data-water="500"]');await page.click('[data-act=prev]');await page.click('[data-water="250"]');await tab('more');await page.click('[data-act=resetday]');await page.click('[data-ok]');
  await tab('today');ok((await text()).includes('0 L'),'cleared');await page.click('[data-act=next]');ok((await text()).includes('0.5 L'),'today untouched')});
await T('XSS: names are escaped',async()=>{
  await tab('workout');await page.click('[data-act=newworkout]');await page.fill('#w-name','<img src=x onerror=window.__x=1>');await page.fill('#w-mins','5');await page.click('[data-savew]');
  eq(await page.evaluate(()=>window.__x),undefined);ok((await text()).includes('<img'),'shown as text')});
await T('corrupt localStorage falls back to fresh state',async()=>{
  await page.evaluate(()=>localStorage.setItem('fitme:v1','{broken'));await page.reload();ok((await text()).includes('Steps'),'renders')});
await T('no horizontal overflow at 320px on every tab',async()=>{
  await page.setViewportSize({width:320,height:640});for(const t of ['today','workout','food','progress','more']){await tab(t);
    const o=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);ok(o<=0,t+' overflows by '+o)}});
await T('PWA: manifest valid, icons + sw served, sw registers',async()=>{
  const m=await (await ctx.request.get(base+'/manifest.webmanifest')).json();ok(m.name==='FitMe'&&m.display==='standalone','manifest');
  for(const i of m.icons){eq((await ctx.request.get(base+'/'+i.src)).status(),200,i.src)}
  eq((await ctx.request.get(base+'/sw.js')).status(),200);
  const reg=await page.evaluate(async()=>{await navigator.serviceWorker.ready;return (await caches.keys()).length>0});ok(reg,'cache created')});
await T('offline: app still loads after first visit',async()=>{
  await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await ctx.setOffline(true);await page.reload();ok((await text()).includes('Steps'),'offline render');await ctx.setOffline(false)});

await browser.close();srv.close();
let bad=0;for(const [n,p,m] of results){console.log((p?'PASS':'FAIL')+'  '+n+(p?'':'\n        → '+m));if(!p)bad++}
console.log(`\n${results.length-bad}/${results.length} passed`);process.exit(bad?1:0);
})();
