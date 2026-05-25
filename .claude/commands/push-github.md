Push the entire project to GitHub in one commit. $ARGUMENTS

Follow these steps in order:

1. Run `git status` to see everything that's changed or untracked.

2. If there is nothing to commit (clean working tree), say so and stop.

3. Stage all changes with `git add -A`, excluding anything already ignored by .gitignore.

4. Craft a single commit message that summarizes the overall state of changes:
   - Follow the existing style from `git log --oneline -10`
   - Format: `<type>: <short description>` (e.g. `feat:`, `fix:`, `docs:`, `refactor:`)
   - First line under 72 characters
   - If $ARGUMENTS provides a message or context, use that as the commit message directly

5. Commit using a HEREDOC so formatting is preserved.

6. Run `git push origin main` (or the current branch if not on main).

7. Report the commit hash, message, and the GitHub push result.
