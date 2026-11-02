import { createHash } from "node:crypto";
import { startRevisionLoop, revisePosts, type RevisionLoop } from "./revision-loop";
import { resolveApprovedClaims } from "./claim-registry";
import { approvePost } from "./approve-posts";
import { grantReadyBriefSchema, grantReadyIcpSchema, grantReadyRegistrySchema,
  grantReadyPolicySchema, mapGrantReadyClaims, evaluateGrantReadyDraft } from "./grantready-campaign";

export type GrantReadyData = { brief: unknown; icp: unknown; registry: unknown; policy: unknown };
export type GrantReadyView = { loop: RevisionLoop; approvedId: "A" | "B" | null };
function resolve(data: GrantReadyData) {
  const b = grantReadyBriefSchema.parse(data.brief);
  const i = grantReadyIcpSchema.parse(data.icp);
  const r = grantReadyRegistrySchema.parse(data.registry);
  const p = grantReadyPolicySchema.parse(data.policy);
  if ([b, i, r, p].some(row => row.authorization_state !== "approved_for_demo"))
    throw new Error("GrantReady is pending Michelle's authorization. No drafts can be generated or approved.");
  const runtime = mapGrantReadyClaims(r);
  const approvedClaims = resolveApprovedClaims(b.selected_claim_ids, runtime);
  const fingerprint = createHash("sha256").update(JSON.stringify([b, i, r, p])).digest("hex");
  return { brief: { audience: i.audience, campaignGoal: b.campaignGoal, keyMessage: b.keyMessage, approvedClaims },
    ids: b.selected_claim_ids, registry: r, policy: p, runtime, fingerprint };
}
function validateLoop(loop: RevisionLoop, current: ReturnType<typeof resolve>) {
  const copy = structuredClone(loop);
  for (const entry of copy.history) for (const post of entry.posts) {
    const check = evaluateGrantReadyDraft(post.content, current.ids, current.registry, current.policy);
    if (!check.authorizedForGeneration) throw new Error("GrantReady draft failed authorization or prohibited-language validation: " + check.reasons.join(", "));
    post.claimIds = [...current.ids];
  }
  return copy;
}

// Server-owned state: client submissions cannot replace briefs, claim IDs or drafts.
// The original legacy revision engine supplies the same framing/feedback behavior.
export class GrantReadyWorkflow {
  #state: GrantReadyView;
  #fingerprint: string;
  constructor(data: GrantReadyData) {
    const current = resolve(data);
    this.#state = { loop: validateLoop(startRevisionLoop(current.brief), current), approvedId: null };
    this.#fingerprint = current.fingerprint;
  }
  view(): GrantReadyView { return structuredClone(this.#state); }
  #current(data: GrantReadyData, expectedCycle: number) {
    if (this.#state.approvedId) throw new Error("This campaign is already approved. The revision loop has stopped.");
    if (this.#state.loop.currentCycle !== expectedCycle) throw new Error("Campaign changed. Reload the current cycle before continuing.");
    const current = resolve(data); // Recheck latest statuses before checking historical identity.
    validateLoop(this.#state.loop, current);
    if (current.fingerprint !== this.#fingerprint)
      throw new Error("Campaign, claims or policy changed. Start a new campaign and review the new drafts.");
    return current;
  }
  revise(data: GrantReadyData, feedback: string, expectedCycle: number) {
    const current = this.#current(data, expectedCycle);
    if (typeof feedback !== "string" || feedback.length > 2000) throw new Error("Feedback must be text of at most 2000 characters.");
    if (current.policy.rules.some(rule => rule.patterns.some(pattern => new RegExp(pattern, "i").test(feedback))))
      throw new Error("Feedback contains prohibited language. Human review is required.");
    const next = validateLoop(revisePosts(this.#state.loop, current.brief, feedback), current);
    this.#state = { loop: next, approvedId: null };
    return this.view();
  }
  approve(data: GrantReadyData, id: "A" | "B", humanApproved: boolean, expectedCycle: number) {
    const current = this.#current(data, expectedCycle);
    const posts = this.#state.loop.history.at(-1)!.posts;
    const approved = approvePost(posts, id, humanApproved, { claimIds: current.ids, registry: current.runtime });
    this.#state = { loop: this.#state.loop, approvedId: approved.id };
    return this.view();
  }
}
