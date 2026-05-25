Update the architecture documentation to reflect the changes just made. $ARGUMENTS

Read the current state of:
- docs/PROJECT_SUMMARY.md
- docs/PROJECT_ARCHITECTURE_FOUNDATION_AND_SYSTEM_MAP.md
- docs/PROJECT_ARCHITECTURE_WORKFLOWS_AND_HISTORY.md

Then look at `git diff HEAD` (or the specific files mentioned in $ARGUMENTS) to understand what changed.

Update only the sections that are now out of date:
- If a new message type was added → update the message contracts table in PROJECT_ARCHITECTURE_FOUNDATION_AND_SYSTEM_MAP.md
- If a new storage key was added → update the storage schema section and the storage keys table in CLAUDE.md
- If the extraction priority chain changed → update the chain diagram in both CLAUDE.md and PROJECT_ARCHITECTURE_FOUNDATION_AND_SYSTEM_MAP.md
- If a new module file was added → update the file map
- If an invariant changed or was added → update the critical constraints in CLAUDE.md and the invariants section in PROJECT_SUMMARY.md

Rule from CLAUDE.md: PROJECT_SUMMARY.md and PROJECT_ARCHITECTURE_FOUNDATION_AND_SYSTEM_MAP.md must not contradict each other — update both if either changes.

Do not update docs/sprints/ — that is handled separately with /new-sprint.
