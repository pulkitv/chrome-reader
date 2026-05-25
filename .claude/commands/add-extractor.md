Add a new site-specific content extractor for $ARGUMENTS.

Follow the exact pattern in content.js:
1. Write an `is<SiteName>()` detection function (check hostname, URL pattern, or page structure)
2. Write an `extract<SiteName>()` function that returns an article object with: `{ title, content, siteName, byline }`
3. Insert it into the `extractArticle()` priority chain — Priority 0 for structural sites (like ChatGPT, Facebook permalink), Priority 1 for dialog-based sites
4. Gate `pickActiveDialog()` if the site has cookie/consent modals that would be false positives

Key constraints from CLAUDE.md:
- Never RegExp on base64 strings — use str.split(literal).join(replacement)
- Always replace both `&` and `&amp;` when patching image URLs
- `[role="main"]` must be excluded from selectors on Facebook-like feeds
- `pickActiveDialog()` is domain-gated — only add to the allowlist if the site genuinely uses a single active dialog for main content

After writing the extractor, show the updated priority chain and note which reload is required (content.js changes need extension reload before testing on new navigations).
