import React, { useMemo, useState } from "react";

const LANES = [
  { value: "SWE", label: "SWE" },
  { value: "MLE", label: "MLE" },
  { value: "PUBLIC", label: "Public Sector" },
  { value: "QUANT", label: "Quant (beta)" },
];

const TONES = [
  { value: "confident", label: "Confident" },
  { value: "neutral", label: "Neutral" },
  { value: "bold", label: "Bold" },
  { value: "warm", label: "Warm" },
];

function prettyText(x) {
  if (x == null) return "";
  if (typeof x === "string") return x;
  try { return JSON.stringify(x, null, 2); } catch { return String(x); }
}
function isPlainObject(x) {
  return x && typeof x === "object" && !Array.isArray(x);
}

function ScorePip({ score }) {
  const s = typeof score === "number" ? score : 0;
  const filled = Math.max(0, Math.min(2, s));
  return (
    <div className="flex items-center gap-1">
      {[0, 1].map((i) => (
        <span
          key={i}
          className="h-2 w-2 rounded-full"
          style={{ background: i < filled ? "rgba(64,255,215,0.95)" : "rgba(255,255,255,0.18)" }}
        />
      ))}
      <span className="text-xs rl-subtle ml-1">{filled}/2</span>
    </div>
  );
}

function Tab({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rl-pill"
      style={{
        padding: "10px 14px",
        minHeight: 40,
        lineHeight: 1.1,
        whiteSpace: "nowrap",
        opacity: active ? 1 : 0.8,
        borderColor: active ? "rgba(64,255,215,0.55)" : "rgba(255,255,255,0.26)",
        background: active ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.07)",
      }}
    >
      <span className="rl-dot" />
      <span style={{ fontSize: 14, fontWeight: 700 }}>{children}</span>
    </button>
  );
}
function pickFirst(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return "";
}
function pickFirstArray(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (Array.isArray(v) && v.length) return v;
  }
  return [];
}

function RewriteCard({ rewrite }) {
  if (!rewrite) return null;

  // Structured object rewrite
  if (isPlainObject(rewrite)) {
    const title = pickFirst(rewrite, ["position", "title", "role", "heading", "name"]) || "Rewrite";
    const org = pickFirst(rewrite, ["organization", "org", "company", "school"]);
    const location = pickFirst(rewrite, ["location"]);
    const duration = pickFirst(rewrite, ["duration", "dates", "date_range"]);

    const summary = pickFirst(rewrite, ["description", "summary", "experience", "overview"]);
    const bullets = pickFirstArray(rewrite, [
      "responsibilities",
      "bullets",
      "highlights",
      "accomplishments",
      "coursework_projects",
      "projects",
      "points",
    ]);

    return (
      <div className="rl-panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">{title}</div>
            {(org || location) && (
              <div className="text-sm rl-subtle mt-1">
                {[org, location].filter(Boolean).join(" • ")}
              </div>
            )}
            {summary && (
              <div className="text-sm mt-3" style={{ color: "rgba(255,255,255,0.86)" }}>
                {summary}
              </div>
            )}
          </div>

          {duration ? (
            <span className="rl-pill">
              <span className="rl-dot" />
              {duration}
            </span>
          ) : null}
        </div>

        {bullets.length > 0 ? (
          <ul className="mt-5 space-y-2">
            {bullets.map((b, i) => (
              <li key={i} className="text-sm" style={{ color: "rgba(255,255,255,0.88)" }}>
                • {b}
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-5 rl-subtle text-sm">
            No bullet points returned. (Enable Dev → On to inspect the raw shape.)
          </div>
        )}
      </div>
    );
  }

  // Plain string rewrite
  return (
    <div className="rl-panel p-6">
      <pre className="whitespace-pre-wrap text-sm" style={{ color: "rgba(255,255,255,0.88)" }}>
        {prettyText(rewrite)}
      </pre>
    </div>
  );
}


export default function ResumeReviewer() {
  const [text, setText] = useState("");
  const [lane, setLane] = useState("SWE");
  const [tone, setTone] = useState("confident");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("rewrite"); // rewrite | critique | questions | safety
  const [showDev, setShowDev] = useState(false);
  const [followUp, setFollowUp] = useState("");
  const [lastAction, setLastAction] = useState("");

  const canSubmit = useMemo(() => text.trim().length > 0 && !loading, [text, loading]);
  const canRequestRevision = useMemo(() => {
    if (!result || loading) return false;
    if (lastAction === "approve") return true;
    return followUp.trim().length > 0;
  }, [followUp, lastAction, loading, result]);

  // Memoize expensive stringify to reduce lag
  const devJson = useMemo(() => {
    if (!showDev || !result) return "";
    return prettyText(result);
  }, [showDev, result]);

  async function submitReview({ action = "", followUpText = "" } = {}) {
    setError("");

    if (!text.trim()) {
      setError("Paste your resume bullets or a paragraph first.");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          lane,
          tone,
          action,
          follow_up: followUpText,
          previous_rewrite: result?.rewrite ? prettyText(result.rewrite) : "",
        }),
      });

      const rawText = await res.text();

      if (!res.ok) {
        try {
          const errJson = JSON.parse(rawText);
          throw new Error(errJson?.details || errJson?.error || `Request failed (${res.status})`);
        } catch {
          throw new Error(rawText || `Request failed (${res.status})`);
        }
      }

      const data = JSON.parse(rawText);
      setResult(data);
      setTab("rewrite");
      if (action) {
        setFollowUp("");
      }
    } catch (err) {
      setError(err?.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setResult(null);
    setLastAction("");
    await submitReview();
  }

  async function handleApproveRewrite() {
    setLastAction("approve");
    await submitReview({ action: "approve", followUpText: "Please keep the facts the same and make the rewrite more polished and interview-ready." });
  }

  async function handleProvideMoreInfo() {
    setLastAction("provide_more_info");
    await submitReview({ action: "provide_more_info", followUpText: followUp.trim() });
  }

  async function copyRewrite() {
    if (!result) return;
    try { await navigator.clipboard.writeText(prettyText(result.rewrite)); } catch {}
  }

  return (
    <div className="min-h-screen px-4 py-8 md:py-10">
      <div className="mx-auto max-w-7xl">
        <div className="rl-window">
          <div className="rl-sweep" />
          <div className="rl-titlebar">
            <div className="flex items-center gap-12">
              <div className="rl-traffic" aria-hidden="true">
                <span className="r" /><span className="y" /><span className="g" />
              </div>
              <div className="flex items-baseline gap-2">
                <div className="rl-title text-xl">
                  Role<span className="rl-titleGlow">Lens</span>
                </div>
                <div className="hidden md:block rl-subtle text-sm">
                  Industry specific resume reviewer, Anote AI Academy Capstone Project
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="rl-pill"><span className="rl-dot" />no fake metrics</span>
              <span className="rl-pill hidden sm:inline-flex"><span className="rl-dot" />testing</span>
            </div>
          </div>

          <div className="rl-windowBody p-5 md:p-7">
            <div className="grid gap-8 lg:grid-cols-[1.05fr_1fr]">
              {/* LEFT: INPUT */}
              <div className="rl-panel p-5 md:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold">Reviewer</div>
                    <div className="text-sm rl-subtle">
                      Paste a snippet of your resume or personal statement to get started. Select a lane and tone.
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button className="rl-btn" onClick={handleSubmit} disabled={!canSubmit}>
                      {loading ? "Reviewing…" : "Review"}
                    </button>
                    {result?.rewrite && (
                      <button type="button" className="rl-pill" onClick={copyRewrite}>
                        <span className="rl-dot" />Copy
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2">
                    <span className="text-xs rl-subtle">Lane</span>
                    <select className="rl-input" value={lane} onChange={(e) => setLane(e.target.value)}>
                      {LANES.map((l) => (
                        <option key={l.value} value={l.value}>{l.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-2">
                    <span className="text-xs rl-subtle">Tone</span>
                    <select className="rl-input" value={tone} onChange={(e) => setTone(e.target.value)}>
                      {TONES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="mt-4 grid gap-2">
                  <span className="text-xs rl-subtle">Text</span>
                  <textarea
                    className="rl-input"
                    style={{ minHeight: "320px", resize: "vertical" }}
                    placeholder="Paste resume bullets or a personal statement paragraph…"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                  />
                  {error && (
                    <div className="text-sm mt-1" style={{ color: "rgba(255,120,120,0.95)" }}>
                      {error}
                    </div>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-4 rl-section">
                  <span className="rl-pill"><span className="rl-dot" />CV/Personal Statement/Experience section</span>
                  <span className="rl-pill"><span className="rl-dot" />copy paste friendly</span>
                  <button
                    type="button"
                    className="rl-pill"
                    onClick={() => setShowDev((v) => !v)}
                    title="Show raw JSON (debug)"
                  >
                    <span className="rl-dot" />Dev: {showDev ? "On" : "Off"}
                  </button>
                </div>
              </div>

              {/* RIGHT: RESULTS */}
              <div className="rl-panel p-5 md:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold">Results</div>
                    <div className="text-sm rl-subtle">
                      {result ? "Switch tabs to see more!" : "Run a review to populate these tabs."}
                    </div>
                  </div>

                  <div
                    className="flex flex-wrap gap-3"
                    style={{
                      paddingTop: 10,
                      paddingBottom: 6,   // adds space below tabs
                      marginBottom: 4,    // keeps them off the divider/border
                    }}
                  >
                    <Tab active={tab === "rewrite"} onClick={() => setTab("rewrite")}>Rewrite</Tab>
                    <Tab active={tab === "critique"} onClick={() => setTab("critique")}>Critique</Tab>
                    <Tab active={tab === "questions"} onClick={() => setTab("questions")}>Questions</Tab>
                    <Tab active={tab === "safety"} onClick={() => setTab("safety")}>Safety</Tab>
                  </div>

                </div>

                <div className="rl-divider my-6" />

                {!result && (
                  <div className="rl-subtle text-sm">
                    Tip: try pasting 4–6 bullets and choose SWE/MLE, then hit Review.
                  </div>
                )}

                {result && tab === "rewrite" && (
                  <div className="grid gap-4">
                    <RewriteCard rewrite={result.rewrite} />

                    <div className="rl-panel p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold">Iterate on this rewrite</div>
                          <div className="text-sm rl-subtle">
                            Approve the direction for a cleaner pass, or provide missing details and generate another rewrite.
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="rl-pill"
                            onClick={handleApproveRewrite}
                            disabled={!result || loading}
                          >
                            <span className="rl-dot" />Approve rewrite
                          </button>
                          <button
                            type="button"
                            className="rl-btn"
                            onClick={handleProvideMoreInfo}
                            disabled={!canRequestRevision || !followUp.trim()}
                          >
                            {loading && lastAction === "provide_more_info" ? "Rewriting..." : "Use more info"}
                          </button>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-2">
                        <span className="text-xs rl-subtle">Follow-up details</span>
                        <textarea
                          className="rl-input"
                          style={{ minHeight: "120px", resize: "vertical" }}
                          placeholder="Add missing metrics, tools, ownership, target role, or answer one of the review questions..."
                          value={followUp}
                          onChange={(e) => setFollowUp(e.target.value)}
                        />
                        <div className="text-xs rl-subtle">
                          Example: "I reduced onboarding time by 25%, owned the API design, and used Python, Flask, and Postgres."
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {result && tab === "questions" && (
                  <div className="rl-panel p-5">
                    <ul className="space-y-4" style={{ lineHeight: 1.5 }}>
                      {(result.questions || []).length === 0 ? (
                        <li className="rl-subtle text-sm">No questions returned.</li>
                      ) : (
                        (result.questions || []).map((q, i) => (
                          <li key={i} className="text-sm" style={{ color: "rgba(255,255,255,0.84)" }}>
                            <span
                              className="rl-pill"
                              style={{
                                padding: "6px 10px",
                                minHeight: 0,
                                fontSize: 12,
                                borderColor: "rgba(255,255,255,0.18)",
                                background: "rgba(255,255,255,0.06)",
                              }}
                            >
                              <span className="rl-dot" />
                              Q{String(i + 1)}
                            </span>
                            <span style={{ display: "block", marginTop: 8, color: "rgba(255,255,255,0.88)" }}>
                              {q}
                            </span>
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                )}

                {result && tab === "safety" && (
                  <div className="rl-panel p-5">
                    <ul className="space-y-2">
                      {(result.safety_notes || []).length === 0 ? (
                        <li className="rl-subtle text-sm">No safety notes returned.</li>
                      ) : (
                        (result.safety_notes || []).map((s, i) => (
                          <li key={i} className="text-sm" style={{ color: "rgba(255,255,255,0.84)" }}>
                            • {s}
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                )}

                {result && tab === "critique" && (
                  <div className="grid gap-3 md:grid-cols-2">
                    {(result.critique || []).length === 0 ? (
                      <div className="rl-subtle text-sm">No critique items returned.</div>
                    ) : (
                      (result.critique || []).map((c, i) => (
                        <div
                          key={i}
                          className="rl-panel p-5"
                          style={{ background: "rgba(255,255,255,0.05)", transition: "transform 140ms ease" }}
                          onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-2px)")}
                          onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0px)")}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-semibold">{c.category || "Critique"}</div>
                              <div className="text-xs rl-subtle mt-1">Issue</div>
                            </div>
                            <ScorePip score={c.score_0_to_2} />
                          </div>

                          <div className="mt-2 text-sm" style={{ color: "rgba(255,255,255,0.84)" }}>
                            {c.issue}
                          </div>

                          <div className="mt-3 text-xs rl-subtle">Suggestion</div>
                          <div className="text-sm" style={{ color: "rgba(64,255,215,0.90)" }}>
                            {c.suggestion}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {showDev && result && (
                  <div className="mt-5 rl-panel p-5">
                    <div className="text-sm font-semibold">Raw JSON</div>
                    <div className="rl-divider my-3" />
                    <pre className="whitespace-pre-wrap text-xs rl-subtle">{devJson}</pre>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 rl-subtle text-xs">
              Local dev: React @ 3000 → Flask @ 5000 (proxy).
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
