import React, { useState } from "react";

export default function ResumeReviewer() {
  const [text, setText] = useState("");
  const [lane, setLane] = useState("SWE");
  const [tone, setTone] = useState("confident");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setResult(null);

    const res = await fetch("/api/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, lane, tone })
    });

    if (!res.ok) {
      setError("Review failed");
      return;
    }

    setResult(await res.json());
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white p-10">
      <h1 className="text-4xl font-bold mb-4">RoleLens</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <textarea
          className="w-full p-4 text-black"
          rows={8}
          placeholder="Paste resume text…"
          value={text}
          onChange={e => setText(e.target.value)}
        />

        <div className="flex gap-4">
          <select value={lane} onChange={e => setLane(e.target.value)}>
            <option>SWE</option>
            <option>MLE</option>
            <option>PUBLIC</option>
            <option>QUANT</option>
          </select>

          <select value={tone} onChange={e => setTone(e.target.value)}>
            <option>confident</option>
            <option>neutral</option>
            <option>warm</option>
          </select>
        </div>

        <button className="bg-teal-500 px-4 py-2 rounded">Review</button>
      </form>

      {error && <p className="text-red-400 mt-4">{error}</p>}

      {result && (
        <pre className="mt-6 bg-black p-4 overflow-x-auto">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
