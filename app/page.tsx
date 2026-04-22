"use client";

import { useState } from "react";

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
  | "marketing"
  | "sales"
  | "business_development"
  | "product"
  | "engineering"
  | "data_ai_analytics"
  | "finance"
  | "hr"
  | "operations"
  | "consulting"
  | "legal_compliance"
  | "general_leadership"
  | "unknown";

type ConfidenceLevel = "high" | "medium" | "low";
type SeniorityLevel = "junior" | "mid" | "senior";

interface ExtractedProfile {
  candidateName: string;
  currentCompany: string;
  previousCompany: string;
  currentRole: string;
  yearsOfExperience: number;
  industry: string;
  seniorityLevel: SeniorityLevel;
  roleBucket: RoleBucket;
  confidenceLevel: ConfidenceLevel;
}

// ─── Known companies for matching ────────────────────────────────────────────

const KNOWN_COMPANIES = [
  "google", "microsoft", "amazon", "meta", "apple", "netflix", "flipkart",
  "swiggy", "zomato", "paytm", "phonepe", "razorpay", "freshworks", "zoho",
  "infosys", "tcs", "wipro", "hcl", "cognizant", "accenture", "deloitte",
  "kpmg", "ey", "pwc", "mckinsey", "bcg", "bain", "goldman sachs",
  "jp morgan", "morgan stanley", "deutsche bank", "deutsche telekom",
  "info edge", "naukri", "iimjobs", "unstop", "dare2compete",
  "uber", "ola", "byju", "unacademy", "vedantu", "meesho", "cred",
  "groww", "zerodha", "bharatpe", "policybazaar", "lenskart",
  "walmart", "adobe", "salesforce", "oracle", "ibm", "samsung", "intel",
  "qualcomm", "cisco", "vmware", "atlassian", "stripe", "shopify",
  "airbnb", "linkedin", "twitter", "snap", "spotify", "grab", "gojek",
  "ola", "makemytrip", "oyo", "dunzo", "urban company", "pharmeasy",
  "myntra", "ajio", "tata", "reliance", "mahindra", "hdfc", "icici",
  "axis bank", "kotak", "bajaj", "aditya birla", "godrej", "itc",
  "hindustan unilever", "nestle", "colgate", "procter & gamble", "p&g",
  "loreal", "mondelez", "pepsico", "coca-cola", "marico", "dabur",
  "emami", "britannia", "parle", "amul",
];

// ─── Role bucket keyword map with weights ────────────────────────────────────
// Each keyword has a weight. Multi-word phrases get higher weight because
// they are more specific and less likely to false-positive.

interface WeightedKeyword {
  term: string;
  weight: number;
}

const ROLE_BUCKET_KEYWORDS: Record<RoleBucket, WeightedKeyword[]> = {
  marketing: [
    { term: "performance marketing", weight: 5 },
    { term: "digital marketing", weight: 5 },
    { term: "employer branding", weight: 5 },
    { term: "marketing manager", weight: 4 },
    { term: "marketing director", weight: 4 },
    { term: "head of marketing", weight: 5 },
    { term: "marketing", weight: 2 },
    { term: "brand", weight: 2 },
    { term: "growth", weight: 1 },
    { term: "campaign", weight: 3 },
    { term: "seo", weight: 3 },
    { term: "content marketing", weight: 4 },
    { term: "social media", weight: 3 },
    { term: "advertising", weight: 2 },
    { term: "communications", weight: 2 },
    { term: "creative", weight: 1 },
    { term: "media planning", weight: 4 },
    { term: "demand generation", weight: 4 },
    { term: "brand manager", weight: 4 },
  ],
  sales: [
    { term: "institutional sales", weight: 5 },
    { term: "modern trade", weight: 5 },
    { term: "general trade", weight: 5 },
    { term: "account management", weight: 4 },
    { term: "key accounts", weight: 4 },
    { term: "sales manager", weight: 4 },
    { term: "sales director", weight: 4 },
    { term: "head of sales", weight: 5 },
    { term: "sales", weight: 2 },
    { term: "revenue", weight: 2 },
    { term: "gtm", weight: 3 },
    { term: "go to market", weight: 4 },
    { term: "quota", weight: 3 },
    { term: "territory", weight: 3 },
    { term: "channel sales", weight: 4 },
    { term: "enterprise sales", weight: 5 },
    { term: "inside sales", weight: 4 },
  ],
  business_development: [
    { term: "business development", weight: 5 },
    { term: "strategic accounts", weight: 5 },
    { term: "partnerships", weight: 3 },
    { term: "alliances", weight: 4 },
    { term: "strategic partnerships", weight: 5 },
    { term: "bd manager", weight: 4 },
    { term: "bd lead", weight: 4 },
    { term: "corporate development", weight: 5 },
    { term: "new business", weight: 3 },
  ],
  product: [
    { term: "product manager", weight: 5 },
    { term: "product lead", weight: 5 },
    { term: "product director", weight: 5 },
    { term: "head of product", weight: 5 },
    { term: "product strategy", weight: 5 },
    { term: "product management", weight: 5 },
    { term: "roadmap", weight: 3 },
    { term: "product owner", weight: 4 },
    { term: "product design", weight: 3 },
    { term: "ux research", weight: 3 },
  ],
  engineering: [
    { term: "engineering manager", weight: 5 },
    { term: "engineering lead", weight: 5 },
    { term: "head of engineering", weight: 5 },
    { term: "software engineer", weight: 5 },
    { term: "software developer", weight: 5 },
    { term: "backend engineer", weight: 5 },
    { term: "frontend engineer", weight: 5 },
    { term: "full stack", weight: 4 },
    { term: "fullstack", weight: 4 },
    { term: "platform engineer", weight: 5 },
    { term: "site reliability", weight: 5 },
    { term: "sre", weight: 4 },
    { term: "devops", weight: 4 },
    { term: "architect", weight: 3 },
    { term: "software", weight: 2 },
    { term: "engineer", weight: 2 },
    { term: "developer", weight: 2 },
    { term: "backend", weight: 3 },
    { term: "frontend", weight: 3 },
    { term: "infrastructure", weight: 3 },
    { term: "platform", weight: 2 },
    { term: "delivery", weight: 1 },
    { term: "technical lead", weight: 4 },
    { term: "tech lead", weight: 4 },
    { term: "principal engineer", weight: 5 },
    { term: "staff engineer", weight: 5 },
  ],
  data_ai_analytics: [
    { term: "data science", weight: 5 },
    { term: "data scientist", weight: 5 },
    { term: "machine learning", weight: 5 },
    { term: "deep learning", weight: 5 },
    { term: "artificial intelligence", weight: 5 },
    { term: "business intelligence", weight: 5 },
    { term: "data analyst", weight: 5 },
    { term: "data engineer", weight: 5 },
    { term: "analytics manager", weight: 5 },
    { term: "analytics", weight: 3 },
    { term: "data", weight: 1 },
    { term: "ml engineer", weight: 5 },
    { term: "nlp", weight: 4 },
    { term: "computer vision", weight: 5 },
    { term: "bi analyst", weight: 4 },
    { term: "ai", weight: 2 },
    { term: "ml", weight: 2 },
  ],
  finance: [
    { term: "fp&a", weight: 5 },
    { term: "financial planning", weight: 5 },
    { term: "controller", weight: 4 },
    { term: "treasury", weight: 4 },
    { term: "taxation", weight: 4 },
    { term: "chartered accountant", weight: 5 },
    { term: "finance manager", weight: 5 },
    { term: "finance director", weight: 5 },
    { term: "cfo", weight: 5 },
    { term: "finance", weight: 2 },
    { term: "accounts", weight: 2 },
    { term: "audit", weight: 3 },
    { term: "accounting", weight: 3 },
    { term: "financial", weight: 2 },
    { term: "investment banking", weight: 5 },
    { term: "private equity", weight: 5 },
    { term: "venture capital", weight: 5 },
    { term: "wealth management", weight: 4 },
  ],
  hr: [
    { term: "talent acquisition", weight: 5 },
    { term: "hrbp", weight: 5 },
    { term: "human resources", weight: 4 },
    { term: "recruitment", weight: 3 },
    { term: "learning and development", weight: 5 },
    { term: "l&d", weight: 4 },
    { term: "people operations", weight: 5 },
    { term: "people strategy", weight: 5 },
    { term: "head of hr", weight: 5 },
    { term: "hr manager", weight: 4 },
    { term: "hr director", weight: 4 },
    { term: "chro", weight: 5 },
    { term: "hr", weight: 2 },
    { term: "talent", weight: 2 },
    { term: "hiring", weight: 2 },
    { term: "employer branding", weight: 4 },
    { term: "org development", weight: 4 },
    { term: "compensation", weight: 3 },
    { term: "benefits", weight: 2 },
  ],
  operations: [
    { term: "supply chain", weight: 5 },
    { term: "process excellence", weight: 5 },
    { term: "fulfillment", weight: 4 },
    { term: "operations manager", weight: 4 },
    { term: "operations director", weight: 4 },
    { term: "head of operations", weight: 5 },
    { term: "operations", weight: 2 },
    { term: "logistics", weight: 3 },
    { term: "procurement", weight: 3 },
    { term: "warehouse", weight: 3 },
    { term: "lean", weight: 2 },
    { term: "six sigma", weight: 4 },
    { term: "process improvement", weight: 4 },
  ],
  consulting: [
    { term: "management consultant", weight: 5 },
    { term: "strategy consulting", weight: 5 },
    { term: "strategy consultant", weight: 5 },
    { term: "advisory", weight: 3 },
    { term: "consultant", weight: 2 },
    { term: "consulting", weight: 2 },
    { term: "engagement manager", weight: 4 },
    { term: "principal consultant", weight: 5 },
  ],
  legal_compliance: [
    { term: "company secretary", weight: 5 },
    { term: "legal counsel", weight: 5 },
    { term: "general counsel", weight: 5 },
    { term: "compliance officer", weight: 5 },
    { term: "compliance manager", weight: 5 },
    { term: "contracts", weight: 3 },
    { term: "governance", weight: 3 },
    { term: "legal", weight: 2 },
    { term: "compliance", weight: 2 },
    { term: "regulatory", weight: 3 },
    { term: "risk management", weight: 4 },
    { term: "internal audit", weight: 4 },
  ],
  general_leadership: [
    { term: "vice president", weight: 4 },
    { term: "senior vice president", weight: 5 },
    { term: "general manager", weight: 4 },
    { term: "managing director", weight: 4 },
    { term: "chief", weight: 3 },
    { term: "founder", weight: 3 },
    { term: "co-founder", weight: 3 },
    { term: "president", weight: 3 },
    { term: "vp", weight: 3 },
    { term: "svp", weight: 4 },
    { term: "evp", weight: 4 },
    { term: "avp", weight: 3 },
    { term: "director", weight: 2 },
    { term: "head", weight: 1 },
    { term: "leadership", weight: 2 },
    { term: "gm", weight: 3 },
    { term: "ceo", weight: 4 },
    { term: "coo", weight: 4 },
  ],
  unknown: [],
};

// ─── Weighted role bucket detection ──────────────────────────────────────────

function detectRoleBucket(
  currentRole: string,
  summary: string,
  snippets: string
): { bucket: RoleBucket; topScore: number; secondScore: number } {
  // Role title gets 3x weight, summary/snippets get 1x
  const roleText = currentRole.toLowerCase();
  const contextText = `${summary} ${snippets}`.toLowerCase();

  const scores: Record<string, number> = {};

  for (const [bucket, keywords] of Object.entries(ROLE_BUCKET_KEYWORDS)) {
    if (bucket === "unknown") continue;
    let score = 0;
    for (const { term, weight } of keywords) {
      // Count occurrences in role (3x multiplier) and context (1x)
      if (roleText.includes(term)) score += weight * 3;
      if (contextText.includes(term)) score += weight * 1;
    }
    scores[bucket] = score;
  }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const topBucket = sorted[0]?.[1] > 0 ? (sorted[0][0] as RoleBucket) : "unknown";
  const topScore = sorted[0]?.[1] ?? 0;
  const secondScore = sorted[1]?.[1] ?? 0;

  return { bucket: topBucket, topScore, secondScore };
}

// ─── Profile extraction ──────────────────────────────────────────────────────

function extractProfile(
  data: ParsedData,
  summary: string,
  results: SearchResult[]
): ExtractedProfile {
  const searchText = results
    .map((r) => `${r.title ?? ""} ${r.snippet ?? ""}`)
    .join(" ");
  const allText = `${summary} ${searchText}`;
  const allLower = allText.toLowerCase();

  const candidateName = data.name || "";

  // --- currentCompany ---
  let currentCompany = "";
  let companyFoundInSearch = false;
  if (data.company) {
    currentCompany = data.company;
    if (allLower.includes(data.company.toLowerCase())) {
      companyFoundInSearch = true;
    }
  } else {
    for (const c of KNOWN_COMPANIES) {
      if (allLower.includes(c)) {
        currentCompany = titleCase(c);
        companyFoundInSearch = true;
        break;
      }
    }
  }

  // --- previousCompany ---
  let previousCompany = "";
  const currentLower = currentCompany.toLowerCase();
  const prevPatterns = /(?:at|with|from|joined|worked at|formerly at|previously at|ex[- ]|moved from)\s+([A-Z][A-Za-z\s&.]+?)(?:\s*[-–,.|;]|\s+(?:as|where|in|for|and|to)\b)/g;
  let match: RegExpExecArray | null;
  while ((match = prevPatterns.exec(searchText)) !== null) {
    const found = match[1].trim();
    if (found.toLowerCase() !== currentLower && found.length > 2) {
      previousCompany = found;
      break;
    }
  }
  if (!previousCompany) {
    for (const c of KNOWN_COMPANIES) {
      if (allLower.includes(c) && c !== currentLower) {
        previousCompany = titleCase(c);
        break;
      }
    }
  }

  // --- currentRole ---
  let currentRole = "";
  let roleFoundInSearch = false;
  if (data.designation) {
    currentRole = data.designation;
    if (allLower.includes(data.designation.toLowerCase())) {
      roleFoundInSearch = true;
    }
  } else {
    const rolePatterns = [
      /(?:as|is|works as|working as)\s+(?:a\s+)?([A-Za-z\s]+?(?:manager|engineer|director|lead|analyst|developer|architect|consultant|specialist|head|officer|scientist|designer))/i,
    ];
    for (const pattern of rolePatterns) {
      const m = allText.match(pattern);
      if (m) {
        currentRole = m[1].trim();
        roleFoundInSearch = true;
        break;
      }
    }
  }

  // --- yearsOfExperience ---
  let yearsOfExperience = parseInt(data.experience, 10) || 0;
  if (!yearsOfExperience) {
    const expMatch = allText.match(
      /(\d{1,2})\+?\s*(?:years?|yrs?)\s*(?:of\s+)?(?:experience|exp)/i
    );
    if (expMatch) yearsOfExperience = parseInt(expMatch[1], 10);
  }

  // --- industry ---
  const industry = data.industry || "";

  // --- roleBucket via weighted matching ---
  const { bucket: roleBucket, topScore, secondScore } = detectRoleBucket(
    currentRole,
    summary,
    searchText
  );

  // --- seniorityLevel ---
  let seniorityLevel: SeniorityLevel = "mid";
  const roleLower = currentRole.toLowerCase();
  const seniorTitles = [
    "chief", "cto", "ceo", "cfo", "coo", "cmo", "cpo", "chro",
    "vp", "vice president", "svp", "evp", "avp",
    "director", "senior director",
    "head of", "head -",
    "founder", "co-founder", "partner",
    "managing director", "general manager", "president",
  ];
  const midTitles = [
    "senior manager", "engineering manager", "product manager",
    "manager", "lead", "tech lead", "team lead",
    "principal", "staff",
    "senior engineer", "senior analyst", "senior consultant", "senior developer",
  ];
  if (yearsOfExperience >= 12 || seniorTitles.some((kw) => roleLower.includes(kw))) {
    seniorityLevel = "senior";
  } else if (yearsOfExperience >= 5 || midTitles.some((kw) => roleLower.includes(kw))) {
    seniorityLevel = "mid";
  } else {
    seniorityLevel = "junior";
  }

  // --- confidenceLevel ---
  // high:   company + role + roleBucket all clearly found
  // medium: roleBucket found, but company or role partially unclear
  // low:    weak or conflicting signals
  let confidenceLevel: ConfidenceLevel = "low";
  const bucketClear = roleBucket !== "unknown" && topScore >= 6;
  const bucketAmbiguous = topScore > 0 && secondScore > 0 && topScore - secondScore < 4;

  if (bucketClear && companyFoundInSearch && roleFoundInSearch && !bucketAmbiguous) {
    confidenceLevel = "high";
  } else if (bucketClear && (companyFoundInSearch || roleFoundInSearch || currentCompany || currentRole)) {
    confidenceLevel = "medium";
  }
  // If signals are mixed (two buckets very close), reduce confidence
  if (bucketAmbiguous && confidenceLevel === "high") {
    confidenceLevel = "medium";
  }

  return {
    candidateName,
    currentCompany,
    previousCompany,
    currentRole,
    yearsOfExperience,
    industry,
    seniorityLevel,
    roleBucket,
    confidenceLevel,
  };
}

function titleCase(s: string): string {
  return s.split(" ").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}

// ─── Insight hook templates per role bucket ──────────────────────────────────

const INSIGHT_HOOKS: Record<RoleBucket, string> = {
  marketing:
    "Profiles with your background in marketing, brand, and growth are seeing strong demand right now, especially where leadership and scale-building experience matter.",
  sales:
    "Leaders with your background in sales and revenue-driving roles are seeing strong recruiter interest right now, especially in growth-focused businesses.",
  business_development:
    "Profiles with strong partnerships and business development exposure are in demand right now, especially where strategic growth and relationship-building matter.",
  product:
    "Product professionals with your kind of role exposure are seeing good demand right now, especially where strategy, execution, and cross-functional leadership come together.",
  engineering:
    "Engineering leaders with your background are seeing strong demand right now, especially in roles that combine technical depth with delivery and team leadership.",
  data_ai_analytics:
    "Professionals with strong data, analytics, or AI-oriented exposure are seeing strong demand right now, especially in roles tied to decision-making and business impact.",
  finance:
    "Senior finance professionals with exposure across business finance, governance, or compliance are seeing strong demand right now across organizations.",
  hr:
    "HR and talent professionals with your kind of background are seeing strong demand right now, especially in roles linked to hiring quality, people strategy, and org building.",
  operations:
    "Operations professionals with strong execution and process leadership experience are seeing solid demand right now across scaling organizations.",
  consulting:
    "Profiles with consulting and advisory exposure are seeing strong interest right now, especially where structured problem-solving and business judgment are valued.",
  legal_compliance:
    "Professionals with legal and compliance leadership exposure are seeing strong demand right now, especially in roles requiring governance and risk oversight.",
  general_leadership:
    "Leadership profiles with your kind of experience are seeing strong recruiter interest right now, especially for high-impact and strategic roles.",
  unknown:
    "Given your background, your profile appears relevant for strong mid-to-senior opportunity mapping, but a few details would be worth confirming.",
};

// ─── Calling script generation ───────────────────────────────────────────────

function buildCallingScript(data: ParsedData, results: SearchResult[], summary: string) {
  const p = extractProfile(data, summary, results);
  const name = p.candidateName || "[Name]";
  const isLowConfidence = p.confidenceLevel === "low";

  // --- Opening ---
  const opening = `Hi ${name}, this is [Your Name] calling from iimjobs. I'm part of the Career Advisory team.\nIs this a good time for a quick 2-minute conversation?`;

  // --- Personalized Context ---
  let context: string;
  const curLower = p.currentCompany.toLowerCase();
  const prevLower = p.previousCompany.toLowerCase();
  const isInfoEdgeUnstop =
    (curLower.includes("info edge") && prevLower.includes("unstop")) ||
    (curLower.includes("unstop") && prevLower.includes("info edge"));

  if (isLowConfidence) {
    // Conservative — don't assert specifics we're unsure about
    context = `I was going through your profile and it caught our attention${p.yearsOfExperience ? ` — with around ${p.yearsOfExperience} years of experience` : ""}. I wanted to have a quick conversation to understand your current role and career direction better.`;
  } else if (p.currentCompany && p.previousCompany && p.currentRole) {
    if (isInfoEdgeUnstop) {
      context = `I was going through your profile and noticed your move from ${p.previousCompany} to ${p.currentCompany} in a ${p.currentRole} role — that's a strong career progression within the edtech and jobs ecosystem.`;
    } else {
      context = `I was going through your profile and noticed your recent move to ${p.currentCompany} in a ${p.currentRole} role. I could also see your earlier experience with ${p.previousCompany}${p.yearsOfExperience ? ` and your broader background of around ${p.yearsOfExperience} years in ${p.industry || bucketToLabel(p.roleBucket)}` : ""}.`;
    }
  } else if (p.currentCompany && p.currentRole) {
    context = `I was going through your profile and noticed your role as ${p.currentRole} at ${p.currentCompany}${p.yearsOfExperience ? `, with around ${p.yearsOfExperience} years of experience in ${p.industry || bucketToLabel(p.roleBucket)}` : ""}.`;
  } else if (p.currentCompany) {
    context = `I was going through your profile and noticed your work at ${p.currentCompany}${p.yearsOfExperience ? ` — around ${p.yearsOfExperience} years in the ${p.industry || bucketToLabel(p.roleBucket)} space` : ""}.`;
  } else if (p.currentRole) {
    context = `I was going through your profile and noticed your background as ${p.currentRole}${p.yearsOfExperience ? ` with around ${p.yearsOfExperience} years of experience` : ""}.`;
  } else {
    context = `I was going through your profile and noticed your background${p.yearsOfExperience ? ` of around ${p.yearsOfExperience} years` : ""} in the ${p.industry || bucketToLabel(p.roleBucket)} space.`;
  }

  // --- Insight Hook ---
  const insightHook = INSIGHT_HOOKS[p.roleBucket];

  // --- Pitch ---
  const pitch =
    p.seniorityLevel === "senior"
      ? `We noticed your iimjobs profile may not reflect your latest career progression. For senior professionals, even small gaps in company, designation, or CTC details can reduce visibility with recruiters who are specifically searching for leadership profiles.`
      : `We noticed your iimjobs profile may not reflect your latest career details. An updated profile gets significantly better visibility with recruiters — even small updates to your current role, company, or CTC can make a real difference.`;

  // --- Questions ---
  const questions = [
    "Are you actively exploring, or just passively open to opportunities?",
    "Can I quickly confirm your current company and designation?",
    "What is your current CTC?",
    "Which locations would you prefer for your next move?",
    "What is your notice period?",
  ];

  // --- Closing ---
  const closing =
    p.seniorityLevel === "senior"
      ? `Perfect — that's all I needed. We'll make sure your profile reflects your latest details so you get better visibility for relevant leadership opportunities. Thanks for your time, ${name}!`
      : `Perfect — that's all I needed. We'll update your profile with these details so you start seeing more relevant opportunities. Thanks for your time, ${name}!`;

  return { opening, context, insightHook, pitch, questions, closing, profile: p };
}

function bucketToLabel(bucket: RoleBucket): string {
  const labels: Record<RoleBucket, string> = {
    marketing: "marketing",
    sales: "sales",
    business_development: "business development",
    product: "product management",
    engineering: "engineering",
    data_ai_analytics: "data & analytics",
    finance: "finance",
    hr: "human resources",
    operations: "operations",
    consulting: "consulting",
    legal_compliance: "legal & compliance",
    general_leadership: "leadership",
    unknown: "professional services",
  };
  return labels[bucket];
}

function ComparisonRow({
  label,
  inputValue,
  extractedValue,
}: {
  label: string;
  inputValue: string;
  extractedValue: string;
}) {
  const inputLower = (inputValue || "").toLowerCase().trim();
  const extractedLower = (extractedValue || "").toLowerCase().trim();
  const isMatch =
    inputLower !== "" &&
    extractedLower !== "" &&
    (extractedLower.includes(inputLower) || inputLower.includes(extractedLower));

  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-zinc-600 dark:text-zinc-400">
        {label}:{" "}
        <span className="font-medium text-zinc-900 dark:text-zinc-100">
          {inputValue || "—"}
        </span>
      </span>
      <span
        className={`text-sm font-medium px-3 py-1 rounded-full ${
          isMatch
            ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400"
            : "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400"
        }`}
      >
        {isMatch ? "Match" : "Mismatch"}
      </span>
    </div>
  );
}

export default function Home() {
  const [input, setInput] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [parsed, setParsed] = useState<ParsedData | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

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
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 py-10 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
          Calling Insights Dashboard
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-8">
          Paste candidate data below to generate search insights and a calling script.
        </p>

        {/* Input */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
            Paste Candidate Data
          </label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pragya Aggrawal | Deutsche Telekom | Engineering Manager | IT | 16 | 70"
            rows={2}
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        <button
          onClick={handleSearch}
          disabled={loading || !input.trim()}
          className="mb-10 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading ? "Generating..." : "Generate Insights"}
        </button>

        {searched && parsed && (
          <div className="space-y-6">
            {/* Section 1: Google Summary */}
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-6">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-3">
                Google Summary
              </h2>
              <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                {summary}
              </p>
            </div>

            {/* Section 2: Data Comparison */}
            {profile && (
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-6">
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
                  Data Comparison
                </h2>
                <div className="space-y-3">
                  <ComparisonRow
                    label="Company"
                    inputValue={parsed.company}
                    extractedValue={profile.currentCompany}
                  />
                  <ComparisonRow
                    label="Role"
                    inputValue={parsed.designation}
                    extractedValue={profile.currentRole}
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">
                      Detected Role Bucket
                    </span>
                    <span className="text-sm font-medium px-3 py-1 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                      {bucketToLabel(profile.roleBucket)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">
                      Confidence Level
                    </span>
                    <span
                      className={`text-sm font-medium px-3 py-1 rounded-full ${
                        profile.confidenceLevel === "high"
                          ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : profile.confidenceLevel === "medium"
                            ? "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                            : "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                      }`}
                    >
                      {profile.confidenceLevel}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Section 3: Calling Script */}
            {script && (
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-6">
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
                  Calling Script
                </h2>
                <div className="space-y-5 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                  <div>
                    <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
                      Opening
                    </h3>
                    <p className="whitespace-pre-line">{script.opening}</p>
                  </div>

                  <div>
                    <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
                      Context
                    </h3>
                    <p className="whitespace-pre-line">{script.context}</p>
                  </div>

                  <div>
                    <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
                      Insight Hook
                    </h3>
                    <p>{script.insightHook}</p>
                  </div>

                  <div>
                    <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
                      Pitch
                    </h3>
                    <p>{script.pitch}</p>
                  </div>

                  <div>
                    <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
                      Questions
                    </h3>
                    <ul className="list-disc list-inside space-y-1">
                      {script.questions.map((q, i) => (
                        <li key={i}>{q}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
                      Closing
                    </h3>
                    <p>{script.closing}</p>
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
