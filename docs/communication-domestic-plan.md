# Communication Hub: Domestic Platform Plan

## Decision

For BOSS, Liepin, and Zhaopin, keep the V1 integration browser-only:

1. The user opens the platform from Communication Hub.
2. The user completes login, CAPTCHA, and any verification in the visible browser.
3. The app reads only the currently visible conversation page after the user invokes capture.
4. The user reviews the draft and explicitly saves it as a Communication record.

The app must never submit messages, scrape in the background, replay cookies, or bypass CAPTCHA/login checks.

## Why this is the current boundary

The public material found for these services is oriented toward employer/recruiter products rather than a stable personal job-seeker mailbox API. No documented, supported endpoint was found for reading a candidate's private chat history. Reverse-engineering private JSON endpoints would be brittle and could violate platform rules, so it is not a V1 dependency.

## Open-source survey

- [`joohw/boss-cli`](https://github.com/joohw/boss-cli) demonstrates a local Chrome + Puppeteer/CDP approach and can read a BOSS chat list after the user logs in. It is primarily for the employer side and also supports sending messages; it is GPL-3.0, so it is a reference rather than a dependency.
- [`jiyangnan/AgentMesh-JobAgent`](https://github.com/jiyangnan/AgentMesh-JobAgent) covers several Chinese platforms, but its workflow is aimed at automated job applications and message delivery. That is outside this product's scope and is not a safe drop-in.
- Projects claiming direct JSON/API access to Zhaopin or other private endpoints are experimental and may trigger WAF or account restrictions. They should not be used as the production path.
- [`@reconcrap/liepin-mcp`](https://www.npmjs.com/package/%40reconcrap/liepin-mcp) shows that Liepin chat workflows can be driven through a Chrome debugging port, but its documented flows include requesting resumes and other real actions. It is useful for selector and session-handling research only.
- [`hughYieh/zhaopin-boss-chrome`](https://github.com/hughYieh/zhaopin-boss-chrome) and similar extensions use content scripts and simulated UI events across recruitment pages. They are GPL-3.0 or research-oriented and include automated outreach, so they are not dependencies for this read-only product.
- [`lastsunday/job-hunting`](https://github.com/lastsunday/job-hunting) is another multi-site extension reference. Its own documentation labels platform collection as research, which reinforces keeping our connector user-invoked and low-frequency.

The practical reusable idea is **CDP connection to a user-owned browser session**, with a read-only capture and an explicit save confirmation. Chrome's own guidance recommends a non-default profile for remote debugging and warns that a debug connection can expose profile data, so the connector must be opt-in and local.

The dedicated launcher uses a separate profile and starts Chrome minimized. The window only needs to be brought forward for a login, CAPTCHA, or risk-control check.

## Technical shape

- Keep `platform_manifest()` as the source of truth for home/chat URLs.
- Add a user-invoked browser capture contract, separate from collectors.
- Capture only visible text and links from the active tab; sanitize HTML before storage.
- Require a platform source, channel name, and optional external thread URL.
- Deduplicate by `(source, external_thread_id)` and preserve human-edited fields.
- Return the user to the original platform after saving.
- Surface login expiry, CAPTCHA, and blocked pages as explicit human-action states.

## Implementation status / next order

1. Done: browser capture preview endpoint with no persistence.
2. Done: explicit `Save captures` confirmation, local-only actions, and parser tests.
3. Done: BOSS visible-list parsing; Liepin and Zhaopin remain URL-safe browser entry points.
4. Next: add fixture-based extraction for company, role, sender, and timestamp when stable page samples are available.
5. Ongoing: verify that no action sends or mutates the external platform.

## Acceptance checks

- Logged-out and CAPTCHA pages stop with a visible instruction.
- A capture never runs without an explicit user action.
- Previewing a page does not write to SQLite.
- Saving twice produces one conversation and one message per external message ID.
- Archive/Delete/Undo affect only local Communication records.
- No password, cookie, token, or raw page dump is written to logs or committed files.

## References

- Chrome DevTools Protocol: https://chromedevtools.github.io/devtools-protocol/
- Chrome remote debugging security guidance: https://developer.chrome.com/blog/remote-debugging-port
- Chrome profile isolation guidance: https://www.chromium.org/developers/creating-and-using-profiles/
