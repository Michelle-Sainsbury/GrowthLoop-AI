import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
// Optional browser harness; no paid API or real reviewer decisions.
// Start a local app with GRANTREADY_DATA_DIR pointing at authorized SYNTHETIC fixtures.
const {chromium}=await import(process.env.CONTENT_AGENT_PLAYWRIGHT_MODULE || 'playwright');
let browser;
before(async()=>{browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});});
after(async()=>browser.close());
const origin = process.env.GRANTREADY_BROWSER_BASE_URL || 'http://127.0.0.1:3245';
if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw new Error('Browser approval tests are local-only. Never run against real deployed sessions.');
const url=new URL('/grantready',origin).href;
async function begin(page){await page.goto(url);await page.getByText('Synthetic test fixtures — not Michelle’s approved GrantReady campaign.',{exact:true}).waitFor();await page.getByRole('button',{name:'Generate GrantReady A/B drafts'}).click();await page.getByRole('heading',{name:'Cycle 1 of 3',exact:true}).waitFor();}
for(const width of [1280,390])test(`synthetic ${width}px: three cycles, immediate feedback, duplicate click lock, B only and reload recovery`,async()=>{
 const ctx=await browser.newContext({viewport:{width,height:1000}}),p=await ctx.newPage();
 try{await begin(p);
 for(const [feedback,cycle] of [['Make both posts shorter',2],['Add more detail and end with a question',3]]){await p.getByLabel('Revision feedback',{exact:true}).fill(feedback);await p.getByRole('button',{name:'Revise both drafts'}).click();await p.getByRole('heading',{name:`Cycle ${cycle} of 3`,exact:true}).waitFor();}
 const a=p.getByRole('button',{name:'Approve Variation A',exact:true}),b=p.getByRole('button',{name:'Approve Variation B',exact:true});
 assert.ok(await a.isDisabled());assert.ok(await b.isDisabled());await p.getByRole('checkbox').check();
 let calls=0;await p.route(url,async route=>{if(route.request().method()==='POST'){calls++;await new Promise(r=>setTimeout(r,600));}await route.continue();});
 await b.evaluate(el=>{el.click();el.click();});
 const status=p.getByRole('region',{name:'Approval status'});
 await status.getByText('Approving Variation B… Please wait for confirmation.',{exact:true}).waitFor();assert.ok(await a.isDisabled());assert.ok(await b.isDisabled());
 await status.getByText(/Variation B approved\. Variation A is not approved/).waitFor();assert.equal(calls,1);
 assert.ok(await a.isDisabled());assert.ok(await b.isDisabled());assert.equal(await p.getByRole('checkbox').count(),0);
 assert.equal(await p.getByRole('region',{name:'Revision history'}).locator('li').count(),3);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await p.unroute(url);await p.reload();await p.getByRole('button',{name:'Check saved campaign status'}).click();await p.getByRole('region',{name:'Approval status'}).getByText(/Variation B approved\. Variation A is not approved/).waitFor();
 if(process.env.GRANTREADY_BROWSER_ARTIFACT_DIR) await p.screenshot({path:`${process.env.GRANTREADY_BROWSER_ARTIFACT_DIR}/approved-${width}.png`,fullPage:true});
 }finally{await ctx.close();}
});
test('synthetic browser lost approval response stays uncertain until saved status confirms B',async()=>{const ctx=await browser.newContext(),p=await ctx.newPage();try{await begin(p);await p.getByRole('checkbox').check();await p.route(url,async route=>{if(route.request().method()==='POST'){await route.fetch();await route.abort('failed');}else await route.continue();});await p.getByRole('button',{name:'Approve Variation B',exact:true}).click();await p.getByText('Connection interrupted. Approval is not confirmed. Check saved status before retrying.',{exact:true}).waitFor();assert.ok(await p.getByRole('button',{name:'Approve Variation A',exact:true}).isDisabled());await p.unroute(url);await p.getByRole('button',{name:'Check saved campaign status'}).click();await p.getByRole('region',{name:'Approval status'}).getByText(/Variation B approved\. Variation A is not approved/).waitFor();}finally{await ctx.close();}});
test('missing session is an explicit error and never a successful approval',async()=>{const ctx=await browser.newContext(),p=await ctx.newPage();try{await p.goto(url);await p.evaluate(()=>sessionStorage.setItem('grantready-session','00000000-0000-0000-0000-000000000000'));await p.reload();await p.getByRole('button',{name:'Check saved campaign status'}).click();await p.getByText(/Campaign session is unavailable or expired/).waitFor();assert.equal(await p.getByText(/Variation B approved/).count(),0);assert.ok(await p.getByRole('button',{name:'Generate GrantReady A/B drafts'}).isDisabled());}finally{await ctx.close();}});
