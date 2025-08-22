import React, { useRef, useState } from "react";

// Intent vs RNG — single-file React component (JSX version)
// - Two modes: Focus (try to bias heads) and Control (no intent)
// - Cryptographic RNG via Web Crypto API with buffered bytes for speed
// - Live progress bar; final z-score and p-value (two-tailed)
// - Clean, minimal Tailwind UI

export default function App() {
  const [n, setN] = useState(100000); // default to 100k flips
  const [running, setRunning] = useState("idle"); // "idle" | "focus" | "control" | "both"
  const [liveMsg, setLiveMsg] = useState("");
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState([]); // array of session result objects
  const [compareLine, setCompareLine] = useState("");
  const [error, setError] = useState("");
  const cancelRef = useRef({ cancelled: false });
  const [showHelp, setShowHelp] = useState(false);

  function reset() {
    setResults([]);
    setCompareLine("");
    setProgress(0);
    setLiveMsg("");
    setError("");
    cancelRef.current.cancelled = false;
  }

  async function runOne(kind) {
    reset();
    const N = Math.max(50, n | 0);
    setRunning(kind === "Focus" ? "focus" : "control");
    try {
      const res = await runSession(kind, N, setProgress, setLiveMsg, cancelRef);
      setResults([res]);
    } catch (e) {
      setError(String(e && e.message ? e.message : e));
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
      setCompareLine(
        `Focus vs Control: Δ=${(cmp.diff * 100).toFixed(2)} pp, z=${cmp.z.toFixed(3)}, p=${toExp(cmp.p)}`
      );
    } catch (e) {
      setError(String(e && e.message ? e.message : e));
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
    <div className="min-h-screen bg-white text-gray-900 px-4 py-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight">Intent vs RNG</h1>
        <p className="mt-2 text-sm text-gray-600">
          Test whether focused intent correlates with deviation from chance. Two modes: Focus (try to will Heads) and Control (no
          intent). Uses the browser's cryptographic RNG.
        </p>

        <div className="mt-4">
          <button
            onClick={() => setShowHelp(!showHelp)}
            className="text-sm text-indigo-600 hover:underline"
          >
            {showHelp ? "Hide How to Use" : "Show How to Use"}
          </button>
          {showHelp && (
            <div className="mt-2 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-gray-700 space-y-2">
              <p><strong>Step 1:</strong> Enter <em>N</em> (number of flips per session). Larger N = more reliable, smaller N = faster.</p>
              <p><strong>Step 2:</strong> Choose a mode:</p>
              <ul className="list-disc pl-5">
                <li><em>Run Focus:</em> Concentrate on “Heads” with intent or visualization.</li>
                <li><em>Run Control:</em> Do nothing special—relax and let chance play out.</li>
                <li><em>Run Both:</em> Runs Focus then Control for direct comparison.</li>
              </ul>
              <p><strong>Step 3:</strong> Watch the progress bar as flips happen.</p>
              <p><strong>Step 4:</strong> Read results: % Heads, deviation, z-score, and p-value.</p>
              <p><strong>Note:</strong> You don’t click for each flip; your role is intent (Focus) or neutrality (Control).</p>
            </div>
          )}
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-[1fr_auto_auto_auto] items-end">
          <label className="text-sm">
            N per session
            <input
              type="number"
              min={50}
              step={50}
              value={n}
              onChange={(e) => setN(Number(e.target.value))}
              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>
          <div className="flex gap-2 sm:justify-end">
            <button onClick={() => runOne("Focus")} disabled={disabled} className={btn(disabled)}>
              Run Focus
            </button>
            <button onClick={() => runOne("Control")} disabled={disabled} className={btn(disabled)}>
              Run Control
            </button>
          </div>
          <div className="flex gap-2 sm:justify-end">
            <button onClick={runBoth} disabled={disabled} className={btn(disabled)}>
              Run Both
            </button>
            <button onClick={cancel} disabled={running === "idle"} className={btn(running === "idle")}>
              Cancel
            </button>
          </div>
        </div>

        <Card title="Live progress" className="mt-6">
          <div className="w-full h-3 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full bg-indigo-500 transition-[width] duration-100"
              style={{ width: `${(progress * 100).toFixed(1)}%` }}
            />
          </div>
          <p className="mt-2 text-sm text-gray-700">{liveMsg || "(no activity)"}</p>
        </Card>

        <Card title="Results" className="mt-4">
          {results.length === 0 ? (
            <p className="text-sm text-gray-500">(no results yet)</p>
          ) : (
            <div className="space-y-4">
              {results.map((r, i) => (
                <ResultBlock key={i} r={r} />
              ))}
              {compareLine && (
                <div className="rounded-xl bg-indigo-50 border border-indigo-200 px-4 py-3 text-sm">
                  {compareLine}
                </div>
              )}
            </div>
          )}
        </Card>

        {error && (
          <div className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        )}

        <Card title="Notes" className="mt-6">
          <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
            <li>Hypothesis: Focus hit-rate &gt; 50%.</li>
            <li>Statistic: z = (hits − 0.5N) / sqrt(N·0.25); two-tailed p from normal CDF.</li>
            <li>For research-grade runs: pre-register N and avoid early stopping.</li>
          </ul>
        </Card>

        <footer className="mt-8 text-xs text-gray-500">Built with Web Crypto. No external libs. © You.</footer>
      </div>
    </div>
  );
}

// UI pieces
function Card({ title, className, children }) {
  return (
    <div className={"rounded-2xl border border-gray-200 p-4 shadow-sm " + (className || "") }>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-medium">{title}</h2>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function ResultBlock({ r }) {
  const pct = (r.rate * 100).toFixed(2);
  const dev = ((r.rate - 0.5) * 100).toFixed(2);
  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">{r.kind}</div>
        <div className="text-xs text-gray-500">N={r.n}</div>
      </div>
      <div className="mt-2 text-sm">
        <div>Heads = {r.hits} ({pct}%)</div>
        <div>Deviation from 50% = {dev} pp</div>
        <div>z = {r.z.toFixed(3)}, two-tailed p = {toExp(r.p)}</div>
      </div>
    </div>
  );
}

// Stats helpers
function btn(disabled) {
  return `rounded-xl px-4 py-2 text-sm shadow-sm border ${
    disabled
      ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
      : "bg-white hover:bg-gray-50 text-gray-900 border-gray-300"
  }`;
}

function toExp(p) {
  if (!isFinite(p)) return String(p);
  return p.toExponential(3);
}

function diffTest(a, b) {
  // difference in proportions z-test
  const diff = a.rate - b.rate;
  const se = Math.sqrt((a.rate * (1 - a.rate)) / a.n + (b.rate * (1 - b.rate)) / b.n);
  const z = diff / se;
  const p = 2 * (1 - normalCdf(Math.abs(z)));
  return { diff, z, p };
}

async function runSession(kind, n, setProgress, setLive, cancelRef) {
  let hits = 0;
  const rng = makeBufferedRng();
  for (let i = 1; i <= n; i++) {
    hits += rng();
    if (i % 200 === 0 || i === n) { // throttle UI updates for performance
      setProgress(i / n);
      const rate = ((hits / i) * 100).toFixed(2);
      setLive(`${kind}: ${i}/${n} flips • Heads=${hits} (${rate}%)`);
      await nextTick();
      if (cancelRef.current.cancelled) throw new Error("Cancelled");
    }
  }
  const { z, p } = zAndP(hits, n);
  return { kind, n, hits, rate: hits / n, z, p };
}

function nextTick() {
  return new Promise((r) => setTimeout(r, 0));
}

// Buffered cryptographic RNG: returns 0 or 1 using low bit of bytes
function makeBufferedRng(chunkSize = 65536) {
  let buf = new Uint8Array(0);
  let idx = 0;
  function refill() {
    buf = new Uint8Array(chunkSize);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      crypto.getRandomValues(buf);
    } else {
      // fallback (non-crypto) if needed
      for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256);
    }
    idx = 0;
  }
  refill();
  return function flipBit() {
    if (idx >= buf.length) refill();
    const bit = buf[idx++] & 1;
    return bit;
  };
}

function zAndP(hits, n) {
  const z = (hits - 0.5 * n) / Math.sqrt(n * 0.25);
  const p = 2 * (1 - normalCdf(Math.abs(z)));
  return { z, p };
}

// Abramowitz & Stegun 7.1.26 approximation of normal CDF
function normalCdf(x) {
  const t = 1 / (1 + 0.2316419 * x);
  const d = Math.exp((-x * x) / 2) / Math.sqrt(2 * Math.PI);
  const poly =
    0.31938153 * t -
    0.356563782 * t ** 2 +
    1.781477937 * t ** 3 -
    1.821255978 * t ** 4 +
    1.330274429 * t ** 5;
  const phi = 1 - d * poly;
  return phi;
}