# Free Lunch Tag — Meadows pilot

**Current rollout:** Seth is starting with three invitations (SE-P01, SE-P02 and SE-P03). Use the host tools for current counts and statuses. The private starter manifest and printable labels stay with Seth. Each tag has its own QR link and manual code.

Existing public website: https://freelunchtag.com . Hosted on GitHub Pages; no ChatGPT Site or external database is required by this version.

## The mobile-first site

The homepage opens on a gilded purple plate in an empty conservatory. Scroll to lift the plate and reveal the crystal Free Lunch Tag lettering. Follow the invitation down to the empty chair and up to two bowls of soup. A broom guides a rim fragment into a pail, through the garden door and into the moss. Ivory flowers grow into “Made with love by Meadows.” The plate says the Meadows host pays. The invitation on the chair explains how the QR or printed code reveals the host’s number. A continuous camera push toward the soup-table place card shows the “Text my host” button name and a sample invitation to tacos on Friday at noon. The garden shard explains that the guest can keep or trade the tag after lunch. The source lettering masks and the paper tracking marks live with the original footage.

Scroll position controls the frame in both directions. Stopping leaves the current frame on screen. Small rings mark objects you can tap. The plate, pail and garden shard play the action in place. The invitation card opens the code form, the tag and crystal letters open the collectible gallery, the soup explains the meal, and the flowers open Meadows visiting information. The frame-specific tap regions for both compositions live in `film-objects.mjs`. Film options include hands-free playback, the current chapter’s guest information and the three collectible tags. “How lunch works” opens the guest invitation from any frame, with a sample first text, the keep/trade policy and host information. The side tag opens the invitation form at any time. Scanning a printed QR goes directly to its host. Reduced-motion and video-limited devices use matching photographic stills.

The 36-second, silent film uses six Higgsfield Kling 3.0 camera moves generated from seven ImageGen photographs. Each pair of moves shares an endpoint. The six original clips are in `film-source/`. The offline renderer joins them at those endpoints, omits the duplicate frames and follows the action with separate portrait and landscape crops. It applies no fades or dissolves. Both web films and their stills are in `assets/film/`. The deployed site only requests the framing it needs and works independently of the generation service.

Two optional films are also available in Film options. [Found Tag](https://freelunchtag.com/found-tag.html) follows the Classic Lightning keychain between a peg, a duffel zipper, a pizza counter and a record sleeve, with separately generated portrait footage. [The Lunch Line](https://freelunchtag.com/lunch-line.html) follows the pizza box, ticket, phone, collector binder and spare chair down one shared counter. Both include the same private tag lookup, tag gallery and a table-question draw. Guests can ask their host about bringing a friend.

The two static entry pages reuse the homepage guest flow. Rebuild them with `python3 scripts/build-film-editions.py` after editing the shared markup. The original Higgsfield camera moves live in `film-source/found-tag/` and `film-source/lunch-line/`. Rebuild a master and its stills with `python3 scripts/render-editions.py found-tag portrait`, substituting the edition and `wide` as needed. Each edit lasts about 36 seconds. The site serves these files directly from GitHub Pages.

To rebuild the web media with Python 3, OpenCV, Pillow and FFmpeg, run `python3 scripts/render-film.py`. Run `python3 scripts/check-film.py` to decode every shipped frame and flag abrupt changes, then `node --test scripts/page-flow.test.mjs` to check section order, scroll mapping, invitation entry and media distribution.

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
