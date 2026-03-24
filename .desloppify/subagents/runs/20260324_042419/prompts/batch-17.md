You are a focused subagent reviewer for a single holistic investigation batch.

Repository root: /Users/peteromalley/Documents/announcement-video
Blind packet: /Users/peteromalley/Documents/announcement-video/.desloppify/review_packet_blind.json
Batch index: 17
Batch name: design_coherence
Batch rationale: design_coherence review

DIMENSION TO EVALUATE:

## design_coherence
Are structural design decisions sound — functions focused, abstractions earned, patterns consistent?
Look for:
- Functions doing too many things — multiple distinct responsibilities in one body
- Parameter lists that should be config/context objects — many related params passed together
- Files accumulating issues across many dimensions — likely mixing unrelated concerns
- Deep nesting that could be flattened with early returns or extraction
- Repeated structural patterns that should be data-driven
Skip:
- Functions that are long but have a single coherent responsibility
- Parameter lists where grouping would obscure meaning — do NOT recommend config/context objects or dependency injection wrappers just to reduce parameter count; only group when the grouping has independent semantic meaning
- Files that are large because their domain is genuinely complex, not because they mix concerns
- Nesting that is inherent to the problem (e.g., recursive tree processing)
- Do NOT recommend extracting callable parameters or injecting dependencies for 'testability' — direct function calls are simpler and preferred unless there is a concrete decoupling need

YOUR TASK: Read the code for this batch's dimension. Judge how well the codebase serves a developer from that perspective. The dimension rubric above defines what good looks like. Cite specific observations that explain your judgment.

Mechanical scan evidence — navigation aid, not scoring evidence:
The blind packet contains `holistic_context.scan_evidence` with aggregated signals from all mechanical detectors — including complexity hotspots, error hotspots, signal density index, boundary violations, and systemic patterns. Use these as starting points for where to look beyond the seed files.

Mechanical concern signals — investigate and adjudicate:
Overview (13 signals):
  design_concern: 7 — remotion/src/save-config.ts, shared/compositions/DebugTrack.tsx, ...
  duplication_design: 4 — remotion/src/load-config.ts, shared/types.ts, ...
  mixed_responsibilities: 2 — shared/editor-utils.ts, viewer/src/tools/video-editor/hooks/useTimelineState.ts

For each concern, read the source code and report your verdict in issues[]:
  - Confirm → full issue object with concern_verdict: "confirmed"
  - Dismiss → minimal object: {concern_verdict: "dismissed", concern_fingerprint: "<hash>"}
    (only these 2 fields required — add optional reasoning/concern_type/concern_file)
  - Unsure → skip it (will be re-evaluated next review)

  - [design_concern] remotion/src/save-config.ts
    summary: Design signals from orphaned, smells
    question: Is this file truly dead, or is it used via a non-import mechanism (dynamic import, CLI entry point, plugin)?
    evidence: Flagged by: orphaned, smells
    evidence: [orphaned] Orphaned file (43 LOC): zero importers, not an entry point
    fingerprint: 5ab4d6b36ad6e5a7
  - [design_concern] shared/compositions/DebugTrack.tsx
    summary: Design signals from orphaned, smells
    question: Is this file truly dead, or is it used via a non-import mechanism (dynamic import, CLI entry point, plugin)?
    evidence: Flagged by: orphaned, smells
    evidence: [orphaned] Orphaned file (60 LOC): zero importers, not an entry point
    fingerprint: fc20ca0bf60d405d
  - [design_concern] viewer/src/tools/video-editor/components/PropertiesPanel/AssetPanel.tsx
    summary: Design signals from orphaned, smells
    question: Is this file truly dead, or is it used via a non-import mechanism (dynamic import, CLI entry point, plugin)?
    evidence: Flagged by: orphaned, smells
    evidence: [orphaned] Orphaned file (254 LOC): zero importers, not an entry point
    fingerprint: 864854499ab0005c
  - [design_concern] viewer/src/tools/video-editor/components/PropertiesPanel/ClipPanel.tsx
    summary: Design signals from orphaned, smells
    question: Is this file truly dead, or is it used via a non-import mechanism (dynamic import, CLI entry point, plugin)?
    evidence: Flagged by: orphaned, smells
    evidence: [orphaned] Orphaned file (333 LOC): zero importers, not an entry point
    fingerprint: 63057e77e8cd38a2
  - [design_concern] viewer/src/tools/video-editor/components/TimelineEditor/TimelineEditor.tsx
    summary: Design signals from orphaned, smells
    question: Is this file truly dead, or is it used via a non-import mechanism (dynamic import, CLI entry point, plugin)?
    evidence: Flagged by: orphaned, smells
    evidence: [orphaned] Orphaned file (138 LOC): zero importers, not an entry point
    fingerprint: 602ea676f2c2a698
  - [design_concern] viewer/src/tools/video-editor/hooks/useCrossTrackDrag.ts
    summary: Design signals from orphaned, smells
    question: Is this file truly dead, or is it used via a non-import mechanism (dynamic import, CLI entry point, plugin)?
    evidence: Flagged by: orphaned, smells
    evidence: [orphaned] Orphaned file (351 LOC): zero importers, not an entry point
    fingerprint: 5cb18dfb91279352
  - [design_concern] viewer/src/tools/video-editor/lib/timeline-data.ts
    summary: Design signals from orphaned
    question: Is this file truly dead, or is it used via a non-import mechanism (dynamic import, CLI entry point, plugin)?
    evidence: Flagged by: orphaned
    evidence: [orphaned] Orphaned file (407 LOC): zero importers, not an entry point
    fingerprint: 0e782b016a013b85
  - [duplication_design] remotion/src/load-config.ts
    summary: Duplication pattern — assess if extraction is warranted
    question: Is the duplication worth extracting into a shared utility, or is it intentional variation?
    evidence: Flagged by: boilerplate_duplication
    evidence: [boilerplate_duplication] Boilerplate block repeated across 2 files (window 21 lines): remotion/src/load-config.ts:86, viewer/src/tools/video-editor/lib/timeline-data.ts:149
    fingerprint: 509f45dcbee37e06
  - [duplication_design] shared/types.ts
    summary: Duplication pattern — assess if extraction is warranted
    question: Is the duplication worth extracting into a shared utility, or is it intentional variation?
    evidence: Flagged by: boilerplate_duplication
    evidence: [boilerplate_duplication] Boilerplate block repeated across 2 files (window 12 lines): shared/types.ts:66, viewer/src/tools/video-editor/lib/timeline-data.ts:21
    fingerprint: 8022dcb9aea2c2a5
  - [duplication_design] viewer/src/shared/components/ui/collapsible.tsx
    summary: Duplication pattern — assess if extraction is warranted
    question: Is the duplication worth extracting into a shared utility, or is it intentional variation? Is this file truly dead, or is it used via a non-import mechanism (dynamic import, CLI entry point, plugin)?
    evidence: Flagged by: boilerplate_duplication, orphaned
    evidence: [orphaned] Orphaned file (66 LOC): zero importers, not an entry point
    fingerprint: 14bdfb8050b13b84
  - [duplication_design] viewer/src/tools/video-editor/components/PropertiesPanel/TrackPanel.tsx
    summary: Duplication pattern — assess if extraction is warranted
    question: Is the duplication worth extracting into a shared utility, or is it intentional variation? Is this file truly dead, or is it used via a non-import mechanism (dynamic import, CLI entry point, plugin)?
    evidence: Flagged by: boilerplate_duplication, orphaned
    evidence: [orphaned] Orphaned file (107 LOC): zero importers, not an entry point
    fingerprint: eee9a3cc8b9a6f93
  - [mixed_responsibilities] shared/editor-utils.ts
    summary: Issues from 2 detectors — may have too many responsibilities
    question: Is this file truly dead, or is it used via a non-import mechanism (dynamic import, CLI entry point, plugin)? What are the distinct responsibilities? Would splitting produce modules with multiple independent consumers, or would extracted files only be imported by the parent? Only split if the extracted code would be reused.
    evidence: Flagged by: orphaned, responsibility_cohesion
    evidence: [orphaned] Orphaned file (239 LOC): zero importers, not an entry point
    fingerprint: 18fe7b7163a5b6bc
  - [mixed_responsibilities] viewer/src/tools/video-editor/hooks/useTimelineState.ts
    summary: Issues from 4 detectors — may have too many responsibilities
    question: This file has issues across 4 dimensions (orphaned, props, smells, structural). Is it trying to do too many things, or is this complexity inherent to its domain? Is this file truly dead, or is it used via a non-import mechanism (dynamic import, CLI entry point, plugin)?
    evidence: Flagged by: orphaned, props, smells, structural
    evidence: File size: 1111 lines
    fingerprint: 426e24f7e9a2ae53

RELEVANT FINDINGS — explore with CLI:
These detectors found patterns related to this dimension. Explore the findings,
then read the actual source code.

  desloppify show boilerplate_duplication --no-budget      # 4 findings
  desloppify show orphaned --no-budget      # 11 findings
  desloppify show props --no-budget      # 1 findings
  desloppify show responsibility_cohesion --no-budget      # 1 findings
  desloppify show smells --no-budget      # 15 findings
  desloppify show structural --no-budget      # 1 findings

Report actionable issues in issues[]. Use concern_verdict and concern_fingerprint
for findings you want to confirm or dismiss.

Phase 1 — Observe:
1. Read the blind packet's `system_prompt` — scoring rules and calibration.
2. Study the dimension rubric (description, look_for, skip).
3. Review the existing characteristics list — which are settled? Which are positive? What needs updating?
4. Explore the codebase freely. Use scan evidence, historical issues, and mechanical findings as navigation aids.
5. Adjudicate mechanical concern signals (confirm/dismiss with fingerprint).
6. Augment the characteristics list via context_updates: positive patterns (positive: true), neutral characteristics, design insights.
7. Collect defects for issues[].
8. Respect scope controls: exclude files/directories marked by `exclude`, `suppress`, or non-production zone overrides.
9. Output a Phase 1 summary: list ALL characteristics for this dimension (existing + new, mark [+] for positive) and all defects collected. This is your consolidated reference for Phase 2.

Phase 2 — Judge (after Phase 1 is complete):
10. Keep issues and scoring scoped to this batch's dimension.
11. Return 0-10 issues for this batch (empty array allowed).
12. For design_coherence, use evidence from `holistic_context.scan_evidence.signal_density` — files where multiple mechanical detectors fired. Investigate what design change would address multiple signals simultaneously. Check `scan_evidence.complexity_hotspots` for files with high responsibility cluster counts.
13. Workflow integrity checks: when reviewing orchestration/queue/review flows,
14. xplicitly look for loop-prone patterns and blind spots:
15. - repeated stale/reopen churn without clear exit criteria or gating,
16. - packet/batch data being generated but dropped before prompt execution,
17. - ranking/triage logic that can starve target-improving work,
18. - reruns happening before existing open review work is drained.
19. If found, propose concrete guardrails and where to implement them.
20. Complete `dimension_judgment`: write dimension_character (synthesizing characteristics and defects) then score_rationale. Set the score LAST.
21. Output context_updates with your Phase 1 observations. Use `add` with a clear header (5-10 words) and description (1-3 sentences focused on WHY, not WHAT). Positive patterns get `positive: true`. New insights can be `settled: true` when confident. Use `settle` to promote existing unsettled insights. Use `remove` for insights no longer true. Omit context_updates if no changes.
22. Do not edit repository files.
23. Return ONLY valid JSON, no markdown fences.

Scope enums:
- impact_scope: "local" | "module" | "subsystem" | "codebase"
- fix_scope: "single_edit" | "multi_file_refactor" | "architectural_change"

Output schema:
{
  "batch": "design_coherence",
  "batch_index": 17,
  "assessments": {"<dimension>": <0-100 with one decimal place>},
  "dimension_notes": {
    "<dimension>": {
      "evidence": ["specific code observations"],
      "impact_scope": "local|module|subsystem|codebase",
      "fix_scope": "single_edit|multi_file_refactor|architectural_change",
      "confidence": "high|medium|low",
      "issues_preventing_higher_score": "required when score >85.0",
      "sub_axes": {"abstraction_leverage": 0-100, "indirection_cost": 0-100, "interface_honesty": 0-100, "delegation_density": 0-100, "definition_directness": 0-100, "type_discipline": 0-100}  // required for abstraction_fitness when evidence supports it; all one decimal place
    }
  },
  "dimension_judgment": {
    "<dimension>": {
      "dimension_character": "2-3 sentences characterizing the overall nature of this dimension, synthesizing both positive characteristics and defects",
      "score_rationale": "2-3 sentences explaining the score, referencing global anchors"
    }  // required for every assessed dimension; do not omit
  },
  "issues": [{
    "dimension": "<dimension>",
    "identifier": "short_id",
    "summary": "one-line defect summary",
    "related_files": ["relative/path.py"],
    "evidence": ["specific code observation"],
    "suggestion": "concrete fix recommendation",
    "confidence": "high|medium|low",
    "impact_scope": "local|module|subsystem|codebase",
    "fix_scope": "single_edit|multi_file_refactor|architectural_change",
    "root_cause_cluster": "optional_cluster_name_when_supported_by_history",
    "concern_verdict": "confirmed|dismissed  // for concern signals only",
    "concern_fingerprint": "abc123  // required when dismissed; copy from signal fingerprint",
    "reasoning": "why dismissed  // optional, for dismissed only"
  }],
  "retrospective": {
    "root_causes": ["optional: concise root-cause hypotheses"],
    "likely_symptoms": ["optional: identifiers that look symptom-level"],
    "possible_false_positives": ["optional: prior concept keys likely mis-scoped"]
  },
  "context_updates": {
    "<dimension>": {
      "add": [{"header": "short label", "description": "why this is the way it is", "settled": true|false, "positive": true|false}],
      "remove": ["header of insight to remove"],
      "settle": ["header of insight to mark as settled"],
      "unsettle": ["header of insight to unsettle"]
    }  // omit context_updates entirely if no changes
  }
}

// context_updates example:
{
  "naming_quality": {
    "add": [
      {
        "header": "Short utility names in base/file_paths.py",
        "description": "rel(), loc() are deliberately terse \u2014 high-frequency helpers where brevity aids readability at call sites. Full names would add noise without improving clarity.",
        "settled": true,
        "positive": true
      }
    ],
    "settle": [
      "Snake case convention"
    ]
  }
}
