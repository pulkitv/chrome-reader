# Sprint 2026-05 — Facebook Post Permalink Extraction

## Sprint goal
Fix extraction quality for Facebook post permalink URLs so that both logged-in and not-logged-in states produce a clean, noise-free reader view scoped to the post content only.

## Why this sprint existed
- Facebook post permalink URLs (e.g. `facebook.com/user/posts/postid`) were producing polluted reader views containing repeated "Facebook" navigation text, CSS-scrambled date characters, and unrelated feed content.
- Root cause: the existing extraction pipeline had no permalink-specific path. It fell through to Readability, which parsed the entire page — including the full logged-in Facebook UI (left nav, right rail, stories, composer, suggested posts).
- The logged-in state was particularly broken: Facebook renders the post as a dialog overlay on the news feed. Readability extracted the whole feed rather than the post.
- The not-logged-in state needed a targeted container selector to isolate just the post content from the permalink page.

## Major initiatives delivered

### 1) Facebook post permalink detection and Priority 0 extraction path

**Why**
- Permalink pages have a fundamentally different DOM structure from a post opened as a dialog popup (e.g. clicking a post in the news feed). No existing extraction path handled it.

**What was built**
- `isFacebookPostPermalink()` — detects `facebook.com` URLs containing `/posts/`, `/permalink.php`, or `/photos/` paths
- `FB_POST_PERMALINK_SELECTORS` constant — ordered list of selectors targeting the permalink page container: `[data-pagelet="PermalinkPage"]`, `[data-pagelet*="Permalink"]`; intentionally excludes `[role="main"]`
- `extractFacebookPermalink()` — Priority 0 path in `extractArticle()`, fires before dialog check and Readability
- `extractionMode: 'fb-permalink'` returned for the not-logged-in extraction path

**Detail**
- Priority 0 is inserted before Priority 1 (dialog) and Priority 2 (Readability) in `extractArticle()`
- The function tries each selector in `FB_POST_PERMALINK_SELECTORS` in order, picking the first with sufficient text
- When no permalink pagelet is found (logged-in state), the function returns `null` — allowing Priority 1 (`pickActiveDialog`) to handle the post modal dialog as it already did
- `[role="main"]` was explicitly excluded from the selectors because in logged-in state it contains the full news feed, not the post

---

### 2) Facebook-specific DOM pruning and noise removal

**Why**
- Even with the right root container, FB permalink pages contain right-rail sidebars, stories, suggested posts, and ARIA navigation roles that pollute the extracted content.

**What was built**
- `pruneFacebookNode(clone)` — extends standard noise removal with FB-specific pagelet and ARIA role targeting:
  - Pagelets removed: `ColumnRight`, `RightRail`, `Stories`, `Composer`, `Suggested`
  - ARIA roles removed: `complementary`, `navigation`, `banner`
  - Standard elements removed: `script`, `style`, `noscript`, `svg`, `nav`, `footer`, `header`, `aside`, `form`, `button`, `input`, `select`, `textarea`

**Detail**
- Operates on a cloned subtree, never mutates the live DOM
- Applied after the root container is found but before text-length validation and URL normalization

---

### 3) CSS-scrambled timestamp removal

**Why**
- Facebook obfuscates post timestamps using CSS `order` property — individual characters are placed in separate `<span>` elements and visually reordered via CSS. In extracted text content, these appear as a stream of single characters separated by spaces (e.g. `n p s o r t S d e o 0 t 6 ...`), making the reader view unreadable.

**What was built**
- `removeScrambledDates(clone)` — detects and removes scrambled date containers using a structural heuristic:
  - Element must have ≥10 direct children
  - ≥65% of children must have 1-character visible text content
  - Already-removed elements are skipped via `el.parentNode` guard

**Detail**
- Runs after `pruneFacebookNode()` on the same clone
- The 65% threshold was chosen to be strict enough to avoid false positives on legitimate content with short words, while reliably catching FB date elements

---

### 4) Facebook title cleanup

**Why**
- Facebook document titles follow the pattern `(20+) Author Name - Post excerpt... | Facebook`. The notification count prefix and `| Facebook` suffix are noise in the reader view header.

**What was built**
- `cleanFacebookTitle(rawTitle)` — strips the `(N+)` notification count prefix and `| Facebook` suffix using two sequential regex replacements

**Detail**
- Applied only in the `extractFacebookPermalink()` path, not in general extraction
- Result: titles like `(20+) Quang Do - Chuyển Hóa Vận Mệnh... | Facebook` become `Quang Do - Chuyển Hóa Vận Mệnh...`

---

## Sprint outcomes
- Facebook post permalink pages now extract the correct post content in both logged-in and not-logged-in states
- No regressions to existing dialog extraction (logged-in FB post popups still work via Priority 1)
- No regressions to Readability extraction for regular article pages (Priority 0 is strictly FB-domain-gated)
- Reader view title is clean for all Facebook post sources
- Scrambled timestamp characters no longer appear in extracted content

## Risks discovered during sprint
- Facebook's DOM uses dynamically generated, obfuscated class names — `data-pagelet` attributes are the only stable structural hook and could change in future FB platform updates
- The 65% single-character threshold in `removeScrambledDates()` is a heuristic; very unusual content (e.g. single-letter lists or abbreviation-heavy text) could theoretically be affected, though no such case was found in testing
- Logged-in extraction relies on the post being in a `[role="dialog"]` — if Facebook changes this ARIA structure, Priority 1 dialog detection would need updating

## Follow-ups for next sprint
- [ ] Test against Facebook group posts (`/groups/groupname/posts/postid`) to confirm extraction works
- [ ] Test against Facebook photo permalink pages (`/photos/`) for correct extraction
- [ ] Consider adding Instagram permalink extraction (similar pattern: posts at `instagram.com/p/postid` are not always in a dialog on desktop)
- [ ] Monitor if Facebook changes `data-pagelet` attribute naming in future platform updates

## Metadata
- Sprint window: 2026-05-01 to 2026-05-31
- Owner(s): Pulkit Vashishta
- Status: in-progress
- Last updated: 2026-05-17
