"use client";
import Link from "next/link";
import { useState } from "react";
import { startGrantReady, updateGrantReady } from "../app/grantready/actions";
import type { GrantReadyView } from "../lib/content-agent/grantready-workflow";

type Campaign = { description: string; audience: string; disclaimer: string; authorization: string;
  claims: { id: string; text: string; status: string }[] };
export default function GrantReadyCampaign({ campaign, synthetic }: { campaign: Campaign; synthetic: boolean }) {
  const [session, setSession] = useState<{ token: string; view: GrantReadyView } | null>(null);
  const [feedback, setFeedback] = useState("");
  const [human, setHuman] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const view = session?.view;
  async function start() {
    setBusy(true); setError("");
    try { const result = await startGrantReady();
      if (!result.ok) { setError(result.error); return; }
      setSession({ token: result.token, view: result.view }); setHuman(false); setFeedback("");
    } catch { setError("Connection failed. Your current campaign has not been replaced."); }
    finally { setBusy(false); }
  }
  async function act(action: "revise" | "approve", value: string) {
    if (!session) return;
    setBusy(true); setError("");
    try { const result = await updateGrantReady(session.token, session.view.loop.currentCycle, action, value, human);
      if (!result.ok) { setError(result.error); return; }
      setSession({ token: session.token, view: result.view }); setHuman(false);
      if (action === "revise") setFeedback("");
    } catch { setError("Connection failed. Reload before retrying the action."); }
    finally { setBusy(false); }
  }
  return <main className="min-h-screen bg-slate-950 px-5 py-10 text-white"><div className="mx-auto max-w-5xl space-y-7">
    <Link href="/" className="text-cyan-300 underline">← Original Week 1 Content Agent</Link>
    <header><p className="text-sm font-semibold uppercase tracking-widest text-cyan-300">GrowthLoop AI · Content-only campaign</p>
      <h1 className="mt-2 text-3xl font-bold">GrantReady funding-readiness conversation</h1>
      <p className="mt-4 max-w-3xl text-slate-200">{campaign.description}</p>
      <p className="mt-3 text-slate-300">Audience: {campaign.audience}</p></header>
    {synthetic && <p role="note" className="rounded-lg border border-amber-500 p-4">Synthetic test fixtures — not Michelle’s approved GrantReady campaign.</p>}
    <section className="rounded-2xl border border-cyan-800 bg-slate-900 p-6" aria-labelledby="claims-heading">
      <h2 id="claims-heading" className="text-xl font-semibold">Claims and authorization</h2>
      <p className="mt-2">{campaign.authorization === "approved_for_demo" ? "Recorded demo authorization; each action rechecks the current files." : "Pending Michelle’s authorization. The real campaign is blocked."}</p>
      <ul className="mt-4 space-y-3">{campaign.claims.map(row => <li key={row.id}><strong>{row.id}</strong> · {row.status}<p className="text-slate-300">{row.text}</p></li>)}</ul>
      <p className="mt-4 text-sm text-slate-300">{campaign.disclaimer}</p>
      <button disabled={busy} onClick={start} className="mt-5 rounded-lg bg-cyan-400 px-5 py-3 font-bold text-slate-950 disabled:opacity-40">{session ? "Start new GrantReady campaign" : "Generate GrantReady A/B drafts"}</button>
    </section>
    {error && <p role="alert" className="rounded-lg border border-red-400 bg-red-950 p-4">{error}</p>}
    {view && <>
      <section aria-label="Drafts"><h2 className="text-2xl font-bold">Cycle {view.loop.currentCycle} of 3</h2>
        <p role="status" className="my-3">{view.approvedId ? `Variation ${view.approvedId} approved. The revision loop has stopped.` : "Drafts require human review. Nothing is published."}</p>
        <div className="grid gap-5 md:grid-cols-2">{view.loop.history.at(-1)!.posts.map(post => <article key={post.id} className="min-w-0 rounded-xl border border-slate-600 bg-slate-900 p-5">
          <h3 className="text-xl font-semibold">Variation {post.id} — {post.id === "A" ? "Human-centered" : "Action-oriented"}</h3>
          <p className="mt-4 whitespace-pre-wrap break-words text-slate-200">{post.content}</p>
          <button disabled={busy || !human || view.approvedId !== null} onClick={() => act("approve", post.id)} className="mt-5 rounded-lg bg-emerald-400 px-4 py-3 font-semibold text-slate-950 disabled:opacity-40">Approve Variation {post.id}</button>
        </article>)}</div>
      </section>
      {!view.approvedId && <section className="space-y-4 rounded-xl border border-slate-600 p-5">
        <label className="flex items-start gap-3"><input type="checkbox" checked={human} onChange={event => setHuman(event.target.checked)} className="mt-1" />I have reviewed the current drafts and explicitly approve my selected variation.</label>
        {view.loop.currentCycle < 3 ? <><div className="grid gap-2"><label htmlFor="grantready-feedback">Revision feedback</label><textarea id="grantready-feedback" value={feedback} maxLength={2000} onChange={event => setFeedback(event.target.value)} className="min-h-28 rounded-lg border border-slate-500 bg-slate-900 p-3" /></div>
          <button disabled={busy} onClick={() => act("revise", feedback)} className="rounded-lg bg-cyan-400 px-4 py-3 font-semibold text-slate-950 disabled:opacity-40">Revise both drafts</button></> : <p>Three-cycle limit reached. Review and approve, or start a new campaign.</p>}
      </section>}
      <section aria-label="Revision history"><h2 className="text-xl font-semibold">Revision history</h2><ol className="mt-4 space-y-3">{view.loop.history.map(row => <li key={row.cycle} className="rounded-lg border-l-4 border-cyan-500 bg-slate-900 p-4"><strong>Cycle {row.cycle}</strong><p className="break-words text-slate-300">{row.feedback}</p></li>)}</ol></section>
    </>}
    <footer className="text-sm text-slate-400">Template-based TypeScript generation · No model/API call · No automatic publishing · Temporary server memory; sessions expire after one hour or a server restart. Reviewer identity is not authenticated.</footer>
  </div></main>;
}
