# Writing good synthetics

A synthetic is a node on the graph that reasons about your idea from one point of view and produces a real, model-generated opinion. This guide is about how to get good opinions out of them — what a synthetic actually is, how the default team gets picked, when to add your own, and what the connections between them mean.

## 1. What a synthetic is, and why it exists

A synthetic isn't "an AI character." It's a point of view with boundaries.

A synthetic whose description is `Handles legal considerations` will produce the same vague, defensible-sounding paragraph regardless of what your idea actually is — it's a topic label, not a lens. A synthetic whose description reads:

> Scrutinises unit economics, burn rate, cash flow projections, and financial models. Flags unrealistic revenue assumptions, missing cost lines, and CAC/LTV imbalances.

can only produce output that actually engages with your numbers, because that's the only thing it's looking for. Narrowness is what stops every agent from converging into one generic voice with different name tags on top.

This matters more as your graph grows: two broad "Business Advisor"-style agents will echo each other and call it consensus. Two narrow agents with genuinely different mandates will actually disagree when there's something worth disagreeing about — and the disagreement itself becomes signal (see [Connection types](#5-connection-types-they-change-the-prompt-not-just-the-line), below).

## 2. Where the default team comes from

There's no fixed starting team — no hardcoded "Manager, Designer, Engineer, QA" that every project gets. Instead, when you submit an idea, a routing step (the **Director**) reads it and picks 3–7 personas from a shared catalog of roughly 90 personas spanning four domains (business/startup, game development, education, health & fitness), specifically for what your idea touches.

The Director is instructed to actively *exclude* personas, not just pick ones that sound relevant:

- No Legal persona for a simple internal tool with no user data
- No Hardware persona for a pure SaaS product
- No VP of Sales for a solo weekend project with no defined sales motion
- No persona whose scope duplicates one already selected

So when you see a suggested team that's missing a role you expected, that's usually a deliberate exclusion, not an oversight — the Director reasoned that role has nothing to grab onto for your specific idea. Each suggestion comes with a one-line reason and a confidence percentage (hover the card to see why it was picked), so you can check that reasoning rather than take it on faith.

You can skip the Director entirely and build the graph by hand from an empty canvas — the role palette has a set of generic starting points (Research, Product, Growth, Finance, QA, and others) for exactly that.

## 3. When you need a custom synthetic

The catalog is broad but finite. A practical test: **if a default agent's answer to a question from your specific domain reads as generic, that's the signal to add a custom persona — not to rewrite the existing one's prompt.**

Rewriting an existing persona's description to also cover your edge case erodes the narrowness that made it useful in the first place (see §1). A new, additional synthetic keeps both mandates clean.

Example: you're building hardware for a niche industrial use case — none of the four catalog domains cover it. The default "Engineer" persona will talk about software architecture, because that's what it knows. Add a custom synthetic instead:

- Name: `Industrial Reliability Engineer`
- Description: `Reviews the design against MTBF requirements for continuous-duty industrial environments — vibration tolerance, thermal derating, and field-serviceability under a 10-year deployment horizon.`

That's not a tweak to an existing agent. It's a mandate the catalog has no equivalent for.

## 4. Writing a description the model will actually hold to

A synthetic's description is the only thing standing between "generic AI opinion" and "opinion I can actually use." The difference is concreteness — give the model specific things to look for, not a topic to be vaguely aware of.

**Before:** `Handles legal considerations.`
Too broad to constrain anything. The model will produce a paragraph that sounds like legal review without actually checking anything specific.

**After:** `Flags anything touching data residency, consumer protection disclosures, or IP ownership in contractor agreements.`
Three concrete things to scan the idea for. The model can only write about what's actually there, because it has nowhere vague to retreat to.

The pattern: name the artifacts the persona checks (contracts, cash flow lines, vibration tolerances, retention curves — whatever's real for that role), not the department it belongs to.

## 5. Connection types — they change the prompt, not just the line

When you drag a connection between two nodes, you're not just drawing a diagram — each type changes what text each agent actually receives about the other.

- **Structural** (the default when you connect two nodes) — plain execution order. The target runs after the source and receives its output as prior context.
- **Tension** — the two roles have structurally opposing mandates. Both agents receive the other's output framed as *"opposing position — push back."* Use this for roles that should genuinely disagree (e.g. Growth vs. Privacy) so the friction surfaces explicitly instead of getting smoothed over.
- **Oversight** — the source has formal authority to review the target's work. The reviewer receives the target's output framed as *"work under your review"* and is prompted to find gaps or risks in it.
- **Amplification** — the source's findings should weigh heavily on the target. The target receives the source's output framed as *"amplified signal — weight this heavily,"* for when one agent's finding should genuinely change how another reasons, not just inform it.

Picking the right type is worth the extra click: a Legal concern connected to Engineering as a plain structural edge reads as background info; the same concern connected as **oversight** reads as "this needs to pass review," which changes what Engineering's agent actually writes back.

## 6. Team size and how long a run takes

Every synthetic's turn is a real model call — there's no artificial pacing between them, they all start together, but each one genuinely takes however long the model takes to think and write a structured response (typically tens of seconds, more for larger outputs). With a cloud provider, if you hit that provider's rate limit the run backs off and retries automatically rather than failing outright, which adds time on top.

A graph of 8–10 synthetics is not a few seconds — it's realistically several minutes end to end. Start with the 4–5 roles most relevant to your idea (the Director's default suggestion is tuned for this) rather than assembling the largest possible team on your first run. You can always add more roles and re-run once you've seen what the first pass surfaces.
