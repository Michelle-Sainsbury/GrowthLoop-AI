"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getGrantReadyStatus, startGrantReady, updateGrantReady } from "../app/grantready/actions";
import type { GrantReadyView } from "../lib/content-agent/grantready-workflow";

type Campaign = { description: string; audience: string; disclaimer: string; authorization: string;
  claims: { id: string; text: string; status: string }[] };
export default function GrantReadyCampaign({ campaign, synthetic }: { campaign: Campaign; synthetic: boolean }) {
  const [session, setSession] = useState<{ token: string; view: GrantReadyView } | null>(null);
  const [feedback, setFeedback] = useState("");
  const [human, setHuman] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const [pending, setPending] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [recoveryToken, setRecoveryToken] = useState("");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      try { const token = sessionStorage.getItem("grantready-session"); if (token) { setRecoveryToken(token); setUncertain(true); } } catch { /* In-tab state still works. */ }
      setReady(true);
    });
    return () => { active = false; };
  }, []);
  const view = session?.view;
  async function recover() {
    const token = session?.token || recoveryToken;
    if (!token || lock.current) return;
    lock.current = true; setBusy(true); setPending("Checking saved campaign status…");
    try {
      const result = await getGrantReadyStatus(token);
      if (!result.ok) { setError(result.error); setUncertain(true); setHuman(false); return; }
      setSession({ token, view: result.view }); setUncertain(false); setError(""); setHuman(false);
    } catch { setError("Status could not be confirmed. Do not assume approval succeeded or failed."); setUncertain(true); setHuman(false); }
    finally { lock.current = false; setBusy(false); setPending(""); }
  }
  async function start() {
    if (lock.current || uncertain || !ready) return;
    lock.current = true; setBusy(true); setError("");
    try { const result = await startGrantReady();
      if (!result.ok) { setError(result.error); return; }
      setSession({ token: result.token, view: result.view }); setHuman(false); setFeedback(""); setUncertain(false); setRecoveryToken(result.token);
      try { sessionStorage.setItem("grantready-session", result.token); } catch { /* In-tab state still works. */ }
    } catch { setError("Connection failed. Your current campaign has not been replaced."); }
    finally { lock.current = false; setBusy(false); }
  }
  async function act(action: "revise" | "approve", value: string) {
    if (!session || lock.current || uncertain) return;
    lock.current = true; setBusy(true); setError("");
    setPending(action === "approve" ? `Approving Variation ${value}… Please wait for confirmation.` : "Revising both drafts…");
    try { const result = await updateGrantReady(session.token, session.view.loop.currentCycle, action, value, human);
      if (!result.ok) { setError(result.error); setUncertain(true); setHuman(false); return; }
      setSession({ token: session.token, view: result.view }); setHuman(false);
      if (action === "revise") setFeedback("");
    } catch { setError("Connection interrupted. Approval is not confirmed. Check saved status before retrying."); setUncertain(true); setHuman(false); }
    finally { lock.current = false; setBusy(false); setPending(""); }
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
      <button disabled={!ready || busy || uncertain} onClick={start} className="mt-5 rounded-lg bg-cyan-400 px-5 py-3 font-bold text-slate-950 disabled:opacity-40">{session ? "Start new GrantReady campaign" : "Generate GrantReady A/B drafts"}</button>
    </section>
    {(session || recoveryToken) && <section className="sticky top-2 z-10 rounded-xl border border-emerald-500 bg-slate-950 p-4" aria-label="Approval status">
      <p role="status" aria-live="polite">{pending || (view?.approvedId ? `Variation ${view.approvedId} approved. Variation ${view.approvedId === "A" ? "B" : "A"} is not approved. The revision loop has stopped. Nothing is published.` : uncertain ? "Saved status must be checked before continuing. No approval is confirmed in this browser." : "No variation approved. Explicit review and selection are required.")}</p>
      {error && <p role="alert" className="mt-2 text-red-200">{error}</p>}
      <button disabled={busy} onClick={recover} className="mt-3 underline disabled:opacity-40">Check saved campaign status</button>
      {uncertain && <div className="mt-3 text-sm"><p>If recovery is impossible, a separate campaign will not cancel or resolve any previous approval.</p>
        <button disabled={busy} className="mt-2 underline disabled:opacity-40" onClick={() => {
          if (lock.current) return;
          try { sessionStorage.removeItem("grantready-session"); } catch { /* Current tab can still reset. */ }
          setSession(null); setRecoveryToken(""); setUncertain(false); setHuman(false); setError("");
        }}>Acknowledge unknown previous status and prepare a separate campaign</button></div>}
    </section>}
    {error && !session && !recoveryToken && <p role="alert">{error}</p>}
    {view && <>
      <section aria-label="Drafts"><h2 className="text-2xl font-bold">Cycle {view.loop.currentCycle} of 3</h2>
        <p role="status" className="my-3">{view.approvedId ? `Variation ${view.approvedId} approved. The revision loop has stopped.` : "Drafts require human review. Nothing is published."}</p>
        <div className="grid gap-5 md:grid-cols-2">{view.loop.history.at(-1)!.posts.map(post => <article key={post.id} className="min-w-0 rounded-xl border border-slate-600 bg-slate-900 p-5">
          <h3 className="text-xl font-semibold">Variation {post.id} — {post.id === "A" ? "Human-centered" : "Action-oriented"}</h3>
          <p className="mt-4 whitespace-pre-wrap break-words text-slate-200">{post.content}</p>
          <button disabled={busy || uncertain || !human || view.approvedId !== null} onClick={() => act("approve", post.id)} className="mt-5 rounded-lg bg-emerald-400 px-4 py-3 font-semibold text-slate-950 disabled:opacity-40">Approve Variation {post.id}</button>
        </article>)}</div>
      </section>
      {!view.approvedId && <section className="space-y-4 rounded-xl border border-slate-600 p-5">
        <label className="flex items-start gap-3"><input type="checkbox" disabled={busy || uncertain} checked={human} onChange={event => setHuman(event.target.checked)} className="mt-1" />I have reviewed the current drafts and explicitly approve my selected variation.</label>
        {view.loop.currentCycle < 3 ? <><div className="grid gap-2"><label htmlFor="grantready-feedback">Revision feedback</label><textarea id="grantready-feedback" value={feedback} maxLength={2000} onChange={event => setFeedback(event.target.value)} className="min-h-28 rounded-lg border border-slate-500 bg-slate-900 p-3" /></div>
          <button disabled={busy || uncertain} onClick={() => act("revise", feedback)} className="rounded-lg bg-cyan-400 px-4 py-3 font-semibold text-slate-950 disabled:opacity-40">Revise both drafts</button></> : <p>Three-cycle limit reached. Review and approve, or start a new campaign.</p>}
      </section>}
      <section aria-label="Revision history"><h2 className="text-xl font-semibold">Revision history</h2><ol className="mt-4 space-y-3">{view.loop.history.map(row => <li key={row.cycle} className="rounded-lg border-l-4 border-cyan-500 bg-slate-900 p-4"><strong>Cycle {row.cycle}</strong><p className="break-words text-slate-300">{row.feedback}</p></li>)}</ol></section>
    </>}
    <footer className="text-sm text-slate-400">Template-based TypeScript generation · No model/API call · No automatic publishing · Shared storage is required in production; sessions and approval recovery expire one hour after campaign creation. Keep this tab open; recovery is available in this tab after reload. Reviewer identity is not authenticated.</footer>
  </div></main>;
}
