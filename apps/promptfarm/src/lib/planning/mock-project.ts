import type { Project } from "./types"

export const MOCK_PROJECT: Project = {
  id: "project-sustainable-habit-tracker",
  title: "Sustainable Habit Tracker",
  idea: {
    id: "idea-sustainable-habit-tracker",
    text: "Build a lightweight app that helps people practice eco-friendly habits by showing visible personal and community impact, not just streaks.",
  },
  iterations: [
    {
      id: "revision-v1",
      version: "V1",
      summary: "Baseline impact-first concept",
      perspectives: {
        builder: {
          insight: "The base architecture is simple and feasible for an MVP.",
          concern: "Impact formulas are still coarse and could look arbitrary.",
          suggestion:
            "Keep the first release narrow: a few habit types with explicit formulas.",
        },
        critic: {
          insight: "The direction is understandable and emotionally relevant.",
          concern: "The core value may feel too abstract without concrete outcomes.",
          suggestion:
            "Tie each habit action to one immediate, easy-to-read metric.",
        },
        user: {
          insight: "The concept feels motivating and less guilt-driven than streak apps.",
          concern: "I might stop if logging takes more than a few taps.",
          suggestion: "Default common actions and reduce manual typing.",
        },
        investor: {
          insight: "There is room in the market for climate-positive daily tools.",
          concern: "Retention risk is high if feedback loops are weak.",
          suggestion: "Prioritize week-1 retention before broad acquisition.",
        },
      },
      input:
        "Draft a first product concept for a sustainable habit tracker that feels calm, visual, and useful in daily life.",
      output: {
        problem:
          "Most habit apps frame progress as personal productivity. For sustainability, users need to see how small actions connect to bigger environmental outcomes.",
        solution:
          "Create an impact-first habit tracker that translates daily actions into understandable metrics like CO2 saved, plastic avoided, and water preserved.",
        steps: [
          {
            id: "v1-step-impact-model",
            text: "Define the impact metric model for core habit actions.",
            normalized: "impact-model",
            status: "done",
          },
          {
            id: "v1-step-log-ui",
            text: "Design a low-friction habit logging flow with quantity inputs.",
            normalized: "habit-log-ui",
            status: "todo",
          },
          {
            id: "v1-step-grove-visualization",
            text: "Prototype a shared visual layer that grows as users complete habits.",
            normalized: "grove-visualization",
            status: "todo",
          },
        ],
        risks: [
          "Manual logging can create fatigue after the first week.",
          "Impact numbers can lose trust if the logic is not transparent.",
          "The concept may feel similar to existing streak trackers without a strong visual differentiator.",
        ],
      },
      graph: {
        coreProblem:
          "Most habit apps frame progress as personal productivity. For sustainability, users need to see how small actions connect to bigger environmental outcomes.",
        solution:
          "Create an impact-first habit tracker that translates daily actions into understandable metrics like CO2 saved, plastic avoided, and water preserved.",
        roadmap: [
          "Define the impact metric model for core habit actions.",
          "Design a low-friction habit logging flow with quantity inputs.",
          "Prototype a shared visual layer that grows as users complete habits.",
        ],
        risks: [
          "Manual logging can create fatigue after the first week.",
          "Impact numbers can lose trust if the logic is not transparent.",
          "The concept may feel similar to existing streak trackers without a strong visual differentiator.",
        ],
        synthetics: {
          active: [
            {
              id: "builder",
              name: "Builder",
              description: "Execution lens focused on scope, sequencing, and implementation risk.",
              enabled: true,
              settings: {
                temperature: 0.2,
                strictness: 82,
                engagementPercent: 70,
              },
            },
          ],
          available: [
            {
              id: "critic",
              name: "Critic",
              description: "Challenge lens that stress-tests assumptions and hidden failure modes.",
              enabled: false,
              settings: {
                temperature: 0.35,
                strictness: 88,
                engagementPercent: 66,
              },
            },
            {
              id: "user",
              name: "User",
              description: "Experience lens prioritizing clarity, trust, and daily usability.",
              enabled: false,
              settings: {
                temperature: 0.5,
                strictness: 58,
                engagementPercent: 82,
              },
            },
            {
              id: "investor",
              name: "Investor",
              description: "Outcome lens centered on retention, defensibility, and growth risk.",
              enabled: false,
              settings: {
                temperature: 0.3,
                strictness: 74,
                engagementPercent: 60,
              },
            },
          ],
        },
      },
      graphRevision: {
        id: "graph-revision-v1",
        version: "V1",
        summary: "Baseline impact-first concept",
        ideaText:
          "Build a lightweight app that helps people practice eco-friendly habits by showing visible personal and community impact.",
        mode: "auto",
        run: {
          id: "run-v1-proposal",
          stage: "review",
          proposedSynthetics: [],
          activeSynthetics: [
            {
              id: "syn-v1-cto",
              code: "CT",
              name: "CTO",
              role: "Architecture and compliance execution lead",
              status: "active",
              layout: { x: 300, y: 200 },
              config: {
                enabled: true,
                temperature: 0.23,
                strictness: 86,
                engagementPercent: 74,
              },
            },
            {
              id: "syn-v1-mgr",
              code: "MG",
              name: "Manager",
              role: "Cross-functional planning and timeline owner",
              status: "active",
              layout: { x: 580, y: 200 },
              config: {
                enabled: true,
                temperature: 0.28,
                strictness: 80,
                engagementPercent: 70,
              },
            },
            {
              id: "syn-v1-cfo",
              code: "CF",
              name: "CFO",
              role: "Budget and viability challenger",
              status: "conflict",
              layout: { x: 780, y: 200 },
              config: {
                enabled: true,
                temperature: 0.21,
                strictness: 91,
                engagementPercent: 62,
              },
            },
            {
              id: "syn-v1-legal",
              code: "LG",
              name: "Legal",
              role: "Regulatory and contract constraints",
              status: "active",
              layout: { x: 980, y: 200 },
              config: {
                enabled: true,
                temperature: 0.19,
                strictness: 90,
                engagementPercent: 58,
              },
            },
            {
              id: "syn-v1-comp",
              code: "CP",
              name: "Compliance",
              role: "Audit and control boundary specialist",
              status: "conflict",
              layout: { x: 200, y: 360 },
              config: {
                enabled: true,
                temperature: 0.16,
                strictness: 93,
                engagementPercent: 55,
              },
            },
            {
              id: "syn-v1-sec",
              code: "SC",
              name: "Security",
              role: "Threat and platform-hardening owner",
              status: "active",
              layout: { x: 400, y: 360 },
              config: {
                enabled: true,
                temperature: 0.25,
                strictness: 88,
                engagementPercent: 67,
              },
            },
            {
              id: "syn-v1-mkt",
              code: "MK",
              name: "Marketing",
              role: "Positioning and launch narrative lead",
              status: "conflict",
              layout: { x: 640, y: 360 },
              config: {
                enabled: true,
                temperature: 0.45,
                strictness: 69,
                engagementPercent: 77,
              },
            },
            {
              id: "syn-v1-dsg",
              code: "DS",
              name: "Designer",
              role: "UX and communication clarity specialist",
              status: "done",
              layout: { x: 840, y: 360 },
              config: {
                enabled: true,
                temperature: 0.4,
                strictness: 63,
                engagementPercent: 75,
              },
            },
            {
              id: "syn-v1-dat",
              code: "DE",
              name: "Data Eng",
              role: "Data and event pipeline execution",
              status: "blocked",
              layout: { x: 1020, y: 360 },
              config: {
                enabled: true,
                temperature: 0.27,
                strictness: 85,
                engagementPercent: 65,
              },
            },
            {
              id: "syn-v1-dev",
              code: "DV",
              name: "Developer",
              role: "Core implementation and integration owner",
              status: "thinking",
              layout: { x: 380, y: 520 },
              config: {
                enabled: true,
                temperature: 0.31,
                strictness: 78,
                engagementPercent: 72,
              },
            },
            {
              id: "syn-v1-ops",
              code: "DO",
              name: "DevOps",
              role: "Infrastructure, release, and reliability lead",
              status: "blocked",
              layout: { x: 640, y: 520 },
              config: {
                enabled: true,
                temperature: 0.26,
                strictness: 87,
                engagementPercent: 61,
              },
            },
            {
              id: "syn-v1-dsgeu",
              code: "EU",
              name: "Design EU",
              role: "Regional UX adaptation and localization",
              status: "done",
              layout: { x: 880, y: 520 },
              config: {
                enabled: true,
                temperature: 0.34,
                strictness: 66,
                engagementPercent: 73,
              },
            },
            {
              id: "syn-v1-mkteu",
              code: "ME",
              name: "Mkt EU",
              role: "Regional launch and channel adaptation",
              status: "blocked",
              layout: { x: 1060, y: 480 },
              config: {
                enabled: true,
                temperature: 0.42,
                strictness: 64,
                engagementPercent: 76,
              },
            },
            {
              id: "syn-v1-qa",
              code: "QA",
              name: "QA Lead",
              role: "Verification and release confidence",
              status: "thinking",
              layout: { x: 280, y: 670 },
              config: {
                enabled: true,
                temperature: 0.2,
                strictness: 89,
                engagementPercent: 59,
              },
            },
            {
              id: "syn-v1-qaeu",
              code: "QE",
              name: "QA EU",
              role: "Regional test readiness and release checks",
              status: "blocked",
              layout: { x: 560, y: 670 },
              config: {
                enabled: true,
                temperature: 0.22,
                strictness: 87,
                engagementPercent: 57,
              },
            },
          ],
          edges: [
            {
              id: "edge-v1-idea-cto",
              from: "idea",
              to: "syn-v1-cto",
              type: "structural",
            },
            {
              id: "edge-v1-idea-mgr",
              from: "idea",
              to: "syn-v1-mgr",
              type: "structural",
            },
            {
              id: "edge-v1-idea-cfo",
              from: "idea",
              to: "syn-v1-cfo",
              type: "structural",
            },
            {
              id: "edge-v1-idea-legal",
              from: "idea",
              to: "syn-v1-legal",
              type: "structural",
            },
            {
              id: "edge-v1-cto-sec",
              from: "syn-v1-cto",
              to: "syn-v1-sec",
              type: "structural",
            },
            {
              id: "edge-v1-legal-comp",
              from: "syn-v1-legal",
              to: "syn-v1-comp",
              type: "structural",
            },
            {
              id: "edge-v1-mgr-dsg",
              from: "syn-v1-mgr",
              to: "syn-v1-dsg",
              type: "structural",
            },
            {
              id: "edge-v1-mgr-mkt",
              from: "syn-v1-mgr",
              to: "syn-v1-mkt",
              type: "structural",
            },
            {
              id: "edge-v1-mgr-ops",
              from: "syn-v1-mgr",
              to: "syn-v1-ops",
              type: "structural",
            },
            {
              id: "edge-v1-cfo-mkt",
              from: "syn-v1-cfo",
              to: "syn-v1-mkt",
              type: "structural",
            },
            {
              id: "edge-v1-cfo-cto-conflict",
              from: "syn-v1-cfo",
              to: "syn-v1-cto",
              type: "tension",
            },
            {
              id: "edge-v1-cfo-mkt-conflict",
              from: "syn-v1-cfo",
              to: "syn-v1-mkt",
              type: "tension",
            },
            {
              id: "edge-v1-comp-mgr-conflict",
              from: "syn-v1-comp",
              to: "syn-v1-mgr",
              type: "tension",
            },
            {
              id: "edge-v1-sec-dat",
              from: "syn-v1-sec",
              to: "syn-v1-dat",
              type: "structural",
            },
            {
              id: "edge-v1-sec-dev",
              from: "syn-v1-sec",
              to: "syn-v1-dev",
              type: "structural",
            },
            {
              id: "edge-v1-sec-ops",
              from: "syn-v1-sec",
              to: "syn-v1-ops",
              type: "structural",
            },
            {
              id: "edge-v1-comp-dev",
              from: "syn-v1-comp",
              to: "syn-v1-dev",
              type: "structural",
            },
            {
              id: "edge-v1-dat-dev",
              from: "syn-v1-dat",
              to: "syn-v1-dev",
              type: "structural",
            },
            {
              id: "edge-v1-dsg-dsgeu",
              from: "syn-v1-dsg",
              to: "syn-v1-dsgeu",
              type: "oversight",
            },
            {
              id: "edge-v1-mkt-mkteu",
              from: "syn-v1-mkt",
              to: "syn-v1-mkteu",
              type: "structural",
            },
            {
              id: "edge-v1-dsgeu-qaeu",
              from: "syn-v1-dsgeu",
              to: "syn-v1-qaeu",
              type: "oversight",
            },
            {
              id: "edge-v1-mkteu-qaeu",
              from: "syn-v1-mkteu",
              to: "syn-v1-qaeu",
              type: "structural",
            },
            {
              id: "edge-v1-dev-qa",
              from: "syn-v1-dev",
              to: "syn-v1-qa",
              type: "structural",
            },
            {
              id: "edge-v1-sec-qa",
              from: "syn-v1-sec",
              to: "syn-v1-qa",
              type: "structural",
            },
            {
              id: "edge-v1-ops-qaeu",
              from: "syn-v1-ops",
              to: "syn-v1-qaeu",
              type: "structural",
            },
            {
              id: "edge-v1-dev-qaeu",
              from: "syn-v1-dev",
              to: "syn-v1-qaeu",
              type: "structural",
            },
            {
              id: "edge-v1-qa-outcome",
              from: "syn-v1-qa",
              to: "outcome",
              type: "structural",
            },
            {
              id: "edge-v1-qaeu-outcome",
              from: "syn-v1-qaeu",
              to: "outcome",
              type: "structural",
            },
            {
              id: "edge-v1-cfo-outcome",
              from: "syn-v1-cfo",
              to: "outcome",
              type: "structural",
            },
            {
              id: "edge-v1-mgr-outcome",
              from: "syn-v1-mgr",
              to: "outcome",
              type: "structural",
            },
          ],
          transcript: [],
          incorporationBlock: {
            baseText:
              "Impact-first sustainable habit tracker with transparent metrics.",
            addedContext: [],
            currentText:
              "Impact-first sustainable habit tracker with transparent metrics.",
          },
        },
      },
      createdAt: "2026-03-22T10:15:00.000Z",
    },
    {
      id: "revision-v2",
      version: "V2",
      summary: "Retention and trust-focused core revision",
      parentId: "revision-v1",
      perspectives: {
        builder: {
          insight: "The flow now has clearer modules for trust and retention.",
          concern:
            "Assumption docs and UI copy can drift if they are edited separately.",
          suggestion:
            "Reference one canonical assumptions source inside all revision surfaces.",
        },
        critic: {
          insight:
            "The product story is stronger because transparency is now explicit.",
          concern:
            "Complexity may grow too fast and weaken the calm UX direction.",
          suggestion:
            "Stage advanced details progressively instead of front-loading them.",
        },
        user: {
          insight: "I can see why my actions matter, which improves motivation.",
          concern: "Too many setup steps still feel heavy in first session.",
          suggestion: "Use guided defaults and reveal advanced options later.",
        },
        investor: {
          insight: "The trust layer improves long-term defensibility.",
          concern: "Unit economics remain unclear during early scaling.",
          suggestion: "Measure retention lift before increasing paid channels.",
        },
      },
      input:
        "Refine the concept to improve retention, make impact data explainable, and add a clearer path from solo habits to community momentum.",
      output: {
        problem:
          "People start with motivation but drop off when the app feels repetitive or when impact claims are hard to verify.",
        solution:
          "Use progressive prompts, transparent metric explanations, and a community grove view so users see both personal consistency and collective progress.",
        steps: [
          {
            id: "v2-step-impact-model",
            text: "Publish assumptions and formulas behind each environmental metric.",
            normalized: "impact-model",
            status: "done",
          },
          {
            id: "v2-step-log-ui",
            text: "Add smart defaults so frequent actions can be logged in two taps.",
            normalized: "habit-log-ui",
            status: "done",
          },
          {
            id: "v2-step-grove-visualization",
            text: "Ship a shared grove scene with milestone events and weekly summaries.",
            normalized: "grove-visualization",
            status: "todo",
          },
          {
            id: "v2-step-beta-loop",
            text: "Run a closed beta with weekly retention and trust feedback reviews.",
            normalized: "beta-loop",
            status: "todo",
          },
        ],
        risks: [
          "Metric transparency work can increase product complexity.",
          "Community features require moderation safeguards early.",
          "Retention can still drop if onboarding asks for too many settings.",
        ],
      },
      hasPlan: true,
      plan: {
        orderedSteps: [
          "v2-step-impact-model",
          "v2-step-log-ui",
          "v2-step-grove-visualization",
          "v2-step-beta-loop",
        ],
        dependencies: [
          { from: "v2-step-impact-model", to: "v2-step-log-ui" },
          { from: "v2-step-impact-model", to: "v2-step-grove-visualization" },
          { from: "v2-step-log-ui", to: "v2-step-beta-loop" },
          { from: "v2-step-grove-visualization", to: "v2-step-beta-loop" },
        ],
      },
      timeline: {
        totalDuration: "10 weeks",
        phases: [
          {
            id: "v2-phase-foundation",
            name: "Foundation",
            goal: "Lock transparent metric rules for launch metrics.",
            steps: ["v2-step-impact-model"],
            duration: "2 weeks",
            status: "completed",
          },
          {
            id: "v2-phase-build",
            name: "MVP Build",
            goal: "Ship fast logging and first grove prototype.",
            steps: ["v2-step-log-ui", "v2-step-grove-visualization"],
            duration: "5 weeks",
            status: "active",
          },
          {
            id: "v2-phase-validation",
            name: "Validation",
            goal: "Test retention and trust assumptions with pilot users.",
            steps: ["v2-step-beta-loop"],
            duration: "3 weeks",
            status: "locked",
          },
        ],
      },
      graph: {
        coreProblem:
          "People start with motivation but drop off when the app feels repetitive or when impact claims are hard to verify.",
        solution:
          "Use progressive prompts, transparent metric explanations, and a community grove view so users see both personal consistency and collective progress.",
        roadmap: [
          "Publish assumptions and formulas behind each environmental metric.",
          "Add smart defaults so frequent actions can be logged in two taps.",
          "Ship a shared grove scene with milestone events and weekly summaries.",
          "Run a closed beta with weekly retention and trust feedback reviews.",
        ],
        risks: [
          "Metric transparency work can increase product complexity.",
          "Community features require moderation safeguards early.",
          "Retention can still drop if onboarding asks for too many settings.",
        ],
        synthetics: {
          active: [
            {
              id: "builder",
              name: "Builder",
              description: "Execution lens focused on scope, sequencing, and implementation risk.",
              enabled: true,
              settings: {
                temperature: 0.2,
                strictness: 84,
                engagementPercent: 72,
              },
            },
            {
              id: "critic",
              name: "Critic",
              description: "Challenge lens that stress-tests assumptions and hidden failure modes.",
              enabled: true,
              settings: {
                temperature: 0.35,
                strictness: 90,
                engagementPercent: 69,
              },
            },
          ],
          available: [
            {
              id: "user",
              name: "User",
              description: "Experience lens prioritizing clarity, trust, and daily usability.",
              enabled: false,
              settings: {
                temperature: 0.5,
                strictness: 62,
                engagementPercent: 85,
              },
            },
            {
              id: "investor",
              name: "Investor",
              description: "Outcome lens centered on retention, defensibility, and growth risk.",
              enabled: false,
              settings: {
                temperature: 0.28,
                strictness: 76,
                engagementPercent: 61,
              },
            },
          ],
        },
      },
      graphRevision: {
        id: "graph-revision-v2",
        version: "V2",
        summary: "Retention and trust-focused core revision",
        ideaText:
          "Refine the concept to improve retention, make impact data explainable, and add a path from solo habits to community momentum.",
        mode: "manual",
        run: {
          id: "run-v2-review",
          stage: "review",
          proposedSynthetics: [
            {
              id: "syn-v2-investor",
              code: "I2",
              name: "Investor",
              role: "Commercial viability and scale guardrails",
              status: "proposed",
              layout: { x: 700, y: 300 },
              config: {
                enabled: false,
                temperature: 0.28,
                strictness: 76,
                engagementPercent: 61,
              },
            },
          ],
          activeSynthetics: [
            {
              id: "syn-v2-builder",
              code: "B2",
              name: "Builder",
              role: "System architect for scope and execution",
              status: "done",
              layout: { x: 240, y: 120 },
              opinion: {
                summary: "Execution path is feasible with staged rollout.",
                details:
                  "Transparent formulas and two-tap logging are realistic if grove milestones are shipped after the core trust loop.",
                recommendation:
                  "Lock formula docs first, then ship simplified logging before community expansion.",
              },
              followUps: [
                {
                  id: "fu-v2-builder-1",
                  question: "Should moderation be in MVP or phase two?",
                  userReply: "Phase two with clear safeguards defined now.",
                  adjustment:
                    "Moved moderation tooling to validation phase while keeping policy scaffolding.",
                },
              ],
              config: {
                enabled: true,
                temperature: 0.2,
                strictness: 84,
                engagementPercent: 72,
              },
            },
            {
              id: "syn-v2-critic",
              code: "C2",
              name: "Critic",
              role: "Risk challenger for assumptions and blind spots",
              status: "conflict",
              layout: { x: 540, y: 120 },
              opinion: {
                summary: "Complexity could still exceed the calm UX promise.",
                details:
                  "Users may be overwhelmed if transparency, onboarding, and social context appear simultaneously in first session.",
                recommendation:
                  "Gate advanced details and reveal trust information progressively.",
              },
              followUps: [
                {
                  id: "fu-v2-critic-1",
                  question:
                    "Can we preserve trust while reducing first-session density?",
                  userReply:
                    "Yes, show one metric explanation per action, not all at once.",
                  adjustment:
                    "Added staged disclosure rule for explanations in onboarding.",
                },
              ],
              config: {
                enabled: true,
                temperature: 0.35,
                strictness: 90,
                engagementPercent: 69,
              },
            },
            {
              id: "syn-v2-user",
              code: "U2",
              name: "User",
              role: "User advocate for friction and clarity",
              status: "done",
              layout: { x: 390, y: 320 },
              opinion: {
                summary: "Motivation improves when impact is immediate and legible.",
                details:
                  "Two-tap logging and visible weekly summary reduce friction and keep momentum.",
                recommendation:
                  "Prioritize first-week loop: default actions, short confirmations, and weekly recap.",
              },
              followUps: [
                {
                  id: "fu-v2-user-1",
                  question: "Should reminders be daily or weekly by default?",
                  userReply: "Weekly default with optional daily escalation.",
                  adjustment:
                    "Set weekly reminder default and allow user-controlled escalation.",
                },
              ],
              config: {
                enabled: true,
                temperature: 0.5,
                strictness: 62,
                engagementPercent: 85,
              },
            },
          ],
          edges: [
            {
              id: "edge-v2-builder-critic",
              from: "syn-v2-builder",
              to: "syn-v2-critic",
              type: "structural",
            },
            {
              id: "edge-v2-critic-user",
              from: "syn-v2-critic",
              to: "syn-v2-user",
              type: "tension",
            },
            {
              id: "edge-v2-user-builder",
              from: "syn-v2-user",
              to: "syn-v2-builder",
              type: "amplification",
            },
            {
              id: "edge-v2-builder-user-validation",
              from: "syn-v2-builder",
              to: "syn-v2-user",
              type: "oversight",
            },
          ],
          transcript: [
            {
              id: "tr-v2-1",
              syntheticId: "syn-v2-builder",
              type: "opinion",
              text: "Builder: Ship trust docs before social complexity.",
            },
            {
              id: "tr-v2-2",
              syntheticId: "syn-v2-critic",
              type: "followup",
              text: "Critic: Stage detail disclosure to avoid first-session overload.",
            },
            {
              id: "tr-v2-3",
              syntheticId: "syn-v2-user",
              type: "adjustment",
              text: "User: Weekly default reminders + quick logging improves continuity.",
            },
            {
              id: "tr-v2-4",
              syntheticId: "syn-v2-builder",
              type: "included",
              text: "Included: staged trust explanations + weekly-first reminder model.",
            },
          ],
          incorporationBlock: {
            baseText:
              "Use progressive prompts and transparent metric explanations for retention.",
            addedContext: [
              "Stage trust explanations across key actions.",
              "Default reminders to weekly with optional escalation.",
            ],
            currentText:
              "Use progressive prompts, staged trust explanations, and weekly-first reminders to improve retention.",
          },
        },
      },
      createdAt: "2026-03-26T14:40:00.000Z",
    },
    {
      id: "revision-v2-1",
      version: "V2.1",
      summary: "Onboarding simplification branch",
      parentId: "revision-v2",
      perspectives: {
        builder: {
          insight: "Onboarding complexity is significantly reduced.",
          concern: "Too much simplification can hide useful controls.",
          suggestion: "Unlock advanced controls after first successful week.",
        },
        critic: {
          insight: "The first-run flow is cleaner and easier to follow.",
          concern: "The branch can feel generic if personality is reduced too far.",
          suggestion: "Keep strong impact framing in first-session copy.",
        },
        user: {
          insight: "This version feels faster to start and less intimidating.",
          concern: "I still need confidence that numbers are credible.",
          suggestion: "Surface one short explanation next to each metric.",
        },
        investor: {
          insight: "Lower friction can improve activation rates.",
          concern: "Activation gains may not translate into retention alone.",
          suggestion: "Track activation-to-week-2 retention conversion directly.",
        },
      },
      input:
        "Explore a branch focused on reducing first-session friction while keeping impact signals visible from day one.",
      output: {
        problem:
          "New users struggle with setup choices and may quit before logging their first sustainable action.",
        solution:
          "Introduce a guided first log flow with defaults, then unlock advanced options after initial engagement.",
        steps: [
          {
            id: "v2-1-step-guided-onboarding",
            text: "Create a 60-second guided onboarding with default habits pre-selected.",
            normalized: "guided-onboarding",
            status: "done",
          },
          {
            id: "v2-1-step-first-log",
            text: "Prompt first action logging inside onboarding to establish momentum.",
            normalized: "first-log-loop",
            status: "todo",
          },
          {
            id: "v2-1-step-copy-rewrite",
            text: "Rewrite copy to frame progress around confidence, not guilt.",
            normalized: "copy-rewrite",
            status: "todo",
          },
        ],
        risks: [
          "Over-simplification can hide meaningful customization.",
          "Aggressive defaults may feel prescriptive for advanced users.",
        ],
      },
      graph: {
        coreProblem:
          "New users struggle with setup choices and may quit before logging their first sustainable action.",
        solution:
          "Introduce a guided first log flow with defaults, then unlock advanced options after initial engagement.",
        roadmap: [
          "Create a 60-second guided onboarding with default habits pre-selected.",
          "Prompt first action logging inside onboarding to establish momentum.",
          "Rewrite copy to frame progress around confidence, not guilt.",
        ],
        risks: [
          "Over-simplification can hide meaningful customization.",
          "Aggressive defaults may feel prescriptive for advanced users.",
        ],
        synthetics: {
          active: [
            {
              id: "user",
              name: "User",
              description: "Experience lens prioritizing clarity, trust, and daily usability.",
              enabled: true,
              settings: {
                temperature: 0.52,
                strictness: 60,
                engagementPercent: 87,
              },
            },
          ],
          available: [
            {
              id: "builder",
              name: "Builder",
              description: "Execution lens focused on scope, sequencing, and implementation risk.",
              enabled: false,
              settings: {
                temperature: 0.18,
                strictness: 80,
                engagementPercent: 67,
              },
            },
            {
              id: "critic",
              name: "Critic",
              description: "Challenge lens that stress-tests assumptions and hidden failure modes.",
              enabled: false,
              settings: {
                temperature: 0.34,
                strictness: 86,
                engagementPercent: 64,
              },
            },
            {
              id: "investor",
              name: "Investor",
              description: "Outcome lens centered on retention, defensibility, and growth risk.",
              enabled: false,
              settings: {
                temperature: 0.29,
                strictness: 74,
                engagementPercent: 58,
              },
            },
          ],
        },
      },
      graphRevision: {
        id: "graph-revision-v2-1",
        version: "V2.1",
        summary: "Onboarding simplification branch",
        ideaText:
          "Reduce first-session friction while keeping confidence in impact signals.",
        mode: "manual",
        run: {
          id: "run-v2-1-decision",
          stage: "decision",
          proposedSynthetics: [],
          activeSynthetics: [
            {
              id: "syn-v2-1-builder",
              code: "B21",
              name: "Builder",
              role: "System architect for scope and execution",
              status: "done",
              layout: { x: 250, y: 130 },
              opinion: {
                summary: "Simplified onboarding is implementable without architecture drift.",
                details:
                  "Default habits and first-log prompts can be delivered in one cohesive first-session flow.",
                recommendation:
                  "Release onboarding simplification with guarded advanced settings unlock.",
              },
              config: {
                enabled: true,
                temperature: 0.18,
                strictness: 80,
                engagementPercent: 67,
              },
            },
            {
              id: "syn-v2-1-user",
              code: "U21",
              name: "User",
              role: "User advocate for friction and clarity",
              status: "done",
              layout: { x: 520, y: 260 },
              opinion: {
                summary: "Flow is faster and easier to trust during the first minute.",
                details:
                  "Guided defaults reduce friction while short explanations maintain confidence in impact metrics.",
                recommendation:
                  "Promote this branch for the next pass only if trust copy remains explicit.",
              },
              config: {
                enabled: true,
                temperature: 0.52,
                strictness: 60,
                engagementPercent: 87,
              },
            },
          ],
          edges: [
            {
              id: "edge-v2-1-builder-user",
              from: "syn-v2-1-builder",
              to: "syn-v2-1-user",
              type: "amplification",
            },
          ],
          transcript: [
            {
              id: "tr-v2-1-1",
              syntheticId: "syn-v2-1-builder",
              type: "opinion",
              text: "Builder: onboarding simplification is safe within current release scope.",
            },
            {
              id: "tr-v2-1-2",
              syntheticId: "syn-v2-1-user",
              type: "opinion",
              text: "User: confidence improves when each metric has one short explanation.",
            },
          ],
          incorporationBlock: {
            baseText:
              "Introduce a guided first log flow with defaults, then unlock advanced options after initial engagement.",
            addedContext: [
              "Preserve impact trust copy in first session.",
              "Unlock advanced controls after initial success milestones.",
            ],
            currentText:
              "Guided first-log onboarding with explicit trust copy and staged advanced controls.",
          },
          decision: {
            selectedAction: "next_pass",
          },
        },
      },
      hasPlan: false,
      createdAt: "2026-03-27T09:20:00.000Z",
    },
    {
      id: "revision-v2-2",
      version: "V2.2",
      summary: "Community grove and social reinforcement branch",
      parentId: "revision-v2",
      perspectives: {
        builder: {
          insight: "Community features add a strong engagement loop.",
          concern: "Moderation and privacy scope can expand quickly.",
          suggestion:
            "Ship circles behind explicit privacy defaults and clear controls.",
        },
        critic: {
          insight: "The branch increases emotional momentum through shared progress.",
          concern: "Social comparison can create pressure and churn.",
          suggestion:
            "Frame progress collaboratively, not competitively, in all surfaces.",
        },
        user: {
          insight: "Seeing others makes the habit feel less lonely.",
          concern: "I do not want my private routines exposed.",
          suggestion: "Make sharing opt-in and explain visibility clearly.",
        },
        investor: {
          insight: "Network effects can improve retention and referrals.",
          concern: "Safety and moderation cost could impact margins early.",
          suggestion: "Validate community ROI in a contained pilot first.",
        },
      },
      input:
        "Explore a branch that prioritizes community visibility and social accountability for long-term retention.",
      output: {
        problem:
          "Users who act alone lose motivation over time because they cannot see shared progress momentum.",
        solution:
          "Add a community grove map with weekly milestones and lightweight accountability circles.",
        steps: [
          {
            id: "v2-2-step-grove-feed",
            text: "Design a weekly grove feed that celebrates aggregate progress.",
            normalized: "grove-feed",
            status: "done",
          },
          {
            id: "v2-2-step-circles",
            text: "Add private accountability circles with opt-in participation.",
            normalized: "accountability-circles",
            status: "todo",
          },
          {
            id: "v2-2-step-moderation",
            text: "Define moderation and abuse safeguards for community surfaces.",
            normalized: "moderation-guardrails",
            status: "todo",
          },
        ],
        risks: [
          "Community features can increase moderation overhead quickly.",
          "Public comparison can discourage users if not tuned carefully.",
        ],
      },
      hasPlan: true,
      plan: {
        orderedSteps: [
          "v2-2-step-grove-feed",
          "v2-2-step-circles",
          "v2-2-step-moderation",
        ],
        dependencies: [
          { from: "v2-2-step-grove-feed", to: "v2-2-step-circles" },
          { from: "v2-2-step-circles", to: "v2-2-step-moderation" },
        ],
      },
      timeline: {
        totalDuration: "8 weeks",
        phases: [
          {
            id: "v2-2-phase-design",
            name: "Design",
            goal: "Shape social surfaces that stay calm and non-competitive.",
            steps: ["v2-2-step-grove-feed"],
            duration: "2 weeks",
            status: "completed",
          },
          {
            id: "v2-2-phase-build",
            name: "Build",
            goal: "Implement circles and privacy controls.",
            steps: ["v2-2-step-circles"],
            duration: "4 weeks",
            status: "active",
          },
          {
            id: "v2-2-phase-safety",
            name: "Safety Pass",
            goal: "Verify moderation and trust controls before release.",
            steps: ["v2-2-step-moderation"],
            duration: "2 weeks",
            status: "locked",
          },
        ],
      },
      graph: {
        coreProblem:
          "Users who act alone lose motivation over time because they cannot see shared progress momentum.",
        solution:
          "Add a community grove map with weekly milestones and lightweight accountability circles.",
        roadmap: [
          "Design a weekly grove feed that celebrates aggregate progress.",
          "Add private accountability circles with opt-in participation.",
          "Define moderation and abuse safeguards for community surfaces.",
        ],
        risks: [
          "Community features can increase moderation overhead quickly.",
          "Public comparison can discourage users if not tuned carefully.",
        ],
        synthetics: {
          active: [
            {
              id: "builder",
              name: "Builder",
              description: "Execution lens focused on scope, sequencing, and implementation risk.",
              enabled: true,
              settings: {
                temperature: 0.21,
                strictness: 83,
                engagementPercent: 71,
              },
            },
            {
              id: "user",
              name: "User",
              description: "Experience lens prioritizing clarity, trust, and daily usability.",
              enabled: true,
              settings: {
                temperature: 0.54,
                strictness: 59,
                engagementPercent: 88,
              },
            },
          ],
          available: [
            {
              id: "critic",
              name: "Critic",
              description: "Challenge lens that stress-tests assumptions and hidden failure modes.",
              enabled: false,
              settings: {
                temperature: 0.33,
                strictness: 89,
                engagementPercent: 65,
              },
            },
            {
              id: "investor",
              name: "Investor",
              description: "Outcome lens centered on retention, defensibility, and growth risk.",
              enabled: false,
              settings: {
                temperature: 0.26,
                strictness: 77,
                engagementPercent: 62,
              },
            },
          ],
        },
      },
      graphRevision: {
        id: "graph-revision-v2-2",
        version: "V2.2",
        summary: "Community grove and social reinforcement branch",
        ideaText:
          "Prioritize shared momentum with circles and privacy-first community controls.",
        mode: "auto",
        run: {
          id: "run-v2-2-running",
          stage: "running",
          proposedSynthetics: [],
          activeSynthetics: [
            {
              id: "syn-v2-2-builder",
              code: "B22",
              name: "Builder",
              role: "System architect for scope and execution",
              status: "active",
              layout: { x: 220, y: 130 },
              config: {
                enabled: true,
                temperature: 0.21,
                strictness: 83,
                engagementPercent: 71,
              },
            },
            {
              id: "syn-v2-2-user",
              code: "U22",
              name: "User",
              role: "User advocate for friction and clarity",
              status: "thinking",
              layout: { x: 500, y: 130 },
              config: {
                enabled: true,
                temperature: 0.54,
                strictness: 59,
                engagementPercent: 88,
              },
            },
            {
              id: "syn-v2-2-critic",
              code: "C22",
              name: "Critic",
              role: "Risk challenger for assumptions and blind spots",
              status: "blocked",
              layout: { x: 360, y: 320 },
              config: {
                enabled: true,
                temperature: 0.33,
                strictness: 89,
                engagementPercent: 65,
              },
            },
          ],
          edges: [
            {
              id: "edge-v2-2-builder-user",
              from: "syn-v2-2-builder",
              to: "syn-v2-2-user",
              type: "amplification",
            },
            {
              id: "edge-v2-2-critic-builder",
              from: "syn-v2-2-critic",
              to: "syn-v2-2-builder",
              type: "structural",
            },
          ],
          transcript: [],
          incorporationBlock: {
            baseText:
              "Add a community grove map with weekly milestones and accountability circles.",
            addedContext: [],
            currentText:
              "Add a community grove map with weekly milestones and accountability circles.",
          },
        },
      },
      createdAt: "2026-03-27T16:05:00.000Z",
    },
    {
      id: "revision-v2-2-1",
      version: "V2.2.1",
      summary: "Focused beta release candidate for community pilot",
      parentId: "revision-v2-2",
      perspectives: {
        builder: {
          insight: "This revision is closest to a shippable release candidate.",
          concern: "Last-mile integration risk remains across trust and community.",
          suggestion:
            "Use release checklists tied to retention and moderation gates.",
        },
        critic: {
          insight: "Narrative and execution are now much better aligned.",
          concern: "Over-promising impact could still damage user trust.",
          suggestion: "Constrain claims to validated pilot outcomes only.",
        },
        user: {
          insight: "The flow feels useful, clear, and motivating.",
          concern: "I need consistency over time, not just initial polish.",
          suggestion: "Add weekly summaries that reinforce progress continuity.",
        },
        investor: {
          insight: "This is a credible candidate for focused market testing.",
          concern: "Scale assumptions are still unproven beyond pilot cohorts.",
          suggestion: "Use cohort-based rollout before broad launch spending.",
        },
      },
      input:
        "Converge the strongest retention ideas into a release candidate for a four-week closed community pilot.",
      output: {
        problem:
          "The product has promising ideas, but launch risk remains high without integrated execution and measurable validation checkpoints.",
        solution:
          "Create a beta-ready release candidate combining transparent metrics, low-friction logging, and community momentum loops.",
        steps: [
          {
            id: "v2-2-1-step-impact-readme",
            text: "Publish a plain-language impact assumptions page linked from key screens.",
            normalized: "impact-readme",
            status: "done",
          },
          {
            id: "v2-2-1-step-two-tap-log",
            text: "Finalize two-tap logging for common habits and weekly reminders.",
            normalized: "two-tap-log",
            status: "done",
          },
          {
            id: "v2-2-1-step-community-pilot",
            text: "Run a closed pilot with accountability circles and moderation guardrails.",
            normalized: "community-pilot",
            status: "todo",
          },
          {
            id: "v2-2-1-step-launch-v1",
            text: "Ship public v1 with validated retention and trust metrics.",
            normalized: "launch-v1",
            status: "todo",
          },
        ],
        risks: [
          "Pilot outcomes may vary across user cohorts and geographies.",
          "Metric education content can be ignored if placement is weak.",
          "Public launch timing may slip if moderation tooling is incomplete.",
        ],
      },
      hasPlan: true,
      plan: {
        orderedSteps: [
          "v2-2-1-step-impact-readme",
          "v2-2-1-step-two-tap-log",
          "v2-2-1-step-community-pilot",
          "v2-2-1-step-launch-v1",
        ],
        dependencies: [
          {
            from: "v2-2-1-step-impact-readme",
            to: "v2-2-1-step-community-pilot",
          },
          {
            from: "v2-2-1-step-two-tap-log",
            to: "v2-2-1-step-community-pilot",
          },
          {
            from: "v2-2-1-step-community-pilot",
            to: "v2-2-1-step-launch-v1",
          },
        ],
      },
      timeline: {
        totalDuration: "12 weeks",
        phases: [
          {
            id: "v2-2-1-phase-ready",
            name: "Readiness",
            goal: "Finalize trust messaging and frictionless logging.",
            steps: ["v2-2-1-step-impact-readme", "v2-2-1-step-two-tap-log"],
            duration: "3 weeks",
            status: "completed",
          },
          {
            id: "v2-2-1-phase-pilot",
            name: "Closed Pilot",
            goal: "Measure retention and confidence in a controlled rollout.",
            steps: ["v2-2-1-step-community-pilot"],
            duration: "5 weeks",
            status: "active",
          },
          {
            id: "v2-2-1-phase-launch",
            name: "Public Launch",
            goal: "Release with validated narrative and operational safeguards.",
            steps: ["v2-2-1-step-launch-v1"],
            duration: "4 weeks",
            status: "locked",
          },
        ],
      },
      graph: {
        coreProblem:
          "The product has promising ideas, but launch risk remains high without integrated execution and measurable validation checkpoints.",
        solution:
          "Create a beta-ready release candidate combining transparent metrics, low-friction logging, and community momentum loops.",
        roadmap: [
          "Publish a plain-language impact assumptions page linked from key screens.",
          "Finalize two-tap logging for common habits and weekly reminders.",
          "Run a closed pilot with accountability circles and moderation guardrails.",
          "Ship public v1 with validated retention and trust metrics.",
        ],
        risks: [
          "Pilot outcomes may vary across user cohorts and geographies.",
          "Metric education content can be ignored if placement is weak.",
          "Public launch timing may slip if moderation tooling is incomplete.",
        ],
        synthetics: {
          active: [
            {
              id: "builder",
              name: "Builder",
              description: "Execution lens focused on scope, sequencing, and implementation risk.",
              enabled: true,
              settings: {
                temperature: 0.18,
                strictness: 88,
                engagementPercent: 73,
              },
            },
            {
              id: "critic",
              name: "Critic",
              description: "Challenge lens that stress-tests assumptions and hidden failure modes.",
              enabled: true,
              settings: {
                temperature: 0.31,
                strictness: 92,
                engagementPercent: 70,
              },
            },
            {
              id: "user",
              name: "User",
              description: "Experience lens prioritizing clarity, trust, and daily usability.",
              enabled: true,
              settings: {
                temperature: 0.5,
                strictness: 63,
                engagementPercent: 90,
              },
            },
          ],
          available: [
            {
              id: "investor",
              name: "Investor",
              description: "Outcome lens centered on retention, defensibility, and growth risk.",
              enabled: false,
              settings: {
                temperature: 0.24,
                strictness: 80,
                engagementPercent: 64,
              },
            },
          ],
        },
      },
      graphRevision: {
        id: "graph-revision-v2-2-1",
        version: "V2.2.1",
        summary: "Focused beta release candidate for community pilot",
        ideaText:
          "Converge strongest retention ideas into a release candidate for a closed pilot.",
        mode: "manual",
        run: {
          id: "run-v2-2-1-editing",
          stage: "editing",
          proposedSynthetics: [
            {
              id: "syn-v2-2-1-investor",
              code: "I221",
              name: "Investor",
              role: "Commercial viability and rollout sequencing",
              status: "proposed",
              layout: { x: 650, y: 220 },
              config: {
                enabled: false,
                temperature: 0.24,
                strictness: 80,
                engagementPercent: 64,
              },
            },
          ],
          activeSynthetics: [
            {
              id: "syn-v2-2-1-builder",
              code: "B221",
              name: "Builder",
              role: "System architect for scope and execution",
              status: "done",
              layout: { x: 260, y: 130 },
              config: {
                enabled: true,
                temperature: 0.18,
                strictness: 88,
                engagementPercent: 73,
              },
            },
            {
              id: "syn-v2-2-1-critic",
              code: "C221",
              name: "Critic",
              role: "Risk challenger for assumptions and blind spots",
              status: "done",
              layout: { x: 500, y: 130 },
              config: {
                enabled: true,
                temperature: 0.31,
                strictness: 92,
                engagementPercent: 70,
              },
            },
          ],
          edges: [
            {
              id: "edge-v2-2-1-builder-critic",
              from: "syn-v2-2-1-builder",
              to: "syn-v2-2-1-critic",
              type: "amplification",
            },
          ],
          transcript: [
            {
              id: "tr-v2-2-1-1",
              syntheticId: "syn-v2-2-1-builder",
              type: "adjustment",
              text: "Builder: release checklist linked to trust and moderation gates.",
            },
          ],
          incorporationBlock: {
            baseText:
              "Create a beta-ready release candidate combining transparent metrics and low-friction logging.",
            addedContext: ["Add rollout guardrails before broad launch."],
            currentText:
              "Beta-ready release candidate with transparent metrics, low-friction logging, and rollout guardrails.",
          },
        },
      },
      createdAt: "2026-03-28T08:55:00.000Z",
    },
  ],
  perspectives: {
    builder: {
      insight:
        "The flow is modular and can reuse one shared project model across idea, graph, and planning screens.",
      concern:
        "Impact metric logic can become brittle if formulas are scattered across the UI.",
      suggestion:
        "Keep metric assumptions in one typed structure and reference them consistently in all views.",
    },
    critic: {
      insight:
        "The concept is clear and emotionally resonant, especially with visible collective progress.",
      concern:
        "Without proof of impact accuracy, users may read the product as performative.",
      suggestion:
        "Add plain-language metric footnotes in key surfaces before scaling marketing claims.",
    },
    user: {
      insight:
        "Quick logging and visual feedback make the habit loop feel rewarding instead of guilt-driven.",
      concern:
        "I may stop using it if setup is long or if logging takes more than a few seconds.",
      suggestion:
        "Prioritize instant defaults and gentle reminders over strict streak mechanics.",
    },
    investor: {
      insight:
        "There is growth potential at the intersection of wellness and climate-conscious consumer behavior.",
      concern:
        "Retention and credibility risk could slow expansion if the impact narrative is weak.",
      suggestion:
        "Validate weekly retention and referral lift in beta before investing in paid acquisition.",
    },
  },
  plan: {
    orderedSteps: [
      "v2-2-1-step-impact-readme",
      "v2-2-1-step-two-tap-log",
      "v2-2-1-step-community-pilot",
      "v2-2-1-step-launch-v1",
    ],
    dependencies: [
      { from: "v2-2-1-step-impact-readme", to: "v2-2-1-step-community-pilot" },
      { from: "v2-2-1-step-two-tap-log", to: "v2-2-1-step-community-pilot" },
      { from: "v2-2-1-step-community-pilot", to: "v2-2-1-step-launch-v1" },
    ],
  },
  timeline: {
    totalDuration: "12 weeks",
    phases: [
      {
        id: "v2-2-1-phase-ready",
        name: "Readiness",
        goal: "Finalize trust messaging and frictionless logging.",
        steps: ["v2-2-1-step-impact-readme", "v2-2-1-step-two-tap-log"],
        duration: "3 weeks",
        status: "completed",
      },
      {
        id: "v2-2-1-phase-pilot",
        name: "Closed Pilot",
        goal: "Measure retention and confidence in a controlled rollout.",
        steps: ["v2-2-1-step-community-pilot"],
        duration: "5 weeks",
        status: "active",
      },
      {
        id: "v2-2-1-phase-launch",
        name: "Public Launch",
        goal: "Release with validated narrative and operational safeguards.",
        steps: ["v2-2-1-step-launch-v1"],
        duration: "4 weeks",
        status: "locked",
      },
    ],
  },
  createdAt: "2026-03-22T10:00:00.000Z",
  updatedAt: "2026-03-28T09:30:00.000Z",
}

export function getProjectMock() {
  return MOCK_PROJECT
}
