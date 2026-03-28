---
name: write-skill
description: Write or revise repo-owned SKILL.md files for ether-to-astro. Use when a workflow should become a concrete, compliant skill artifact rather than a broad product narrative.
metadata:
  repo: ether-to-astro
---

# Write Skills For `ether-to-astro`

## Purpose
Use this skill when creating or revising repo-owned skills or workflow specs for `ether-to-astro`.

The goal is not to write aspirational product prose. The goal is to produce a boring, compliant `SKILL.md` that another agent can execute consistently.

## Core Rules
- Skills own synthesis, ranking, formatting, and user/workflow-specific judgment.
- MCP owns deterministic astro computation and reusable structured facts.
- If a skill starts inventing astro math, transit logic, house logic, or electional primitives, stop and move that requirement back into MCP or a product issue.
- Prefer a one-call or two-call workflow over a large prompt blob.
- Keep the skill reusable. Do not hardcode one transient conversation unless the request is explicitly private/user-local.

## Default Shape
Write skills using this structure unless there is a strong reason to simplify:

```md
---
name: your-skill-name
description: What this skill does and when to use it.
---

# <Skill Name>

## Purpose
One short paragraph on what this skill does and when to use it.

## Inputs
- Required context or assumptions
- Required MCP/tool outputs
- Optional config/defaults

## Workflow
1. Call the relevant MCP/tool surface(s).
2. Transform or rank the results.
3. Produce the final output in the required shape.

## Output Contract
- Required sections
- Ordering rules
- Required references to underlying astro facts
- Things that must stay optional

## Boundaries
- What this skill must not do
- What stays in MCP
- What stays user-specific
```

## Repo-Specific Expectations
- Prefer concrete nouns over product slogans.
- Name the actual MCP tools the skill should call.
- If there is a stable two-call model, spell it out explicitly.
- If defaults matter, distinguish:
  - deterministic startup/config defaults
  - skill-side interpretation preferences
- Keep output contracts minimal. Define only the sections and fields needed for consistency.
- Do not turn issue language into fake canonical schema unless the repo has explicitly committed to one.

## Good Patterns
- “Call `get_transits` with forecast mode, then optionally call `get_electional_context` for narrowed windows.”
- “Summarize mundane baseline first, natal modifiers second.”
- “Keep tags and rankings in the skill, not in MCP payloads.”

## Bad Patterns
- Defining new astro facts inside the skill.
- Requiring hidden state not available from the documented workflow.
- Writing a manifesto instead of an execution spec.
- Hardcoding one user’s private heuristics into a repo-owned shared skill.

## Validation
- Follow the Agent Skills spec at https://agentskills.io/specification.
- Validate frontmatter and naming with the reference tooling when available, for example:
  - `skills-ref validate ./skills/your-skill-name`
  - or the equivalent validator flow provided by your skills toolchain

## Definition Of Done
A good repo-owned `SKILL.md` should let a zero-context agent answer:
- when should I use this skill?
- which tools do I call, and in what order?
- what output shape do I produce?
- what must I avoid putting into MCP?
