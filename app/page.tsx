"use client";

import { useState, useRef, useCallback } from "react";

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
    if (cleaned.length > 20) {
      lines.push(cleaned);
    }
  }

  return lines.join(" ");
}

// ─── Types ───────────────────────────────────────────────────────────────────

type RoleBucket =
  | "marketing" | "sales" | "business_development" | "product"
  | "engineering" | "data_ai_analytics" | "finance" | "hr"
  | "operations" | "consulting" | "legal_compliance"
  | "general_leadership" | "unknown";

type ConfidenceLevel = "high" | "medium" | "low";

interface ExtractedProfile {
  detectedName: string;
  detectedCompany: string | null;
  detectedRole: string | null;
  detectedExperience: number | null;
  roleBucket: RoleBucket;
  confidenceLevel: ConfidenceLevel;
  _previousCompany: string | null;
  // debug
  _rawCompany: string;
  _rawRole: string;
  _rawExperience: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function bucketToLabel(bucket: RoleBucket): string {
  const labels: Record<RoleBucket, string> = {
    marketing: "marketing", sales: "sales",
    business_development: "business development", product: "product management",
    engineering: "engineering", data_ai_analytics: "data & analytics",
    finance: "finance", hr: "human resources", operations: "operations",
    consulting: "consulting", legal_compliance: "legal & compliance",
    general_leadership: "leadership", unknown: "professional services",
  };
  return labels[bucket];
}

// ─── Light extraction from Google summary + snippets ─────────────────────────
// Simple, readable patterns. No over-engineering.

function buildFullText(summary: string, results: SearchResult[]): string {
  const snippets = results.map((r) => `${r.title ?? ""} ${r.snippet ?? ""}`);
  return [...snippets, summary].join(" ");
}

// Validate that a role string looks like an actual job title, not a broken fragment
function isValidRole(role: string): boolean {
  if (role.length < 4 || role.length > 80) return false;
  // Must contain at least 2 word characters in a row
  if (!/[a-zA-Z]{2,}/.test(role)) return false;
  // Reject single-letter prefixed junk like "C Marketing", "A Lead"
  if (/^[A-Z]\s/.test(role)) return false;
  // Reject if it's just generic filler
  const junk = ["the", "and", "for", "with", "from", "view", "see", "more", "about", "results", "page", "experience"];
  if (junk.includes(role.toLowerCase())) return false;
  return true;
}

interface LightExtraction {
  role: string | null;
  company: string | null;
  previousCompany: string | null;
  experience: number | null;
}

function lightExtract(text: string, data: ParsedData): LightExtraction {
  let role: string | null = null;
  let company: string | null = null;
  let previousCompany: string | null = null;
  let experience: number | null = null;

  // ── 1. "<Role> @ <Company>" ──
  const atSymbol = text.match(/([A-Za-z][A-Za-z&,\s/]+?)\s*@\s*([A-Za-z][A-Za-z0-9&.,\s]+?)(?:\s*[-–|;.\n]|$)/);
  if (atSymbol) {
    const r = atSymbol[1].trim();
    const c = atSymbol[2].trim();
    if (isValidRole(r) && c.length > 1) {
      role = r;
      company = c;
    }
  }

  // ── 2. "<Role> at <Company>" (only if not yet found) ──
  if (!role || !company) {
    const atWord = text.match(/([A-Za-z][A-Za-z&,\s/]{3,}?)\s+at\s+([A-Za-z][A-Za-z0-9&.,\s]+?)(?:\s*[-–|;.\n]|\s+(?:with|since|from|for|and|where)\b|$)/i);
    if (atWord) {
      const r = atWord[1].trim();
      const c = atWord[2].trim();
      const lastWord = r.toLowerCase().split(/\s+/).pop() || "";
      const badLastWords = ["look", "looking", "view", "see", "available", "results", "experience", "professional"];
      if (isValidRole(r) && c.length > 1 && !badLastWords.includes(lastWord)) {
        if (!role) role = r;
        if (!company) company = c;
      }
    }
  }

  // ── 3. If input company is clearly in the text → use it ──
  if (!company && data.company) {
    if (text.toLowerCase().includes(data.company.toLowerCase())) {
      company = data.company;
    }
  }

  // ── 4. If input role is clearly in the text → use it ──
  if (!role && data.designation) {
    if (text.toLowerCase().includes(data.designation.toLowerCase())) {
      role = data.designation;
    }
  }

  // ── 5. Fallback: trust user input (lowers confidence) ──
  if (!company && data.company) company = data.company;
  if (!role && data.designation && isValidRole(data.designation)) role = data.designation;

  // ── 6. "Ex-<Company>" or "formerly at <Company>" ──
  const exMatch = text.match(/(?:ex[-\s]|formerly\s+(?:at\s+)?|previously\s+(?:at\s+)?)([A-Za-z][A-Za-z0-9&.,\s]+?)(?:\s*[-–|;.\n,]|$)/i);
  if (exMatch) {
    const prev = exMatch[1].trim();
    if (prev.length > 1 && prev.toLowerCase() !== (company || "").toLowerCase()) {
      previousCompany = prev;
    }
  }

  // ── 7. Experience: "X years" or "X+ years" ──
  const expFromInput = parseInt(data.experience, 10);
  if (expFromInput > 0) {
    experience = expFromInput;
  } else {
    const expMatch = text.match(/(\d{1,2})\+?\s*(?:years?|yrs?)/i);
    if (expMatch) experience = parseInt(expMatch[1], 10);
  }

  // ── Final validation: if role looks broken, drop it ──
  if (role && !isValidRole(role)) role = null;

  return { role, company, previousCompany, experience };
}

// ─── Role bucket detection (weighted) ────────────────────────────────────────

interface WK { term: string; weight: number }

const ROLE_BUCKET_KEYWORDS: Record<RoleBucket, WK[]> = {
  marketing: [
    { term: "performance marketing", weight: 5 }, { term: "digital marketing", weight: 5 },
    { term: "employer branding", weight: 5 }, { term: "marketing manager", weight: 4 },
    { term: "head of marketing", weight: 5 }, { term: "marketing leader", weight: 5 },
    { term: "growth & marketing", weight: 5 }, { term: "marketing", weight: 2 },
    { term: "brand", weight: 2 }, { term: "growth", weight: 1 },
    { term: "campaign", weight: 3 }, { term: "seo", weight: 3 },
    { term: "content marketing", weight: 4 }, { term: "demand generation", weight: 4 },
  ],
  sales: [
    { term: "institutional sales", weight: 5 }, { term: "modern trade", weight: 5 },
    { term: "account management", weight: 4 }, { term: "sales manager", weight: 4 },
    { term: "head of sales", weight: 5 }, { term: "sales", weight: 2 },
    { term: "revenue", weight: 2 }, { term: "gtm", weight: 3 },
    { term: "enterprise sales", weight: 5 }, { term: "inside sales", weight: 4 },
  ],
  business_development: [
    { term: "business development", weight: 5 }, { term: "strategic accounts", weight: 5 },
    { term: "partnerships", weight: 3 }, { term: "alliances", weight: 4 },
    { term: "bd manager", weight: 4 }, { term: "bd lead", weight: 4 },
  ],
  product: [
    { term: "product manager", weight: 5 }, { term: "product lead", weight: 5 },
    { term: "head of product", weight: 5 }, { term: "product strategy", weight: 5 },
    { term: "product management", weight: 5 }, { term: "roadmap", weight: 3 },
    { term: "product owner", weight: 4 },
  ],
  engineering: [
    { term: "engineering manager", weight: 5 }, { term: "engineering lead", weight: 5 },
    { term: "head of engineering", weight: 5 }, { term: "software engineer", weight: 5 },
    { term: "software developer", weight: 5 }, { term: "backend", weight: 3 },
    { term: "frontend", weight: 3 }, { term: "fullstack", weight: 4 },
    { term: "devops", weight: 4 }, { term: "architect", weight: 3 },
    { term: "engineer", weight: 2 }, { term: "developer", weight: 2 },
    { term: "tech lead", weight: 4 }, { term: "principal engineer", weight: 5 },
    { term: "staff engineer", weight: 5 }, { term: "sre", weight: 4 },
  ],
  data_ai_analytics: [
    { term: "data science", weight: 5 }, { term: "data scientist", weight: 5 },
    { term: "machine learning", weight: 5 }, { term: "business intelligence", weight: 5 },
    { term: "data analyst", weight: 5 }, { term: "data engineer", weight: 5 },
    { term: "analytics", weight: 3 }, { term: "ml engineer", weight: 5 },
    { term: "ai", weight: 2 },
  ],
  finance: [
    { term: "fp&a", weight: 5 }, { term: "financial planning", weight: 5 },
    { term: "chartered accountant", weight: 5 }, { term: "finance manager", weight: 5 },
    { term: "cfo", weight: 5 }, { term: "finance", weight: 2 },
    { term: "audit", weight: 3 }, { term: "investment banking", weight: 5 },
  ],
  hr: [
    { term: "talent acquisition", weight: 5 }, { term: "hrbp", weight: 5 },
    { term: "human resources", weight: 4 }, { term: "recruitment", weight: 3 },
    { term: "learning and development", weight: 5 }, { term: "head of hr", weight: 5 },
    { term: "hr", weight: 2 }, { term: "people operations", weight: 5 },
  ],
  operations: [
    { term: "supply chain", weight: 5 }, { term: "process excellence", weight: 5 },
    { term: "operations manager", weight: 4 }, { term: "operations", weight: 2 },
    { term: "logistics", weight: 3 }, { term: "six sigma", weight: 4 },
  ],
  consulting: [
    { term: "management consultant", weight: 5 }, { term: "strategy consulting", weight: 5 },
    { term: "advisory", weight: 3 }, { term: "consultant", weight: 2 },
    { term: "engagement manager", weight: 4 },
  ],
  legal_compliance: [
    { term: "company secretary", weight: 5 }, { term: "legal counsel", weight: 5 },
    { term: "compliance officer", weight: 5 }, { term: "governance", weight: 3 },
    { term: "legal", weight: 2 }, { term: "compliance", weight: 2 },
  ],
  general_leadership: [
    { term: "vice president", weight: 4 }, { term: "senior vice president", weight: 5 },
    { term: "general manager", weight: 4 }, { term: "managing director", weight: 4 },
    { term: "founder", weight: 3 }, { term: "vp", weight: 3 },
    { term: "director", weight: 2 }, { term: "ceo", weight: 4 }, { term: "coo", weight: 4 },
  ],
  unknown: [],
};

function detectRoleBucket(
  roleText: string,
  contextText: string
): { bucket: RoleBucket; topScore: number; secondScore: number } {
  const r = roleText.toLowerCase();
  const c = contextText.toLowerCase();
  const scores: Record<string, number> = {};
  for (const [bucket, keywords] of Object.entries(ROLE_BUCKET_KEYWORDS)) {
    if (bucket === "unknown") continue;
    let score = 0;
    for (const { term, weight } of keywords) {
      if (r.includes(term)) score += weight * 3;
      if (c.includes(term)) score += weight;
    }
    scores[bucket] = score;
  }
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return {
    bucket: sorted[0]?.[1] > 0 ? (sorted[0][0] as RoleBucket) : "unknown",
    topScore: sorted[0]?.[1] ?? 0,
    secondScore: sorted[1]?.[1] ?? 0,
  };
}

// ─── Profile extraction (uses lightExtract) ─────────────────────────────────

function extractProfile(
  data: ParsedData,
  summary: string,
  results: SearchResult[]
): ExtractedProfile {
  const fullText = buildFullText(summary, results);
  const fullLower = fullText.toLowerCase();
  const ext = lightExtract(fullText, data);

  // Was it found in the actual Google text (not just from input)?
  const companyInText = ext.company
    ? fullLower.includes(ext.company.toLowerCase())
    : false;
  const roleInText = ext.role
    ? fullLower.includes(ext.role.toLowerCase())
    : false;

  // Role bucket
  const { bucket: roleBucket } = detectRoleBucket(
    ext.role || data.designation || "",
    fullText
  );

  // Confidence
  let confidenceLevel: ConfidenceLevel = "low";
  if (companyInText && roleInText) {
    confidenceLevel = "high";
  } else if (companyInText || roleInText) {
    confidenceLevel = "medium";
  }

  return {
    detectedName: data.name || "",
    detectedCompany: ext.company,
    detectedRole: ext.role,
    detectedExperience: ext.experience,
    roleBucket,
    confidenceLevel,
    _rawCompany: ext.company ?? "(null)",
    _rawRole: ext.role ?? "(null)",
    _rawExperience: ext.experience != null ? `${ext.experience} years` : "(null)",
    _previousCompany: ext.previousCompany,
  };
}

// ─── Calling script generation (dynamic, grounded, human) ────────────────────

function buildCallingScript(data: ParsedData, results: SearchResult[], summary: string) {
  const p = extractProfile(data, summary, results);
  const name = p.detectedName || "[Name]";
  const functionLabel = data.industry || bucketToLabel(p.roleBucket);

  // --- Opening ---
  const opening = `Hi ${name}, this is [Your Name] calling from iimjobs.\nIs this a good time for a quick 2-minute conversation?`;

  // --- Context ---
  let context: string;
  if (p.detectedRole && p.detectedCompany) {
    context = `I was going through your profile and noticed you're currently working as ${p.detectedRole} at ${p.detectedCompany}.`;
  } else if (p.detectedCompany) {
    context = `I was going through your profile and noticed your current association with ${p.detectedCompany}.`;
  } else if (p.detectedRole) {
    context = `I was going through your profile and noticed your background in ${p.detectedRole}.`;
  } else if (functionLabel !== "professional services") {
    context = `I was going through your profile and noticed your background in ${functionLabel}.`;
  } else {
    context = `I was going through your profile and wanted to understand your current role a bit better.`;
  }
  if (p.detectedExperience) {
    context += `\nWith around ${p.detectedExperience} years of experience, your profile falls into a strong demand segment.`;
  }

  // --- Insight (dynamic, based on detected function) ---
  let insight: string;
  const bucket = p.roleBucket;
  if (bucket === "marketing") {
    insight = "Leaders in marketing and growth roles are seeing strong demand right now.";
  } else if (bucket === "sales") {
    insight = "Sales and revenue leaders are seeing strong demand right now.";
  } else if (bucket === "product") {
    insight = "Product professionals are seeing strong demand right now.";
  } else if (bucket === "engineering") {
    insight = "Technology professionals are seeing strong demand right now.";
  } else if (bucket === "data_ai_analytics") {
    insight = "Data and analytics professionals are seeing strong demand right now.";
  } else if (bucket === "finance") {
    insight = "Finance professionals are seeing strong demand right now.";
  } else if (bucket === "hr") {
    insight = "HR and talent professionals are seeing strong demand right now.";
  } else if (bucket === "consulting") {
    insight = "Consulting and advisory professionals are seeing strong demand right now.";
  } else if (bucket === "operations") {
    insight = "Operations professionals are seeing strong demand right now.";
  } else if (bucket === "business_development") {
    insight = "Business development professionals are seeing strong demand right now.";
  } else if (bucket === "legal_compliance") {
    insight = "Legal and compliance professionals are seeing strong demand right now.";
  } else if (bucket === "general_leadership") {
    insight = "Leadership profiles are seeing strong recruiter interest right now.";
  } else {
    insight = "Profiles with your kind of experience are seeing strong demand right now.";
  }

  // --- Pitch ---
  const pitch = `We've seen that profiles like yours perform much better when current company, role, and recent experience are clearly updated. That improves visibility for the right opportunities.`;

  // --- Hook ---
  let hook: string;
  if (p.detectedCompany) {
    hook = `Given your current role at ${p.detectedCompany}, this could be a good time to explore the right next move, even if you're only passively open.`;
  } else {
    hook = `This could be a good time to explore the right next move, even if you're only passively open.`;
  }
  if (p._previousCompany) {
    hook += `\nI also noticed your earlier experience with ${p._previousCompany}, which adds strong depth to your profile.`;
  }

  // --- Questions ---
  const questions = [
    "Are you actively exploring or passively open?",
    "What's your current role and company?",
    "Current CTC?",
    "Preferred roles or locations?",
  ];

  // --- Closing ---
  const closing = `Perfect — that's all I needed. We'll make sure your profile reflects your latest details so you get better visibility for relevant opportunities. Thanks for your time, ${name}!`;

  return { opening, context, insight, pitch, hook, questions, closing, profile: p };
}

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

function getMatchStatus(
  inputVal: string,
  detectedVal: string | null
): TagStatus {
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

export default function Home() {
  const [input, setInput] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [parsed, setParsed] = useState<ParsedData | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const toggleVoice = useCallback(() => {
    // If already listening, stop
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
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          company: data.company,
          industry: data.industry,
          functionArea: data.designation,
        }),
      });
      const json = await res.json();
      const organic: SearchResult[] = (json.organic_results ?? [])
        .slice(0, 3)
        .map((r: Record<string, string>) => ({
          title: r.title ?? "",
          snippet: r.snippet ?? "",
        }));
      setResults(organic);
      setSearched(true);
    } catch {
      setResults([]);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  };

  const summary = searched && parsed ? buildSummary(parsed, results) : "";
  const script = searched && parsed ? buildCallingScript(parsed, results, summary) : null;
  const profile = script?.profile ?? null;

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
                  listening
                    ? "text-red-500"
                    : "text-gray-400 hover:text-gray-600"
                }`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-4 h-4"
                >
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
              {loading ? "Searching..." : "Search"}
            </button>
          </div>
          {(listening || voiceError) && (
            <div className="mt-1.5">
              {listening && (
                <span className="text-[12px] text-red-500 font-medium animate-pulse">
                  Listening...
                </span>
              )}
              {voiceError && (
                <span className="text-[12px] text-red-600">
                  {voiceError}
                </span>
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

            {/* ── Data Comparison ── */}
            {profile && (
              <div className="bg-white border border-gray-200 rounded p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[13px] font-semibold text-gray-800">
                    Data Comparison
                  </h3>
                  <span className="text-[10px] text-gray-400 uppercase tracking-wider">
                    Detected from Google
                  </span>
                </div>
                <div className="divide-y divide-gray-100">
                  {/* Company */}
                  <div className="flex items-center justify-between py-1.5">
                    <span className="text-[12px] text-gray-500 w-24">Company</span>
                    <span className="text-[12px] text-gray-800 flex-1">{parsed.company || "—"}</span>
                    <span className="text-[12px] text-gray-500 flex-1 text-right mr-2">
                      {profile.detectedCompany || "—"}
                    </span>
                    <StatusTag status={getMatchStatus(parsed.company, profile.detectedCompany)} />
                  </div>
                  {/* Role */}
                  <div className="flex items-center justify-between py-1.5">
                    <span className="text-[12px] text-gray-500 w-24">Role</span>
                    <span className="text-[12px] text-gray-800 flex-1">{parsed.designation || "—"}</span>
                    <span className="text-[12px] text-gray-500 flex-1 text-right mr-2">
                      {profile.detectedRole || "—"}
                    </span>
                    <StatusTag status={getMatchStatus(parsed.designation, profile.detectedRole)} />
                  </div>
                  {/* Role Bucket */}
                  <div className="flex items-center justify-between py-1.5">
                    <span className="text-[12px] text-gray-500 w-24">Role Bucket</span>
                    <span className="text-[12px] text-gray-800 flex-1">{bucketToLabel(profile.roleBucket)}</span>
                    <span className="text-[12px] text-gray-500 flex-1 text-right mr-2" />
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded border bg-blue-50 text-blue-700 border-blue-200">
                      detected
                    </span>
                  </div>
                  {/* Confidence */}
                  <div className="flex items-center justify-between py-1.5">
                    <span className="text-[12px] text-gray-500 w-24">Confidence</span>
                    <span className="text-[12px] text-gray-800 flex-1">{profile.confidenceLevel}</span>
                    <span className="text-[12px] text-gray-500 flex-1 text-right mr-2" />
                    <StatusTag
                      status={
                        profile.confidenceLevel === "high"
                          ? "match"
                          : profile.confidenceLevel === "medium"
                            ? "partial"
                            : "not_found"
                      }
                    />
                  </div>
                </div>
                {/* Debug fields */}
                <div className="mt-3 pt-3 border-t border-dashed border-gray-200">
                  <span className="text-[10px] text-gray-400 uppercase tracking-wider">Debug: Raw Extracted</span>
                  <div className="mt-1 space-y-0.5 text-[11px] text-gray-400 font-mono">
                    <div>company: {profile._rawCompany}</div>
                    <div>role: {profile._rawRole}</div>
                    <div>experience: {profile._rawExperience}</div>
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
                    <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                      Opening
                    </span>
                    <p className="mt-0.5">{script.opening}</p>
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                      Context
                    </span>
                    <p className="mt-0.5">{script.context}</p>
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                      Insight
                    </span>
                    <p className="mt-0.5">{script.insight}</p>
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                      Pitch
                    </span>
                    <p className="mt-0.5">{script.pitch}</p>
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                      Hook
                    </span>
                    <p className="mt-0.5">{script.hook}</p>
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                      Questions
                    </span>
                    <ul className="mt-0.5 space-y-0.5 list-disc list-inside">
                      {script.questions.map((q, i) => (
                        <li key={i}>{q}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                      Closing
                    </span>
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
