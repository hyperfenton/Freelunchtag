# Free Lunch Tag — Meadows pilot

**Current rollout:** Seth is starting with three invitations (SE-P01, SE-P02 and SE-P03). Use the host tools for current counts and statuses. The private starter manifest and printable labels stay with Seth. Each tag has its own QR link and manual code.

Existing public website: https://freelunchtag.com . Hosted on GitHub Pages; no ChatGPT Site or external database is required by this version.

## The mobile-first site

The homepage uses **Someone gave you a Free Lunch Tag**, the taco-window film selected for the primary experience. It opens on a Classic Lightning keychain clipped to a takeout bag. Tap the tag to find your host or scroll from the taco window to a shared picnic table. Tap the green salsa for an icebreaker or the red salsa for a friendly debate. The invitation explains that the Meadows host buys lunch, how to text the host, and that guests can keep or trade the tag afterward. Guests can ask their host about bringing a friend.

A visible **Made by Meadows Baptist Church** credit and the church's official logo link to https://www.meadowsbaptist.org/ throughout the film. The Lunch guide also identifies Meadows Baptist Church in Plano as the creator and includes the logo and website link; closing credits use the full church name. The compact mark in `assets/meadows-mark.png` comes from the logo linked on the church's official homepage.

Scroll position controls the frame in both directions. Stopping leaves the current frame on screen. The homepage has no floating plus markers or object labels. Its objects retain optional tap targets and keyboard focus. Film options include hands-free playback, quality selection, the current chapter’s guest information, salsa questions and the three collectible tags. “Lunch guide” opens the guest invitation from any frame, with a sample first text, the keep/trade policy and host information. The side tag opens the invitation form at any time. Scanning a printed QR goes directly to its host. Reduced-motion and video-limited devices use matching photographic stills.

`index.html`, `your-tag.html` and `pass-the-salsa.html` contain the same primary experience. All three use the homepage as their canonical URL, so existing direct links keep working. The two taco-window compositions use separate portrait and landscape footage with reviewed camera transitions, delivered in `assets/pass-the-salsa/`. Each edit lasts about 36 seconds. The site serves these files directly from GitHub Pages and only requests the framing it needs.

### Image quality and loading

The selected film is rebuilt from reviewed, enhanced footage, with a 3840 × 2160 landscape version, 1920 × 1080 landscape HD, 1080 × 2340 portrait HD, and smaller 720-pixel versions. Reading stills have matching responsive sizes. The original generated footage is enhanced for 4K delivery, with targeted repairs where a transition needs correction.

The homepage retains moving camera travel between its five reading stops through reviewed camera transitions. Targeted repairs address visible morphing, object drift or unstable geometry in individual transitions. Before release, the completed motion—including the 4K transitions—must pass frame-by-frame review for stable tags, clips, lettering, food and surrounding geometry, plausible camera movement, and continuity at joins. The exact accepted source takes and repairs are recorded in the source manifest. The 866-frame, 24 fps duration and existing reading windows are preserved.

Film options includes **Auto / HD / 4K**. Auto chooses one video before starting its download: it uses 4K only for a large display when both fast transfer evidence and smooth, efficient decoding are available. Unknown network capability defaults to HD; slow connections use the smaller rendition. Phones use portrait media. Explicitly choosing a quality reevaluates the current display, while ordinary resizing avoids an additional background movie download. A stalled 4K load, decoding failure, or repeated slow seeks falls back to a lighter version. Reduced-motion and Save Data preferences retain the still-image experience.

The first scroll moves directly into the opening camera take. The opening reading hold and each source clip’s stationary lead-in occupy only the first CSS pixel of the scroll route; both remain intact during **Watch as a film** playback. Returning to the top restores the sharp opening photograph immediately. The opening cue stays visible until the picture begins moving, so the first gesture is not consumed by hiding a button. Later reading stops keep their existing timing.

### Saved designs

The other designs remain available at their direct links for future use. They are removed from the primary page’s menu and marked `noindex,follow`:

- [Original film](https://freelunchtag.com/original-film.html): the gilded purple plate, conservatory, soup table and garden. The plate reveals crystal Free Lunch Tag lettering; the invitation explains the code and text flow; the garden shard explains keeping or trading the tag. Flowers close with “Made with love by Meadows.”
- [Found Tag](https://freelunchtag.com/found-tag.html): the Classic Lightning keychain moves between a peg, duffel zipper, pizza counter and record sleeve, with separately generated portrait footage.
- [The Lunch Line](https://freelunchtag.com/lunch-line.html): a pizza box, ticket, phone, collector binder and spare chair share one counter.

Every saved design retains the private tag lookup and collectible gallery. The original film’s frame-specific tap regions live in `film-objects.mjs`; the other editions are configured in `alternate-films.mjs`.

### Rebuilding pages and media

`original-film.html` is the shared markup source for `python3 scripts/build-film-editions.py`. Edit that source and the builder’s edition-specific content as needed, then run the builder to regenerate the primary homepage, its `your-tag.html` and `pass-the-salsa.html` aliases, and the saved alternate pages. Do not use the generated homepage as the shared source.

The original 36-second silent film uses six Higgsfield Kling 3.0 camera moves generated from seven ImageGen photographs. Each pair of moves shares an endpoint. Its source clips are in `film-source/`, with the source lettering masks and paper tracking marks retained alongside the footage. The offline renderer joins the clips at their endpoints, omits duplicate frames and follows the action with separate portrait and landscape crops. It applies no fades or dissolves. Its web films and stills remain in `assets/film/`.

Other source camera moves live under `film-source/<edition>/`, with native phone takes in the `portrait/` subdirectory where available. Rebuild a master and its stills with `python3 scripts/render-editions.py found-tag portrait`, substituting the edition and `wide` as needed. To rebuild the original web media with Python 3, OpenCV, Pillow and FFmpeg, run `python3 scripts/render-film.py`. Run `python3 scripts/check-film.py` to decode every shipped frame and flag abrupt changes, then `node --test scripts/page-flow.test.mjs` to check section order, scroll mapping, invitation entry and media distribution.

For the selected homepage's enhanced media, use `scripts/render-quality-editions.py` instead of the legacy edition renderer. `film-source/pass-the-salsa/quality-sources.json` records the original enhanced photographs, accepted replacement camera takes, generation jobs, URLs and checksums. Run `python3 scripts/prepare-quality-sources.py /path/to/enhanced` to download and verify them. The original eight takes remain in `wide/` and `portrait/`; accepted desktop motion is prepared separately in `motion/wide/`. The first desktop transition reuses the original enhanced footage, with the local repair script and parameters recorded under `local_motion_repairs`. That script must pass visual review before the source preparer will use it in a release build. The two remaining four-second replacements receive exact copies of their last frame to fill the original six-second slots, with no optical-flow interpolation or retiming. The earlier opening wipe remains recorded under `archived_motion_overrides` for reuse. Render with `python3 scripts/render-quality-editions.py wide --source-dir /path/to/enhanced --motion camera --motion-override-dir /path/to/enhanced/motion --cuts-config film-source/pass-the-salsa/motion-edits.json --preset medium`, then repeat with `portrait`. The desktop's original sharp photographs stay stationary with a shared 2% center crop; each camera take receives one small, constant whole-image framing correction to align its joins. The local opening repair composites existing source pixels, stabilizes the printed sign and wheel, and uses a rigid lime surface only during its short airborne movement. The native destination lime and its contact shadow remain after landing. The reviewed portrait edit removes the documented defective intervals. Python 3, Pillow, NumPy, SciPy, FFmpeg and ffprobe are required. The renderer stages and checks outputs before replacement, exports stills before video compression, and retains a short GOP for responsive scrolling. Review the enhanced source motion and assembled joins before publishing; fully decode all five delivery movies. Run `node --test scripts/page-flow.test.mjs scripts/film-quality.test.mjs` for guest-flow and quality-selection checks.

## Expansion plan for eight hosts and 80 physical tags

The larger batch was prepared for Lauren, Andrew, Seth, Kelly, Scott, Charles, Jonathan and Nathan, with ten tags per host. It has separate references from the three starter invitations and needs separate approval and activation. Public profiles use first names; Seth and Scott photos are from the Meadows team page. Supply approved photos for the remaining six (initials are deliberate fallbacks).

The code list and personalized manufacturing files are delivered privately, never committed. `data/cards.json` contains randomized lookup hashes and AES-GCM encrypted contact payloads. Each tag has a 192-bit QR secret and an independent 60-bit manual code. PBKDF2-SHA256 (150,000 iterations, random salt) derives its encryption key. URL fragments are removed before analytics initializes. Card IDs such as LA01 are management references, not redeemable codes.

This is a static invitation system, not a server-enforced voucher system. Browser cooldown is a usability deterrent, not a security rate limiter. Security against guessing depends on random secret entropy and encryption. People holding a card can recover its contact details; deactivation cannot revoke details already learned or historical ciphertext. A copied tag can be used to contact the same host. Hosts approve meals personally; there is no cash redemption or automatic booking.

## Before handing out tags

1. Open `/admin.html` and load the private JSON manifest supplied with the tag pack locally. Never upload this manifest to GitHub.
2. Select a host and enter their approved phone number. Download the encrypted `cards.json`, then immediately replace `data/cards.json` on GitHub. This preserves the latest statuses fetched at generation time; regenerate if anyone has updated the repository since the download.
3. In Actions → **Manage lunch cards**, select that host, the specific pack references (or `all` for a wholly unused host bundle), and `activate`. The workflow refuses activation until encrypted contacts are prepared. It uses GitHub's built-in repository authorization; only repository writers can run it. No phone numbers or secret codes belong in workflow inputs.
4. Use the printed pack references to update individual lunches to requested, scheduled, or completed. Scheduled requires a date. Scans do not modify data or count as meals. Public claimed = scheduled + completed; public open = active + handed_out.
5. Updates trigger a build of the existing branch-based GitHub Pages site. If Pages is changed to an Actions-source deployment later, adapt that final deployment step.

## Profiles

Edit `data/hosts.json` for approved introductions and photo URLs. Never add private phone numbers or guest data there. Do not infer a host's hobbies or personal bio. Public quantities are computed from current card statuses, with no invented historical totals.

## Manufacturing

The physical concept is a collectible 60 x 40 mm molded soft-PVC keychain with a raised lightning bolt and FREE LUNCH lettering, a recessed 26 x 33 mm QR insert, and a printed 4 x 6 inch backing card. Image-generated mockup, prototype STL/STEP, and private 80-tag QR labels are delivered separately. Manufacturer DFM/sample approval is still needed; do not treat the visualization as a tooling drawing.

## Validation

JavaScript syntax; 80 unique QR/manual secrets; all 160 encrypted payload round-trips; wrong-secret rejection; encrypted contact update; no plaintext card secrets in public data. No real guest messages or lunch claims were created.
