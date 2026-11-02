import { z } from "zod";
import { generatePosts, type ExperimentVariable } from "./generate-posts";
import { approvePost } from "./approve-posts";
import type { ClaimRecord } from "./claim-registry";

const text = z.string().trim().min(1);
const authorization = z.enum(["pending_michelle_review", "approved_for_demo"]);
const documentReview = { reviewer: text.nullable().optional(), reviewed_at: z.iso.date().nullable().optional() };
function validateDocumentReview(row: { authorization_state: string; reviewer?: string | null; reviewed_at?: string | null }, ctx: z.RefinementCtx) {
  if (row.authorization_state === "approved_for_demo" && (!row.reviewer || !row.reviewed_at))
    ctx.addIssue({ code: "custom", message: "Approved campaign documents require a reviewer and review date." });
}
const status = z.enum(["pending", "revoked", "approved_demo_claim", "verified_claim", "rejected_claim"]);
const claim = z.strictObject({
  claim_id: text, text, status, source_or_evidence: text,
  reviewer: text.nullable(), reviewed_at: z.iso.date().nullable(), demo_only: z.boolean(),
}).superRefine((row, ctx) => {
  if (["approved_demo_claim", "verified_claim"].includes(row.status) && (!row.reviewer || !row.reviewed_at)) {
    ctx.addIssue({ code: "custom", message: "Authorized claims require a real reviewer and review date." });
  }
  if (row.status === "pending" && (row.reviewer !== null || row.reviewed_at !== null)) {
    ctx.addIssue({ code: "custom", message: "Pending authoring claims must not imply completed review." });
  }
  if (row.status === "approved_demo_claim" && !row.demo_only) {
    ctx.addIssue({ code: "custom", message: "Demo claims require demo_only=true." });
  }
});
export const grantReadyRegistrySchema = z.strictObject({
  schema_version: z.literal("gl02-proposal-1.0"), registry_version: text,
  authorization_state: authorization, metadata_policy: text, claims: z.array(claim).min(1),
}).superRefine((registry, ctx) => {
  if (new Set(registry.claims.map(row => row.claim_id)).size !== registry.claims.length)
    ctx.addIssue({ code: "custom", message: "Duplicate claim IDs." });
  if (!registry.claims.some(row => row.status === "rejected_claim"))
    ctx.addIssue({ code: "custom", message: "A rejected policy example is required." });
});
export const grantReadyBriefSchema = z.strictObject({
  ...documentReview, schema_version: z.literal("gl02-proposal-1.0"), campaign_id: text, authorization_state: authorization,
  product: z.literal("GrantReady"), description: text, campaignGoal: text, keyMessage: text,
  tone: z.array(text).min(1), disclaimer: text, selected_claim_ids: z.array(text).min(1), out_of_scope: z.array(text).min(1),
}).refine(row => new Set(row.selected_claim_ids).size === row.selected_claim_ids.length, "Duplicate selected claim IDs.").superRefine(validateDocumentReview);
export const grantReadyIcpSchema = z.strictObject({
  ...documentReview,
  schema_version: z.literal("gl02-proposal-1.0"), authorization_state: authorization,
  audience: text, geography: z.literal("New York City"), context: text, needs: z.array(text).min(1),
  communication_preferences: z.array(text).min(1), provenance: text,
}).superRefine(validateDocumentReview);
export const grantReadyPolicySchema = z.strictObject({
  ...documentReview,
  schema_version: z.literal("gl02-proposal-1.0"), authorization_state: authorization, scope: text,
  rules: z.array(z.strictObject({ id: text, reason: text, patterns: z.array(text).min(1) })).min(1),
}).superRefine((policy, ctx) => {
  validateDocumentReview(policy, ctx);
  if (new Set(policy.rules.map(rule => rule.id)).size !== policy.rules.length)
    ctx.addIssue({ code: "custom", message: "Duplicate policy rule IDs." });
  for (const rule of policy.rules) for (const pattern of rule.patterns) {
    try { new RegExp(pattern, "i"); } catch { ctx.addIssue({ code: "custom", message: "Invalid policy pattern." }); }
  }
});
export const grantReadyExamplesSchema = z.strictObject({
  schema_version: z.literal("gl02-proposal-1.0"), authorization_state: authorization, notice: text,
  examples: z.array(z.strictObject({ id: text, label: z.enum(["compliant", "noncompliant"]), title: text,
    draft: text, claim_ids: z.array(text), expected_reasons: z.array(text) })).length(8),
}).superRefine((set, ctx) => {
  if (new Set(set.examples.map(row => row.id)).size !== 8 || set.examples.filter(row => row.label === "compliant").length !== 4)
    ctx.addIssue({ code: "custom", message: "Eight unique examples must include four compliant and four noncompliant drafts." });
});

export function mapGrantReadyClaims(input: unknown): ClaimRecord[] {
  const registry = grantReadyRegistrySchema.parse(input);
  return registry.claims.map(row => ({ id: row.claim_id, text: row.text,
    status: row.status === "revoked" ? "revoked" : row.status === "pending" ? "pending" : row.status === "rejected_claim" ? "rejected" : registry.authorization_state === "approved_for_demo" ? "approved" : "pending" }));
}

// Policy compliance and claim eligibility do not approve evaluation samples for
// publication. Callers separately enforce full campaign authorization and human approval.
export function evaluateGrantReadyDraft(draft: string, ids: string[], registryInput: unknown, policyInput: unknown) {
  const registry = grantReadyRegistrySchema.parse(registryInput);
  const policy = grantReadyPolicySchema.parse(policyInput);
  const reasons = new Set<string>();
  for (const rule of policy.rules) if (rule.patterns.some(pattern => new RegExp(pattern, "i").test(draft))) reasons.add(rule.id);
  if (!/\bhypothetical\b/i.test(draft)) reasons.add("missing_hypothetical_disclosure");
  for (const id of ids) {
    const row = registry.claims.find(row => row.claim_id === id);
    if (!row) reasons.add("unknown_claim");
    else if (row.status === "rejected_claim") reasons.add("rejected_claim");
    else if (row.status === "revoked") reasons.add("revoked_claim");
    else if (!draft.includes(row.text)) reasons.add("missing_claim_text");
  }
  const eligible = registry.authorization_state === "approved_for_demo" && policy.authorization_state === "approved_for_demo" && ids.length > 0 &&
    new Set(ids).size === ids.length && ids.every(id => registry.claims.some(row => row.claim_id === id &&
      ["approved_demo_claim", "verified_claim"].includes(row.status)));
  return { reasons: [...reasons], policyCompliant: reasons.size === 0, authorizedForGeneration: eligible && reasons.size === 0 };
}

// Opt-in adapter only: legacy generator/dashboard/revision functions remain unchanged.
export function generateGrantReadyDrafts(briefInput: unknown, icpInput: unknown, registryInput: unknown,
  policyInput: unknown, variable: ExperimentVariable = "hook") {
  const brief = grantReadyBriefSchema.parse(briefInput);
  const icp = grantReadyIcpSchema.parse(icpInput);
  const registry = grantReadyRegistrySchema.parse(registryInput);
  const policy = grantReadyPolicySchema.parse(policyInput);
  if ([brief, icp, registry, policy].some(row => row.authorization_state !== "approved_for_demo"))
    throw new Error("GrantReady proposed content is pending Michelle's review; generation is not authorized.");
  const runtime = mapGrantReadyClaims(registry);
  const posts = generatePosts({ audience: icp.audience, campaignGoal: brief.campaignGoal,
    keyMessage: brief.keyMessage, approvedClaims: [] }, { experimentVariable: variable, claimIds: brief.selected_claim_ids, claimRegistry: runtime });
  for (const post of posts) {
    const result = evaluateGrantReadyDraft(post.content, brief.selected_claim_ids, registry, policy);
    if (!result.authorizedForGeneration) throw new Error("GrantReady draft failed Content-only policy or authorization checks: " + result.reasons.join(", "));
  }
  return posts;
}
export function approveGrantReadyDraft(posts: ReturnType<typeof generatePosts>, id: "A" | "B", humanApproved: boolean,
  registryInput: unknown, policyInput: unknown) {
  const selected = posts.find(post => post.id === id);
  if (!selected?.claimIds) throw new Error("GrantReady claim provenance is required.");
  const policy = grantReadyPolicySchema.parse(policyInput);
  const check = evaluateGrantReadyDraft(selected.content, selected.claimIds, registryInput, policy);
  if (policy.authorization_state !== "approved_for_demo" || !check.authorizedForGeneration)
    throw new Error("GrantReady policy or claim authorization prevents approval.");
  return approvePost(posts, id, humanApproved, { claimIds: selected.claimIds, registry: mapGrantReadyClaims(registryInput) });
}
