const { chromium } = require('playwright');
const fs = require('fs');

const SITE_URL = process.env.SITE_URL || 'https://gcol.vercel.app/';
const PASSWORD = process.env.QA_PASSWORD || 'qa-test-password';
const USERS = [
  process.env.QA_USER_A || `QA_CHAOS_A_${Date.now()}`,
  process.env.QA_USER_B || `QA_CHAOS_B_${Date.now()}`,
  process.env.QA_USER_C || `QA_CHAOS_C_${Date.now()}`
];
const ROOM_NAME = `QA-CHAOS-${Date.now()}`;
const OUT = process.env.QA_OUTPUT || 'qa-results';
fs.mkdirSync(OUT, { recursive: true });
const results = [];
function record(name, status, details = {}) { results.push({ name, status, details, at: new Date().toISOString() }); console.log(`[${status}] ${name}${Object.keys(details).length ? ` ${JSON.stringify(details)}` : ''}`); }
async function visibleButtonContaining(page, text) { const bs = page.locator('button:visible'); for (let i=0;i<await bs.count();i++){const b=bs.nth(i); const t=((await b.innerText().catch(()=>''))||'').replace(/\s+/g,' ').trim(); if(t.toLowerCase().includes(text.toLowerCase())) return b;} return null; }
async function waitVisible(page, selector, timeout=15000) { await page.waitForFunction(sel=>{const e=document.querySelector(sel);if(!e)return false;const s=getComputedStyle(e),r=e.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;}, selector, {timeout}); }
async function login(page, username) { await page.goto(SITE_URL,{waitUntil:'domcontentloaded',timeout:60000}); await page.waitForTimeout(500); const mode=await visibleButtonContaining(page,'Utilisateur'); if(mode){await mode.click();await page.waitForTimeout(150);} const input=page.locator('#userUsernameInput, #usernameInput').first(); await input.waitFor({state:'visible',timeout:15000}); await input.fill(username); const pass=page.locator('#passwordInput').first(); if(await pass.isVisible().catch(()=>false)) await pass.fill(PASSWORD); const connect=await visibleButtonContaining(page,'Se connecter'); if(!connect) throw new Error('Bouton Se connecter introuvable'); await connect.click(); await waitVisible(page,'#lobbyScreen',30000); }
async function joinRoom(page){const card=page.locator('#roomList .room-card').filter({hasText:ROOM_NAME}).first(); await card.waitFor({state:'visible',timeout:20000}); await card.locator('.join-room-btn').click(); await waitVisible(page,'#roomScreen',20000);}
async function roomState(page){return page.evaluate(()=>{const cards=[...document.querySelectorAll('#videoGrid .video-card')]; const peers=window.__qaPeerConnections||[]; return {cards:cards.length,names:cards.map(c=>(c.innerText||'').replace(/\s+/g,' ').trim()),activeTracks:cards.flatMap(c=>[...c.querySelectorAll('video')].flatMap(v=>v.srcObject?.getTracks()||[])).filter(t=>t.readyState!=='ended').length,peers:peers.map(x=>({connectionState:x.pc.connectionState,ice:x.pc.iceConnectionState,signaling:x.pc.signalingState}))};});}
async function installInstrumentation(context){await context.addInitScript(()=>{const Original=window.RTCPeerConnection;if(!Original)return;const list=[];window.__qaPeerConnections=list;window.RTCPeerConnection=new Proxy(Original,{construct(target,args,newTarget){const pc=Reflect.construct(target,args,newTarget);list.push({pc,createdAt:Date.now()});return pc;}});});}
async function createRoom(page){const b=await visibleButtonContaining(page,'Créer un salon');if(!b)throw new Error('Bouton Créer un salon introuvable');const d=page.waitForEvent('dialog');await b.click();const dialog=await d;await dialog.accept(ROOM_NAME);await page.waitForFunction(n=>(document.querySelector('#roomList')?.innerText||'').includes(n),ROOM_NAME,{timeout:20000});}
async function sendChat(page,text){const input=page.locator('#roomChatInput');await input.fill(text);await page.locator('.room-chat .chat-send').click();}
async function hasUser(page,user){return page.evaluate(u=>[...document.querySelectorAll('#videoGrid .video-card')].some(c=>(c.innerText||'').includes(u)),user);}

(async()=>{
 const browser=await chromium.launch({headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--allow-http-screen-capture']});
 const contexts=await Promise.all(USERS.map(()=>browser.newContext({permissions:['camera','microphone']})));
 await Promise.all(contexts.map(installInstrumentation));
 const pages=await Promise.all(contexts.map(c=>c.newPage()));
 const errors=[]; pages.forEach((p,i)=>p.on('pageerror',e=>errors.push({user:USERS[i],error:e.message})));
 try{
  console.log(`\n===== CHAOS QA / ${USERS.join(' + ')} =====`);
  await Promise.all(pages.map((p,i)=>login(p,USERS[i]))); record('Chaos / 3 connexions simultanées','PASS');
  await createRoom(pages[0]); await Promise.all(pages.slice(1).map(p=>p.waitForFunction(n=>(document.querySelector('#roomList')?.innerText||'').includes(n),ROOM_NAME,{timeout:20000}))); record('Chaos / création + synchronisation du salon','PASS');
  await Promise.all(pages.map(joinRoom));
  await Promise.all(pages.map(p=>p.waitForFunction(()=>document.querySelectorAll('#videoGrid .video-card').length>=3,{timeout:30000})));
  record('Chaos / 3 joins simultanés','PASS',await roomState(pages[0]));

  await Promise.all(pages.map((p,i)=>sendChat(p,`QA_CHAOS_CHAT_${i}`)));
  await Promise.all(pages.map(p=>p.waitForFunction(()=>['QA_CHAOS_CHAT_0','QA_CHAOS_CHAT_1','QA_CHAOS_CHAT_2'].every(x=>(document.querySelector('#roomChatMessages')?.innerText||'').includes(x)),{timeout:20000})));
  record('Chaos / chats simultanés A+B+C','PASS');

  for(let round=1;round<=3;round++){
   await Promise.all(pages.slice(0,2).map(async p=>{await p.locator('#microBtn').click();await p.locator('#cameraBtn').click();await p.waitForTimeout(120);await p.locator('#microBtn').click();await p.locator('#cameraBtn').click();}));
   record(`Chaos / toggles micro-caméra round ${round}`,'PASS');
  }

  await pages[1].reload({waitUntil:'domcontentloaded',timeout:60000}); await waitVisible(pages[1],'#lobbyScreen',30000); await pages[1].waitForFunction(n=>(document.querySelector('#roomList')?.innerText||'').includes(n),ROOM_NAME,{timeout:20000}); record('Chaos / refresh B en pleine session','PASS');
  await joinRoom(pages[1]); await pages[1].waitForFunction(()=>document.querySelectorAll('#videoGrid .video-card').length>=3,{timeout:30000}); record('Chaos / B réintègre après refresh','PASS');

  await pages[2].close(); await Promise.all([0,1].map(i=>pages[i].waitForFunction(u=>!([...document.querySelectorAll('#videoGrid .video-card')].some(c=>(c.innerText||'').includes(u))),USERS[2],{timeout:20000}))); record('Chaos / fermeture brutale C propagée','PASS');

  await pages[0].locator('.leave-btn').click(); await waitVisible(pages[0],'#lobbyScreen',10000); await pages[1].waitForFunction(u=>![...document.querySelectorAll('#videoGrid .video-card')].some(c=>(c.innerText||'').includes(u)),USERS[0],{timeout:15000}); record('Chaos / départ normal A propagé','PASS');

  for(let cycle=1;cycle<=2;cycle++){
   await joinRoom(pages[0]); await pages[0].waitForFunction(()=>document.querySelectorAll('#videoGrid .video-card').length>=2,{timeout:30000});
   await pages[0].locator('.leave-btn').click(); await waitVisible(pages[0],'#lobbyScreen',10000);
   record(`Chaos / cycle join-leave ${cycle}`,'PASS');
  }

  await joinRoom(pages[0]); await pages[0].waitForFunction(()=>document.querySelectorAll('#videoGrid .video-card').length>=2,{timeout:30000});
  const diagnostics=await Promise.all(pages.slice(0,2).map(roomState));
  const connected=diagnostics.some(s=>s.peers.some(p=>p.connectionState==='connected'||p.ice==='connected'||p.ice==='completed'));
  record('Chaos / état WebRTC après stress',connected?'PASS':'WARN',{diagnostics});

  const mobile=await contexts[0].newPage({viewport:{width:390,height:844}}); const mobileErrors=[]; mobile.on('pageerror',e=>mobileErrors.push(e.message)); await mobile.goto(SITE_URL,{waitUntil:'domcontentloaded',timeout:60000}); await mobile.waitForTimeout(500); const mode=await visibleButtonContaining(mobile,'Utilisateur'); if(mode){await mode.click();await mobile.waitForTimeout(150);} await mobile.locator('#userUsernameInput, #usernameInput').first().fill(`QA_CHAOS_M_${Date.now()}`); const pass=mobile.locator('#passwordInput').first();if(await pass.isVisible().catch(()=>false))await pass.fill(PASSWORD);await (await visibleButtonContaining(mobile,'Se connecter')).click();await waitVisible(mobile,'#lobbyScreen',30000);await mobile.waitForFunction(n=>(document.querySelector('#roomList')?.innerText||'').includes(n),ROOM_NAME,{timeout:20000});await joinRoom(mobile);await waitVisible(mobile,'#roomScreen',15000);const ms=await roomState(mobile);record('Chaos / mobile pendant session',ms.cards>=3&&mobileErrors.length===0?'PASS':'FAIL',{viewport:[390,844],state:ms,errors:mobileErrors});await mobile.close();

  await pages[0].locator('.leave-btn').click().catch(()=>{}); await pages[1].locator('.leave-btn').click().catch(()=>{});
 }catch(error){record('Chaos / runner','FAIL',{error:error.stack||error.message});}
 finally{
  record('Chaos / erreurs JavaScript',errors.length===0?'PASS':'FAIL',{count:errors.length,errors:errors.slice(0,20)});
  const finalStates=await Promise.all(pages.slice(0,2).map(p=>roomState(p).catch(()=>({closed:true}))));
  fs.writeFileSync(`${OUT}/report-chaos.json`,JSON.stringify({site:SITE_URL,users:USERS,room:ROOM_NAME,generatedAt:new Date().toISOString(),results,finalStates},null,2));
  await browser.close();
 }
 const failed=results.filter(r=>r.status==='FAIL'); console.log(`\nChaos QA terminé : ${results.length} contrôles, ${failed.length} échec(s).`); process.exitCode=failed.length?1:0;
})();
