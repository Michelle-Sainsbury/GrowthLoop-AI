const test = require('node:test');
const assert = require('node:assert/strict');
const a = require('../.content-agent-test-build/grantready-campaign.js');
const brief = require('../data/seed/brief.json');
const icp = require('../data/seed/icp.json');
const registry = require('../data/seed/claims.json');
const policy = require('../data/seed/banned_phrases.json');
const examples = require('../data/examples/grantready_content_examples.json');
// Synthetic authorization exists ONLY inside tests; it never modifies the proposed files.
function approved() {
 const rows=[brief,icp,registry,policy].map(x=>structuredClone(x));
 for(const row of rows)row.authorization_state='approved_for_demo';
 for(const row of rows[2].claims)if(row.claim_id.startsWith('GR-P'))Object.assign(row,{status:'approved_demo_claim',reviewer:'Synthetic test reviewer — not Michelle authorization',reviewed_at:'2026-11-01'});
 return rows;
}
test('all five files validate and only two explicitly authorized claims record Michelle review',()=>{
 for(const [s,d] of [[a.grantReadyBriefSchema,brief],[a.grantReadyIcpSchema,icp],[a.grantReadyRegistrySchema,registry],[a.grantReadyPolicySchema,policy],[a.grantReadyExamplesSchema,examples]])assert.ok(s.safeParse(d).success);
 for(const row of registry.claims){assert.equal(row.demo_only,true);if(row.claim_id.startsWith('GR-P')){assert.equal(row.status,'approved_demo_claim');assert.equal(row.reviewer,'Michelle Sainsbury');assert.equal(row.reviewed_at,'2026-11-02');}else{assert.equal(row.status,'rejected_claim');assert.equal(row.reviewer,null);assert.equal(row.reviewed_at,null);}}
 assert.equal(registry.claims.filter(x=>x.status==='approved_demo_claim').length,2);
});
test('withdrawing brief authorization still blocks generation',()=>{const b=structuredClone(brief);b.authorization_state='pending_michelle_review';assert.throws(()=>a.generateGrantReadyDrafts(b,icp,registry,policy),/pending Michelle/);});
test('pending, rejected and authorized statuses map explicitly without upgrading pending registry',()=>{
 const mapped=a.mapGrantReadyClaims(registry);assert.equal(mapped[0].status,'approved');const pending=structuredClone(registry);Object.assign(pending.claims[0],{status:'pending',reviewer:null,reviewed_at:null});assert.equal(a.mapGrantReadyClaims(pending)[0].status,'pending');assert.equal(mapped[2].status,'rejected');
 const [, ,r]=approved();assert.equal(a.mapGrantReadyClaims(r)[0].status,'approved');r.authorization_state='pending_michelle_review';assert.equal(a.mapGrantReadyClaims(r)[0].status,'pending');
});
test('verified status requires review evidence metadata and maps only with authorization',()=>{const [,,r]=approved();r.claims[0].status='verified_claim';r.claims[0].demo_only=false;assert.equal(a.mapGrantReadyClaims(r)[0].status,'approved');r.claims[0].reviewer=null;assert.throws(()=>a.mapGrantReadyClaims(r));});
for(const status of ['approved_demo_claim','verified_claim'])test(status+' without truthful completed review fields is invalid',()=>{const r=structuredClone(registry);r.claims[0].status=status;r.claims[0].reviewer=null;r.claims[0].reviewed_at=null;assert.throws(()=>a.mapGrantReadyClaims(r),/reviewer/);});
for(const field of ['claim_id','text','source_or_evidence'])test('whitespace-only '+field+' is rejected',()=>{const r=structuredClone(registry);r.claims[0][field]=' ';assert.throws(()=>a.mapGrantReadyClaims(r));});
test('invalid date, duplicate IDs, missing provenance and unsupported status are rejected',()=>{
 for(const mutate of [r=>r.claims.push(r.claims[0]),r=>r.claims[0].status='unreviewed-unknown',r=>delete r.claims[0].source_or_evidence,r=>{r.claims[0].status='approved_demo_claim';r.claims[0].reviewer='Test';r.claims[0].reviewed_at='not-a-date';}]){const r=structuredClone(registry);mutate(r);assert.throws(()=>a.mapGrantReadyClaims(r));}
});
for(const id of ['GR-X01','missing'])test('rejected or unknown selected ID '+id+' cannot generate',()=>{const [b,i,r,p]=approved();b.selected_claim_ids=[id];assert.throws(()=>a.generateGrantReadyDrafts(b,i,r,p),/approved|missing/);});
for(const variable of ['pain_point','hook','value_proposition','evidence','cta'])test('synthetic authorized '+variable+' produces exact one-variable pair with every claim',()=>{
 const rows=approved();const posts=a.generateGrantReadyDrafts(...rows,variable);assert.equal(posts.length,2);
 assert.deepEqual(['pain_point','hook','value_proposition','evidence','cta'].filter(k=>posts[0][k]!==posts[1][k]),[variable]);
 for(const post of posts){for(const row of rows[2].claims.filter(x=>x.status==='approved_demo_claim'))assert.ok(post.content.includes(row.text));assert.equal(post.approvalStatus,'pending');}
});
test('Content-only policy blocks a guarantee in an otherwise authorized brief',()=>{const rows=approved();rows[0].keyMessage='Guaranteed grant awards';assert.throws(()=>a.generateGrantReadyDrafts(...rows),/policy/);});
test('Content-only approval revalidates current policy and claim status and requires human approval',()=>{
 const rows=approved();const posts=a.generateGrantReadyDrafts(...rows);assert.throws(()=>a.approveGrantReadyDraft(posts,'A',false,rows[2],rows[3]),/Human approval/);
 assert.equal(a.approveGrantReadyDraft(posts,'B',true,rows[2],rows[3]).approvalStatus,'approved');
 rows[2].claims[0].status='rejected_claim';assert.throws(()=>a.approveGrantReadyDraft(posts,'A',true,rows[2],rows[3]),/authorization/);
});
test('each supplied banned rule is executable and catches its explicit negative witness',()=>{
 const witnesses=['guaranteed grant award','guaranteed eligibility','$5 million','95%','automatically submits','operating platform'];
 for(let i=0;i<policy.rules.length;i++)assert.ok(policy.rules[i].patterns.some(p=>new RegExp(p,'i').test(witnesses[i])),policy.rules[i].id);
});
for(const sample of examples.examples)test(sample.id+' '+sample.label+' example is evaluated against declared reasons without publication approval',()=>{
 const result=a.evaluateGrantReadyDraft(sample.draft,sample.claim_ids,registry,policy);
 assert.equal(result.policyCompliant,sample.label==='compliant',result.reasons.join(','));
 assert.equal(result.authorizedForGeneration,sample.label==='compliant');assert.equal(examples.authorization_state,'pending_michelle_review');
 for(const reason of sample.expected_reasons)assert.ok(result.reasons.includes(reason),reason);
 assert.ok(sample.draft.length>300);
});

for(const [name,schema,data] of [['brief',a.grantReadyBriefSchema,brief],['ICP',a.grantReadyIcpSchema,icp],['policy',a.grantReadyPolicySchema,policy]])test(name+' records explicit document approval and requires complete review metadata',()=>{assert.equal(data.authorization_state,'approved_for_demo');assert.equal(data.reviewer,'Michelle Sainsbury');assert.equal(data.reviewed_at,'2026-11-02');const damaged=structuredClone(data);delete damaged.reviewer;assert.equal(schema.safeParse(damaged).success,false);});
