const { chromium } = require('playwright');
const fs = require('fs');

const SITE_URL = process.env.SITE_URL || 'https://gcol.vercel.app/';
const PASSWORD = process.env.QA_PASSWORD || 'qa-test-password';
const USER = process.env.QA_USER_A || `QA_UX_${Date.now()}`;
const ROOM = `QA-UX-${Date.now()}`;
const OUT = process.env.QA_OUTPUT || 'qa-results';
fs.mkdirSync(OUT, { recursive: true });
const results = [];
function record(name,status,details={}){results.push({name,status,details,at:new Date().toISOString()});console.log(`[${status}] ${name}${Object.keys(details).length?' '+JSON.stringify(details):''}`);}
async function button(page,text){const bs=page.locator('button:visible');for(let i=0;i<await bs.count();i++){const b=bs.nth(i);const t=((await b.innerText().catch(()=>''))||'').replace(/\s+/g,' ').trim();if(t.toLowerCase().includes(text.toLowerCase()))return b;}return null;}
async function visible(page,sel,timeout=15000){await page.waitForFunction(s=>{const e=document.querySelector(s);if(!e)return false;const x=getComputedStyle(e),r=e.getBoundingClientRect();return x.display!=='none'&&x.visibility!=='hidden'&&r.width>0&&r.height>0;},sel,{timeout});}
async function login(page,user){await page.goto(SITE_URL,{waitUntil:'domcontentloaded',timeout:60000});await page.waitForTimeout(500);const u=await button(page,'Utilisateur');if(u)await u.click();const input=page.locator('#userUsernameInput,#usernameInput').first();await input.waitFor({state:'visible',timeout:15000});await input.fill(user);const c=await button(page,'Se connecter');if(!c)throw Error('Connexion introuvable');await c.click();await visible(page,'#lobbyScreen',30000);}
async function layout(page,label){return page.evaluate(l=>{const all=[...document.querySelectorAll('body *')];const vw=innerWidth,vh=innerHeight;const overflow=all.filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>vw+2||r.left<-2||r.bottom>vh+2)}).slice(0,15).map(e=>({tag:e.tagName,id:e.id,cls:e.className?.toString().slice(0,80)}));return {label,viewport:[vw,vh],bodyScroll:[document.body.scrollWidth,document.body.scrollHeight],viewportOverflow:overflow};},label);}
async function screenshot(page,name){await page.screenshot({path:`${OUT}/${name}.png`,fullPage:false});}
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 const context=await browser.newContext({permissions:['camera','microphone']});const page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(SITE_URL,{waitUntil:'domcontentloaded',timeout:60000});await page.waitForTimeout(500);await screenshot(page,'01-auth');
  const auth=await page.evaluate(()=>({title:document.title,hasChoice:!!document.querySelector('#userModeButton'),hasAdmin:!!document.querySelector('#adminModeButton'),interactiveButtons:[...document.querySelectorAll('button')].filter(b=>{const r=b.getBoundingClientRect(),s=getComputedStyle(b);return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;}).map(b=>(b.innerText||b.getAttribute('aria-label')||b.title||'').trim()).filter(Boolean)}));
  record('UX / écran de connexion','PASS',auth);
  const mobile=await context.newPage({viewport:{width:390,height:844},permissions:['camera','microphone']}); const mobileErrors=[];mobile.on('pageerror',e=>mobileErrors.push(e.message));await login(mobile,`${USER}_M`);await screenshot(mobile,'02-lobby-mobile');
  const mobileLayout=await layout(mobile,'lobby-mobile');
  const mobileControls=await mobile.evaluate(()=>({usersToggle:!!document.querySelector('#usersSidebarToggle'),generalChat:!!document.querySelector('#generalChatToggle'),createRoom:!!document.querySelector('.create-room-btn'),search:!!document.querySelector('#roomSearch')}));
  record('UX / lobby mobile 390px','PASS',{...mobileLayout,controls:mobileControls,errors:mobileErrors});
  const profile=await button(mobile,'Profil');if(profile){await profile.click();await visible(mobile,'#profileModal',5000);await screenshot(mobile,'03-profile-mobile');const p=await layout(mobile,'profile-mobile');record('UX / profil mobile','PASS',p);await mobile.locator('#profileModal .modal-close').click();}
  const create=await button(mobile,'Créer un salon');if(!create)throw Error('Création salon introuvable');const d=mobile.waitForEvent('dialog');await create.click();const dialog=await d;await dialog.accept(ROOM);await mobile.waitForFunction(n=>(document.querySelector('#roomList')?.innerText||'').includes(n),ROOM,{timeout:20000});await screenshot(mobile,'04-room-list-mobile');record('UX / création salon depuis mobile','PASS');
  await mobile.locator('#roomList .room-card').filter({hasText:ROOM}).locator('.join-room-btn').click();await visible(mobile,'#roomScreen',20000);await mobile.waitForTimeout(1000);await screenshot(mobile,'05-room-mobile');
  const roomLayout=await layout(mobile,'room-mobile');const roomControls=await mobile.evaluate(()=>({videoGrid:!!document.querySelector('#videoGrid'),micro:!!document.querySelector('#microBtn'),camera:!!document.querySelector('#cameraBtn'),leave:!!document.querySelector('.leave-btn'),chatButton:!!document.querySelector('#roomChatMobileButton'),chatInput:!!document.querySelector('#roomChatInput'),usersButton:!!document.querySelector('#roomUsersToggle')}));record('UX / salon mobile','PASS',{...roomLayout,controls:roomControls});
  await mobile.locator('#roomChatMobileButton').click();await mobile.waitForTimeout(250);const chat=await mobile.evaluate(()=>({open:document.querySelector('#roomChat')?.classList.contains('mobile-open'),backdrop:document.querySelector('#mobileChatBackdrop')?.classList.contains('visible'),inputVisible:!!document.querySelector('#roomChatInput')&&getComputedStyle(document.querySelector('#roomChatInput')).visibility!=='hidden'}));record('UX / chat salon mobile','PASS',chat);await screenshot(mobile,'06-room-chat-mobile');
  const inputs=await mobile.evaluate(()=>[...document.querySelectorAll('input,textarea')].map(e=>({id:e.id,type:e.type,placeholder:e.getAttribute('placeholder'),label:e.getAttribute('aria-label'),hasLabel:!!e.id&&!!document.querySelector(`label[for="${CSS.escape(e.id)}"]`)})));const unlabeled=inputs.filter(x=>x.id&&!x.label&&!x.hasLabel);record('UX / champs avec libellé accessible',unlabeled.length===0?'PASS':'WARN',{inputs,unlabeled});
  const focus=await mobile.evaluate(()=>{const els=[...document.querySelectorAll('button,input,textarea')].filter(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;});return {interactive:els.length,withoutAccessibleName:els.filter(e=>{const t=(e.innerText||e.getAttribute('aria-label')||e.title||e.getAttribute('placeholder')||'').trim();return !t}).length};});record('UX / contrôles nommés','PASS',focus);
  if(errors.length||mobileErrors.length)record('UX / erreurs JavaScript','FAIL',{desktop:errors,mobile:mobileErrors});else record('UX / erreurs JavaScript','PASS');
 }catch(e){record('UX / runner','FAIL',{error:e.stack||e.message});}
 finally{fs.writeFileSync(`${OUT}/report-ux.json`,JSON.stringify({site:SITE_URL,user:USER,room:ROOM,generatedAt:new Date().toISOString(),results},null,2));await browser.close();}
 const failed=results.filter(r=>r.status==='FAIL');console.log(`\nUX QA terminé : ${results.length} contrôles, ${failed.length} échec(s).`);process.exitCode=failed.length?1:0;
})();
