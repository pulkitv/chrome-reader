Create a new monthly sprint file for $ARGUMENTS (format: "YYYY-MM focus-description").

Steps:
1. Read docs/sprints/SPRINT_TEMPLATE.md for the canonical template structure
2. Read the most recent sprint file in docs/sprints/ to understand tone and detail level
3. Create a new file at docs/sprints/YYYY-MM-sprint-<slug>.md using the template
4. Add an entry for it in docs/sprints/SPRINTS_INDEX.md (append to the numbered list, update "Last updated" date)

The sprint file should include:
- Sprint goal / theme
- Initiatives delivered (with motivation — the WHY, not just the what)
- Architectural or UX impact of changes
- Relevant commits (if known from git log)
- Any invariants added or changed

Do not add entries to PROJECT_SUMMARY.md or architecture docs — those are updated separately when architectural contracts change.
