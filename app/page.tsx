"use client";

import { useState, useRef, useCallback } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SearchResult {
  title: string;
  snippet: string;
}

interface ParsedData {
  name: string;
  company: string;
  designation: string;
  industry: string;
  experience: string;
  ctc: string;
}

interface LLMExtraction {
  current_company: string | null;
  current_role: string | null;
  previous_company: string | null;
  years_of_experience: number | null;
  function: string | null;
  confidence: string;
}

interface CallingScript {
  opening: string;
  context: string;
  insight: string;
  pitch: string;
  hook: string;
  questions: string[];
  closing: string;
}

// ─── Input parsing ───────────────────────────────────────────────────────────

function parseInput(raw: string): ParsedData {
  const parts = raw.split("|").map((s) => s.trim());
  return {
    name: parts[0] ?? "",
    company: parts[1] ?? "",
    designation: parts[2] ?? "",
    industry: parts[3] ?? "",
    experience: parts[4] ?? "",
    ctc: parts[5] ?? "",
  };
}

// ─── Google summary builder ──────────────────────────────────────────────────

function buildSummary(data: ParsedData, results: SearchResult[]): string {
  const snippets = results
    .map((r) => r.snippet)
    .filter(Boolean)
    .slice(0, 3);

  if (snippets.length === 0) {
    return `No public information found for ${data.name}. The candidate may have a limited online presence or the name may be too common for accurate results.`;
  }

  const lines: string[] = [];
  lines.push(
    `${data.name} appears to be a professional in the ${data.industry || "technology"} space.`
  );

  for (const snippet of snippets) {
    const cleaned = snippet.replace(/\s+/g, " ").trim();
    if (cleaned.length > 20) lines.push(cleaned);
  }

  return lines.join(" ");
}

// ─── Calling script generation (uses only LLM extraction) ────────────────────

function buildCallingScript(
  name: string,
  ext: LLMExtraction,
  inputIndustry: string
): CallingScript {
  const displayName = name || "[Name]";
  const fn = ext.function || inputIndustry || null;

  // --- Opening ---
  const opening = `Hi ${displayName}, this is [Your Name] calling from iimjobs.\nIs this a good time for a quick 2-minute conversation?`;

  // --- Context ---
  let context: string;
  if (ext.current_role && ext.current_company) {
    context = `I was going through your profile and noticed you're currently working as ${ext.current_role} at ${ext.current_company}.`;
  } else if (ext.current_company) {
    context = `I was going through your profile and noticed your current association with ${ext.current_company}.`;
  } else if (fn) {
    context = `I was going through your profile and noticed your background in ${fn}.`;
  } else {
    context = `I was going through your profile and wanted to understand your current role a bit better.`;
  }
  if (ext.years_of_experience) {
    context += `\nWith around ${ext.years_of_experience} years of experience, your profile falls into a strong demand segment.`;
  }

  // --- Insight (dynamic by function) ---
  let insight: string;
  const f = (fn || "").toLowerCase();
  if (f.includes("marketing")) {
    insight = "Marketing and growth leaders are seeing strong demand right now.";
  } else if (f.includes("sales")) {
    insight = "Sales and revenue leaders are seeing strong demand right now.";
  } else if (f.includes("product")) {
    insight = "Product professionals are seeing strong demand right now.";
  } else if (f.includes("tech") || f.includes("engineering")) {
    insight = "Technology leaders are seeing strong demand right now.";
  } else if (f.includes("finance")) {
    insight = "Senior finance leaders like yourself are seeing strong demand right now.";
  } else if (f.includes("hr") || f.includes("human")) {
    insight = "HR and talent professionals are seeing strong demand right now.";
  } else if (f.includes("consulting") || f.includes("advisory")) {
    insight = "Consulting and advisory professionals are seeing strong demand right now.";
  } else if (f.includes("operations")) {
    insight = "Operations professionals are seeing strong demand right now.";
  } else if (f.includes("legal") || f.includes("compliance")) {
    insight = "Legal and compliance professionals are seeing strong demand right now.";
  } else if (f.includes("leadership")) {
    insight = "Leadership profiles are seeing strong recruiter interest right now.";
  } else {
    insight = "Profiles with your level of experience are seeing strong demand right now.";
  }

  // --- Pitch ---
  const pitch = `We've seen that profiles like yours perform significantly better when current company, role, and latest career progression are clearly updated.`;

  // --- Hook ---
  let hook: string;
  if (ext.current_company) {
    hook = `Given your current role at ${ext.current_company}, this could be a good time to explore the right next move.`;
  } else {
    hook = `This could be a good time to explore the right next move, even if you're only passively open.`;
  }
  if (ext.previous_company) {
    hook += `\nI also noticed your earlier experience with ${ext.previous_company}, which adds strong depth to your profile.`;
  }

  // --- Questions ---
  const questions = [
    "Are you actively exploring or passively open?",
    "What's your current role and company?",
    "Current CTC?",
    "Preferred roles or locations?",
  ];

  // --- Closing ---
  const closing = `Perfect — that's all I needed. We'll make sure your profile reflects your latest details so you get better visibility for relevant opportunities. Thanks for your time, ${displayName}!`;

  return { opening, context, insight, pitch, hook, questions, closing };
}

// ─── UI helpers ──────────────────────────────────────────────────────────────

const CATEGORY_LABELS = [
  "Marketing", "Sales", "Finance", "Consulting", "Product", "HR", "Analytics", "Tech",
];

type TagStatus = "match" | "mismatch" | "partial" | "not_found";

function StatusTag({ status }: { status: TagStatus }) {
  const styles: Record<TagStatus, string> = {
    match: "bg-green-100 text-green-800 border-green-200",
    mismatch: "bg-red-50 text-red-700 border-red-200",
    partial: "bg-yellow-50 text-yellow-700 border-yellow-200",
    not_found: "bg-gray-50 text-gray-500 border-gray-200",
  };
  const labels: Record<TagStatus, string> = {
    match: "Match", mismatch: "Mismatch", partial: "Partial", not_found: "Not Found",
  };
  return (
    <span className={`text-[11px] font-medium px-2 py-0.5 rounded border ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function getMatchStatus(inputVal: string, detectedVal: string | null): TagStatus {
  if (!detectedVal) return "not_found";
  const a = (inputVal || "").toLowerCase().trim();
  const b = detectedVal.toLowerCase().trim();
  if (!a) return "not_found";
  if (b.includes(a) || a.includes(b)) return "match";
  const aWords = a.split(/\s+/);
  const bWords = b.split(/\s+/);
  const overlap = aWords.some((w) => w.length > 2 && bWords.some((bw) => bw.includes(w)));
  return overlap ? "partial" : "mismatch";
}

function ConfidenceBadge({ level }: { level: string }) {
  const style =
    level === "high"
      ? "bg-green-100 text-green-800 border-green-200"
      : level === "medium"
        ? "bg-yellow-50 text-yellow-700 border-yellow-200"
        : "bg-gray-50 text-gray-500 border-gray-200";
  return (
    <span className={`text-[11px] font-medium px-2 py-0.5 rounded border ${style}`}>
      {level}
    </span>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function Home() {
  const [input, setInput] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [parsed, setParsed] = useState<ParsedData | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [summary, setSummary] = useState("");
  const [extraction, setExtraction] = useState<LLMExtraction | null>(null);
  const [script, setScript] = useState<CallingScript | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const toggleVoice = useCallback(() => {
    if (recognitionRef.current && listening) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }

    setVoiceError("");

    const SpeechRecognition =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceError("Voice search is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognitionRef.current = recognition;

    recognition.onstart = () => setListening(true);

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      if (transcript) setInput((prev) => (prev ? prev + " " + transcript : transcript));
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setListening(false);
      if (event.error === "not-allowed") {
        setVoiceError("Microphone access was denied.");
      } else if (event.error !== "aborted") {
        setVoiceError("Voice recognition error. Please try again.");
      }
    };

    recognition.onend = () => setListening(false);
    recognition.start();
  }, [listening]);

  const handleSearch = async () => {
    const data = parseInput(input);
    setParsed(data);
    setLoading(true);
    setSearched(false);
    setExtraction(null);
    setScript(null);
    setSummary("");

    try {
      // Step 1: Google search
      const searchRes = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          company: data.company,
          industry: data.industry,
          functionArea: data.designation,
        }),
      });
      const searchJson = await searchRes.json();
      const organic: SearchResult[] = (searchJson.organic_results ?? [])
        .slice(0, 3)
        .map((r: Record<string, string>) => ({
          title: r.title ?? "",
          snippet: r.snippet ?? "",
        }));
      setResults(organic);

      // Step 2: Build summary
      const summaryText = buildSummary(data, organic);
      setSummary(summaryText);

      // Step 3: LLM extraction
      const extractRes = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: summaryText }),
      });
      const ext: LLMExtraction = await extractRes.json();
      setExtraction(ext);

      // Step 4: Generate script from extraction
      const callingScript = buildCallingScript(data.name, ext, data.industry);
      setScript(callingScript);

      setSearched(true);
    } catch {
      setResults([]);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f5f5]">
      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 h-11 flex items-center justify-between">
          <span className="text-[15px] font-bold text-[#1a73e8] tracking-tight">
            iimjobs
          </span>
          <span className="text-[13px] text-gray-500 font-medium">
            Calling Insights
          </span>
        </div>
      </header>

      {/* ── Search Bar ── */}
      <div className="bg-white border-b border-gray-200 py-3">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex gap-2">
            <div className="flex-1 flex items-center border border-gray-300 rounded bg-white focus-within:border-[#1a73e8] focus-within:ring-1 focus-within:ring-[#1a73e8]">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && input.trim() && !loading) handleSearch();
                }}
                placeholder="Paste candidate data (Name | Company | Role | Function | Exp | CTC)"
                className="flex-1 h-9 px-3 text-[13px] text-gray-800 bg-transparent placeholder-gray-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={toggleVoice}
                title={listening ? "Stop listening" : "Voice search"}
                className={`h-9 w-9 flex items-center justify-center flex-shrink-0 transition-colors ${
                  listening ? "text-red-500" : "text-gray-400 hover:text-gray-600"
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path d="M12 1a4 4 0 0 0-4 4v6a4 4 0 0 0 8 0V5a4 4 0 0 0-4-4Z" />
                  <path d="M19 11a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.93V21H8a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2h-3v-3.07A7 7 0 0 0 19 11Z" />
                </svg>
              </button>
            </div>
            <button
              onClick={handleSearch}
              disabled={loading || !input.trim()}
              className="h-9 px-5 text-[13px] font-medium text-white bg-[#1a73e8] rounded hover:bg-[#1557b0] disabled:opacity-40"
            >
              {loading ? "Extracting..." : "Search"}
            </button>
          </div>
          {(listening || voiceError) && (
            <div className="mt-1.5">
              {listening && (
                <span className="text-[12px] text-red-500 font-medium animate-pulse">Listening...</span>
              )}
              {voiceError && (
                <span className="text-[12px] text-red-600">{voiceError}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Category Row ── */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 flex gap-1 py-1.5 overflow-x-auto">
          {CATEGORY_LABELS.map((cat) => (
            <span
              key={cat}
              className="text-[12px] text-gray-500 px-3 py-1 rounded hover:bg-gray-100 cursor-default whitespace-nowrap"
            >
              {cat}
            </span>
          ))}
        </div>
      </div>

      {/* ── Results ── */}
      <div className="max-w-5xl mx-auto px-4 py-4">
        {searched && parsed && (
          <div className="space-y-3">

            {/* ── Public Profile Insight ── */}
            <div className="bg-white border border-gray-200 rounded p-4">
              <h3 className="text-[13px] font-semibold text-gray-800 mb-1.5">
                Public Profile Insight
              </h3>
              <p className="text-[12.5px] leading-[1.6] text-gray-600">
                {summary}
              </p>
            </div>

            {/* ── Data Comparison (LLM extracted) ── */}
            {extraction && (
              <div className="bg-white border border-gray-200 rounded p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[13px] font-semibold text-gray-800">
                    Data Comparison
                  </h3>
                  <span className="text-[10px] text-gray-400 uppercase tracking-wider">
                    Extracted via LLM
                  </span>
                </div>
                <div className="divide-y divide-gray-100">
                  {/* Company */}
                  <div className="flex items-center justify-between py-1.5">
                    <span className="text-[12px] text-gray-500 w-24">Company</span>
                    <span className="text-[12px] text-gray-800 flex-1">{parsed.company || "—"}</span>
                    <span className="text-[12px] text-gray-500 flex-1 text-right mr-2">
                      {extraction.current_company || "—"}
                    </span>
                    <StatusTag status={getMatchStatus(parsed.company, extraction.current_company)} />
                  </div>
                  {/* Role */}
                  <div className="flex items-center justify-between py-1.5">
                    <span className="text-[12px] text-gray-500 w-24">Role</span>
                    <span className="text-[12px] text-gray-800 flex-1">{parsed.designation || "—"}</span>
                    <span className="text-[12px] text-gray-500 flex-1 text-right mr-2">
                      {extraction.current_role || "—"}
                    </span>
                    <StatusTag status={getMatchStatus(parsed.designation, extraction.current_role)} />
                  </div>
                  {/* Function */}
                  <div className="flex items-center justify-between py-1.5">
                    <span className="text-[12px] text-gray-500 w-24">Function</span>
                    <span className="text-[12px] text-gray-800 flex-1">{extraction.function || "—"}</span>
                    <span className="text-[12px] text-gray-500 flex-1 text-right mr-2" />
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded border bg-blue-50 text-blue-700 border-blue-200">
                      detected
                    </span>
                  </div>
                  {/* Confidence */}
                  <div className="flex items-center justify-between py-1.5">
                    <span className="text-[12px] text-gray-500 w-24">Confidence</span>
                    <span className="text-[12px] text-gray-800 flex-1">{extraction.confidence}</span>
                    <span className="text-[12px] text-gray-500 flex-1 text-right mr-2" />
                    <ConfidenceBadge level={extraction.confidence} />
                  </div>
                </div>

                {/* Debug: LLM extraction JSON */}
                <div className="mt-3 pt-3 border-t border-dashed border-gray-200">
                  <span className="text-[10px] text-gray-400 uppercase tracking-wider">Debug: LLM Extraction</span>
                  <div className="mt-1 space-y-0.5 text-[11px] text-gray-400 font-mono">
                    <div>current_company: {extraction.current_company ?? "null"}</div>
                    <div>current_role: {extraction.current_role ?? "null"}</div>
                    <div>previous_company: {extraction.previous_company ?? "null"}</div>
                    <div>years_of_experience: {extraction.years_of_experience ?? "null"}</div>
                    <div>function: {extraction.function ?? "null"}</div>
                    <div>confidence: {extraction.confidence}</div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Calling Script ── */}
            {script && (
              <div className="bg-white border border-gray-200 rounded p-4">
                <h3 className="text-[13px] font-semibold text-gray-800 mb-3">
                  Calling Script
                </h3>
                <div className="space-y-3 text-[12.5px] leading-[1.55] text-gray-700">
                  <div>
                    <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Opening</span>
                    <p className="mt-0.5 whitespace-pre-line">{script.opening}</p>
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Context</span>
                    <p className="mt-0.5 whitespace-pre-line">{script.context}</p>
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Insight</span>
                    <p className="mt-0.5">{script.insight}</p>
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Pitch</span>
                    <p className="mt-0.5">{script.pitch}</p>
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Hook</span>
                    <p className="mt-0.5 whitespace-pre-line">{script.hook}</p>
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Questions</span>
                    <ul className="mt-0.5 space-y-0.5 list-disc list-inside">
                      {script.questions.map((q, i) => (
                        <li key={i}>{q}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Closing</span>
                    <p className="mt-0.5">{script.closing}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
