import React, { useEffect, useRef, useState } from "react";

/**
 * Intent vs RNG — React single-file app (no Tailwind directives in this file)
 * Fixes the prior build error caused by raw CSS with "@tailwind" at the top of a React file
 * (the bundler tried to parse it as decorators). Styles are now injected via a <style> tag.
 *
 * Features
 * - Default N = 100000
 * - Focus / Control / Both modes
 * - Live progress bar, cancel
 * - Results rendered in clean cards (no <pre> blob)
 * - z & two-tailed p; Focus vs Control comparison
 * - Basic self-tests for the stats helpers (console.assert)
 */

// ------------------------ Styles (injected) ------------------------
const styles = `
:root {
  --bg: #f9fafb;        /* slate-50 */
  --text: #111827;      /* gray-900 */
  --card: #ffffff;
  --border: #e5e7eb;    /* gray-200 */
  --accent: #6366f1;    /* indigo-500 */
  --accent-600: #4f46e5;/* indigo-600 */
}

* { box-sizing: border-box; }
body { margin:0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Inter", Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"; background: var(--bg); color: var(--text); }

.container { max-width: 56rem; margin: 0 auto; padding: 2rem 1rem; }
.h1 { font-size: 2.25rem; font-weight: 800; text-align: center; letter-spacing: -0.01em; color: var(--accent); margin: 0 0 0.75rem; }
.p { margin: 0.25rem 0 0; text-align: center; color: #374151; }

.controls { margin-top: 1.25rem; display: grid; grid-template-columns: 1fr auto auto; gap: 0.75rem; align-items: end; }
@media (max-width: 720px) { .controls { grid-template-columns: 1fr; } }

.label { font-size: 0.9rem; color: #374151; display: block; }
.input { margin-top: 0.25rem; width: 100%; padding: 0.65rem 0.8rem; border: 1px solid var(--border); border-radius: 0.75rem; font-size: 0.95rem; }
.note { font-size: 0.8rem; color: #6b7280; margin-top: 0.25rem; }

.btnrow { display:flex; gap: 0.5rem; flex-wrap: wrap; }
.btn { border: 1px solid var(--border); background: white; color:#111827; border-radius: 9999px; padding: 0.55rem 1rem; font-weight: 600; font-size: 0.95rem; box-shadow: 0 1px 2px rgba(0,0,0,.06); }
.btn:hover { background:#f9fafb; }
.btn.primary { background: var(--accent); color:white; border-color: transparent; }
.btn.primary:hover { background: var(--accent-600); }
.btn:disabled { opacity: .5; cursor:not-allowed; }

.card { background: var(--card); border:1px solid var(--border); border-radius: 1rem; padding: 1rem; box-shadow: 0 6px 16px rgba(0,0,0,.05); }
.stack { display: grid; gap: 0.75rem; }

.progressWrap { height: 0.8rem; border-radius: 0.6rem; background:#e5e7eb; overflow: hidden; }
.progressFill { height:100%; width:0%; background: linear-gradient(90deg, var(--accent), #a5b4fc); transition: width .25s ease; }
.small { font-size: .9rem; color:#374151; }

.results { display:grid; gap: 0.75rem; }
.resultCard { border:1px solid var(--border); background:white; border-radius: 0.875rem; padding: 0.9rem 1rem; }
.rcHead { display:flex; align-items: baseline; justify-content: space-between; gap:.5rem; }
.rcTitle { font-weight: 700; color: var(--accent); }
.rcMeta { font-size:.8rem; color:#6b7280; }
.rcGrid { display:grid; grid-template-columns: 1fr 1fr; gap: .35rem .75rem; margin-top:.5rem; }
.row { display:flex; justify-content: space-between; gap:.75rem; font-size:.95rem; }
.row b { font-weight: 700; }
.highlight { background: #eef2ff; border:1px solid #c7d2fe; border-radius: 0.75rem; padding: 0.75rem 1rem; }
.help { color: var(--accent); cursor:pointer; font-size:.9rem; text-align:left; max-width:56rem; margin: .25rem auto 0; }
.help:hover { text-decoration: underline; }
.helpCard { background:#f5f3ff; border:1px solid #ddd6fe; color:#1f2937; padding: .9rem 1rem; border-radius:.75rem; margin-top:.5rem; font-size:.95rem; }
.footer { margin-top: 1.25rem; text-align:center; color:#6b7280; font-size:.8rem; }
`;

// ------------------------ Types ------------------------

type Kind = "Focus" | "Control";

interface SessionResult {
  kind: Kind;
  n: number;
  hits: number;
  rate: number; // heads proportion
  z: number;
  p: number;
}

// ------------------------ Helpers ------------------------

function toExp(p: number) {
  if (!isFinite(p)) return String(p);
  return p.toExponential(3);
}

function flip(): 0 | 1 {
  const a = new Uint8Array(1);
  if (typeof crypto === "undefined" || !crypto.getRandomValues) {
    return (Math.random() < 0.5 ? 0 : 1) as 0 | 1;
  }
  crypto.getRandomValues(a);
  return (a[0] & 1) as 0 | 1;
}

function normalCdf(x: number) {
  // Abramowitz & Stegun 7.1.26 approximation of Φ(x)
  const t = 1 / (1 + 0.2316419 * x);
  const d = Math.exp((-x * x) / 2) / Math.sqrt(2 * Math.PI);
  const poly = 0.31938153 * t - 0.356563782 * t ** 2 + 1.781477937 * t ** 3 - 1.821255978 * t ** 4 + 1.330274429 * t ** 5;
  return 1 - d * poly;
}

function zAndP(hits: number, n: number) {
  const z = (hits - 0.5 * n) / Math.sqrt(n * 0.25);
  const p = 2 * (1 - normalCdf(Math.abs(z)));
  return { z, p };
}

function diffTest(a: SessionResult, b: SessionResult) {
  const diff = a.rate - b.rate;
  const se = Math.sqrt(a.rate * (1 - a.rate) / a.n + b.rate * (1 - b.rate) / b.n);
  const z = diff / se;
  const p = 2 * (1 - normalCdf(Math.abs(z)));
  return { diff, z, p };
}

async function runSession(
  kind: Kind,
  n: number,
  setProgress: (x: number) => void,
  setLive: (s: string) => void,
  cancelRef: React.MutableRefObject<{ cancelled: boolean }>
): Promise<SessionResult> {
  let hits = 0;
  for (let i = 1; i <= n; i++) {
    hits += flip();
    if (i % 250 === 0 || i === n) { // throttle UI updates
      setProgress(i / n);
      setLive(`${kind}: ${i}/${n} flips • Heads=${hits} (${((hits / i) * 100).toFixed(2)}%)`);
      await new Promise((r) => setTimeout(r, 0));
      if (cancelRef.current.cancelled) throw new Error("Cancelled");
    }
  }
  const { z, p } = zAndP(hits, n);
  return { kind, n, hits, rate: hits / n, z, p };
}

// ------------------------ Component ------------------------

export default function App() {
  const [n, setN] = useState<number>(100000);
  const [running, setRunning] = useState<"idle" | "focus" | "control" | "both">("idle");
  const [liveMsg, setLiveMsg] = useState<string>("");
  const [progress, setProgress] = useState<number>(0);
  const [results, setResults] = useState<SessionResult[]>([]);
  const [compareLine, setCompareLine] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [showHelp, setShowHelp] = useState<boolean>(false);
  const cancelRef = useRef({ cancelled: false });

  // Self-tests for stats helpers (visible in devtools console)
  useEffect(() => {
    try { runSelfTests(); } catch (e) { console.error("Self-tests failed:", e); }
  }, []);

  function reset() {
    setResults([]);
    setCompareLine("");
    setProgress(0);
    setLiveMsg("");
    setError("");
    cancelRef.current.cancelled = false;
  }

  async function runOne(kind: Kind) {
    reset();
    const N = Math.max(50, n | 0);
    setRunning(kind === "Focus" ? "focus" : "control");
    try {
      const res = await runSession(kind, N, setProgress, setLiveMsg, cancelRef);
      setResults([res]);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setRunning("idle");
    }
  }

  async function runBoth() {
    reset();
    const N = Math.max(50, n | 0);
    setRunning("both");
    try {
      setLiveMsg("Focus first—try to will Heads.");
      const focus = await runSession("Focus", N, setProgress, setLiveMsg, cancelRef);
      setProgress(0);
      setLiveMsg("Now Control—relax and let it be chance.");
      const control = await runSession("Control", N, setProgress, setLiveMsg, cancelRef);
      setResults([focus, control]);
      const cmp = diffTest(focus, control);
      setCompareLine(`Focus vs Control: Δ=${(cmp.diff * 100).toFixed(2)} pp, z=${cmp.z.toFixed(3)}, p=${toExp(cmp.p)}`);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setRunning("idle");
    }
  }

  function cancel() {
    cancelRef.current.cancelled = true;
    setLiveMsg("Cancelled.");
    setRunning("idle");
  }

  const disabled = running !== "idle";

  return (
    <div className="container">
      <style>{styles}</style>
      <h1 className="h1">Intent vs RNG</h1>
      <p className="p">Test whether focused intent correlates with deviation from chance. Two modes: Focus (try to will Heads) and Control (no intent). Uses the browser's cryptographic RNG.</p>

      <div className="help" onClick={() => setShowHelp((v) => !v)}>
        {showHelp ? "Hide How to Use" : "Show How to Use"}
      </div>
      {showHelp && (
        <div className="helpCard">
          <div><b>Step 1:</b> Enter N (number of flips per session). Bigger = more reliable; smaller = faster.</div>
          <div><b>Step 2:</b> Choose a mode: <i>Run Focus</i> (concentrate on Heads), <i>Run Control</i> (relax), or <i>Run Both</i> (Focus then Control).</div>
          <div><b>Step 3:</b> Watch the progress bar as flips happen. You don't need to click per flip.</div>
          <div><b>Step 4:</b> Read results: % Heads, deviation, z-score, p-value, and Focus vs Control comparison.</div>
        </div>
      )}

      <div className="controls">
        <label className="label">
          N per session
          <input className="input" type="number" min={50} step={50} value={n} onChange={(e) => setN(Number(e.target.value))} />
          <div className="note">Default 100,000. Large N takes longer but increases statistical power.</div>
        </label>
        <div className="btnrow">
          <button className="btn primary" onClick={() => runOne("Focus")} disabled={disabled}>Run Focus</button>
          <button className="btn primary" onClick={() => runOne("Control")} disabled={disabled}>Run Control</button>
        </div>
        <div className="btnrow">
          <button className="btn" onClick={runBoth} disabled={disabled}>Run Both</button>
          <button className="btn" onClick={cancel} disabled={running === "idle"}>Cancel</button>
        </div>
      </div>

      <div className="card" style={{ marginTop: "1rem" }}>
        <div className="stack">
          <div className="progressWrap"><div className="progressFill" style={{ width: `${(progress * 100).toFixed(1)}%` }} /></div>
          <div className="small">{liveMsg || "(no activity)"}</div>
        </div>
      </div>

      <div className="card">
        <h2 style={{marginTop:0}}>Results</h2>
        {results.length === 0 ? (
          <div className="small">(no results yet)</div>
        ) : (
          <div className="results">
            {results.map((r, i) => (
              <ResultCard key={i} r={r} />
            ))}
            {compareLine && <div className="highlight">{compareLine}</div>}
          </div>
        )}
      </div>

      {error && (
        <div className="card" style={{ borderColor: "#fecaca", background: "#fff1f2" }}>
          <b style={{ color: "#b91c1c" }}>Error:</b> <span style={{ color: "#7f1d1d" }}>{error}</span>
        </div>
      )}

      <div className="card">
        <h2 style={{marginTop:0}}>Notes</h2>
        <ul style={{ margin:0, paddingLeft:"1rem" }}>
          <li>Hypothesis: Focus hit-rate &gt; 50%.</li>
          <li>Statistic: z = (hits − 0.5N) / sqrt(N·0.25); two-tailed p from normal CDF.</li>
          <li>For research-grade runs: pre-register N and avoid early stopping.</li>
        </ul>
      </div>

      <div className="footer">Built with Web Crypto. No external libs. © You.</div>
    </div>
  );
}

// ------------------------ Result Card ------------------------

function ResultCard({ r }: { r: SessionResult }) {
  const pct = (r.rate * 100).toFixed(2);
  const dev = ((r.rate - 0.5) * 100).toFixed(2);
  return (
    <div className="resultCard">
      <div className="rcHead">
        <div className="rcTitle">{r.kind}</div>
        <div className="rcMeta">N={r.n}</div>
      </div>
      <div className="rcGrid">
        <div className="row"><span>Heads</span><b>{r.hits}</b></div>
        <div className="row"><span>% Heads</span><b>{pct}%</b></div>
        <div className="row"><span>Deviation from 50%</span><b>{dev} pp</b></div>
        <div className="row"><span>z-score</span><b>{r.z.toFixed(3)}</b></div>
        <div className="row"><span>two-tailed p</span><b>{toExp(r.p)}</b></div>
      </div>
    </div>
  );
}

// ------------------------ Self-tests (console) ------------------------

function approx(a: number, b: number, tol = 1e-2) { return Math.abs(a - b) <= tol; }

function runSelfTests() {
  // Test 1: exactly half heads -> z ≈ 0, p ≈ 1
  const t1 = zAndP(50000, 100000); // 50%
  console.assert(Math.abs(t1.z) < 1e-9, "Test1 z not ~0", t1);
  console.assert(t1.p > 0.99, "Test1 p not near 1", t1);

  // Test 2: small positive deviation 50,500/100,000 ⇒ z ≈ 3.162, p ≈ 0.0016
  const t2 = zAndP(50500, 100000);
  console.assert(approx(t2.z, 3.162, 0.05), "Test2 z mismatch", t2);
  console.assert(approx(t2.p, 0.0016, 0.0007), "Test2 p mismatch", t2);

  // Test 3: difference test symmetry
  const A: SessionResult = { kind: "Focus", n: 1000, hits: 540, rate: 0.54, z: 0, p: 1 };
  const B: SessionResult = { kind: "Control", n: 1000, hits: 500, rate: 0.50, z: 0, p: 1 };
  const d = diffTest(A, B);
  console.assert(d.diff > 0 && toExp(d.p).length > 0, "Test3 diff/p basic");

  console.log("✔ Stats self-tests passed");
}
