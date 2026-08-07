import type { SyntheticEdge } from "@/lib/planning/types";

export type SyntheticRoleTemplate = {
  id: string;
  code: string;
  name: string;
  role: string;
  subtitle?: string;
};

export const ROLE_DESCRIPTIONS: Record<string, string> = {
  RS: "Validates your assumptions against existing evidence and literature. Flags claims that need proof before you commit resources to building.",
  PM: "Analyses your feature scope, prioritisation logic, and timeline realism. Flags when you're trying to do too much in a single iteration.",
  GR: "Evaluates your acquisition loops and activation hypotheses. Identifies whether there's a repeatable path from signup to retained user.",
  BR: "Reviews whether your positioning is distinctive and your messaging is consistent. Flags generic claims that won't cut through the market.",
  CS: "Forecasts which parts of your product will generate the most support load. Identifies friction points before they become a queue of tickets.",
  FO: "Checks your cost model and margin assumptions. Flags infrastructure or operational costs that tend to blow up after you hit scale.",
  AN: "Reviews your instrumentation plan and KPI framework. Flags gaps where you won't have the data to know if something is working.",
  PV: "Checks your data collection and consent flows against minimisation principles. Flags risks before they become a compliance incident.",
  LO: "Reviews your contract readiness and policy coverage. Flags gaps that could stall partnerships or create liability down the line.",
  MD: "Evaluates your safety policy and escalation pathways. Flags what happens when user-generated content goes wrong before you have a process.",
  CN: "Reviews your onboarding copy and educational content for clarity and motivation. Flags where users will drop off because they don't understand.",
  AT: "Assesses your test coverage and release confidence strategy. Flags areas where a regression could ship undetected.",
  MB: "Reviews your design and UX decisions against real mobile constraints. Flags interactions that won't hold up on small screens or slow connections.",
  PT: "Evaluates your integration strategy and channel leverage opportunities. Flags missing agreements that could block a planned feature.",
  CM: "Reviews your community and ambassador strategy for retention and advocacy. Flags whether you're building community before you have product-market fit.",
  B2: "Examines the execution path and delivery sequencing of your idea. Flags where scope, dependencies, or team capacity could derail the build.",
  C2: "Challenges your core assumptions and surfaces blind spots you haven't considered. Flags where optimism is outrunning evidence.",
  U2: "Advocates for the end user's experience, friction points, and mental model. Flags where the product asks too much of someone new to it.",
};

export const EDGE_TYPE_OPTIONS: {
  type: SyntheticEdge["type"];
  label: string;
  description: string;
  color: string;
}[] = [
  {
    type: "tension",
    label: "Tension",
    description: "These two roles have structurally opposing mandates. Both agents receive the other's output framed as 'opposing position — push back.' The aggregator will surface the friction and propose a resolution.",
    color: "#f87171",
  },
  {
    type: "oversight",
    label: "Oversight",
    description: "The source role has formal authority to review the target role's work. The reviewer receives the target's output framed as 'work under your review' and is prompted to identify gaps, risks, or failures.",
    color: "#34d399",
  },
  {
    type: "amplification",
    label: "Amplification",
    description: "The source role's findings elevate and make concrete the target role's concerns. The target receives the source's output framed as 'amplified signal — weight this heavily.'",
    color: "#60a5fa",
  },
];

export const EXTRA_SYNTHETIC_ROLE_TEMPLATES: SyntheticRoleTemplate[] = [
  {
    id: "syn-extra-research",
    code: "RS",
    name: "Research",
    role: "Evidence gathering and source validation",
    subtitle: "evidence · assumptions · validation",
  },
  {
    id: "syn-extra-pm",
    code: "PM",
    name: "Product",
    role: "Scope prioritization and roadmap sequencing",
    subtitle: "scope · roadmap · prioritization",
  },
  {
    id: "syn-extra-growth",
    code: "GR",
    name: "Growth",
    role: "Acquisition loops and activation hypotheses",
    subtitle: "acquisition · retention · activation",
  },
  {
    id: "syn-extra-brand",
    code: "BR",
    name: "Brand",
    role: "Positioning narrative and messaging consistency",
    subtitle: "positioning · messaging · narrative",
  },
  {
    id: "syn-extra-support",
    code: "CS",
    name: "Support",
    role: "User issue patterns and service load forecasting",
    subtitle: "friction · tickets · service load",
  },
  {
    id: "syn-extra-finops",
    code: "FO",
    name: "FinOps",
    role: "Cost controls and margin sensitivity checks",
    subtitle: "costs · margins · budget risk",
  },
  {
    id: "syn-extra-analytics",
    code: "AN",
    name: "Analytics",
    role: "KPI framework and instrumentation quality",
    subtitle: "KPIs · metrics · instrumentation",
  },
  {
    id: "syn-extra-privacy",
    code: "PV",
    name: "Privacy",
    role: "Data minimization and consent boundaries",
    subtitle: "consent · compliance · GDPR",
  },
  {
    id: "syn-extra-legalops",
    code: "LO",
    name: "Legal Ops",
    role: "Policy updates and contract readiness",
    subtitle: "contracts · liability · policy",
  },
  {
    id: "syn-extra-moderation",
    code: "MD",
    name: "Moderation",
    role: "Safety policy and escalation pathways",
    subtitle: "safety · UGC · escalation",
  },
  {
    id: "syn-extra-content",
    code: "CN",
    name: "Content",
    role: "Educational copy and onboarding clarity",
    subtitle: "copy · onboarding · clarity",
  },
  {
    id: "syn-extra-qa-auto",
    code: "AT",
    name: "QA Automation",
    role: "Regression detection and release confidence",
    subtitle: "testing · regressions · release risk",
  },
  {
    id: "syn-extra-mobile",
    code: "MB",
    name: "Mobile",
    role: "Native UX constraints and performance tuning",
    subtitle: "mobile UX · performance · constraints",
  },
  {
    id: "syn-extra-partnerships",
    code: "PT",
    name: "Partnerships",
    role: "Ecosystem integrations and channel leverage",
    subtitle: "integrations · channels · alliances",
  },
  {
    id: "syn-extra-community",
    code: "CM",
    name: "Community",
    role: "Ambassador programs and retention circles",
    subtitle: "community · ambassadors · retention",
  },
  {
    id: "syn-extra-builder",
    code: "B2",
    name: "Builder",
    role: "Execution path and delivery sequencing",
    subtitle: "execution · delivery · dependencies",
  },
  {
    id: "syn-extra-critic",
    code: "C2",
    name: "Critic",
    role: "Challenges core assumptions and surfaces blind spots",
    subtitle: "assumptions · blind spots · risk",
  },
  {
    id: "syn-extra-user-advocate",
    code: "U2",
    name: "User Advocate",
    role: "User experience friction points and mental model alignment",
    subtitle: "UX · friction · mental model",
  },
];
