# Free Lunch Tag — Meadows pilot

**Current rollout:** Public host and card collections are intentionally empty while owner approval for publishing the prepared host profiles and public tag lookup dataset is pending. The setup steps below become usable after those collections are populated. No private manifest is included in this repository.

Existing public website: https://freelunchtag.com . Hosted on GitHub Pages; no ChatGPT Site or external database is required by this version.

## Eight hosts, 80 physical tags

Ten tags each: Lauren, Andrew, Seth, Kelly, Scott, Charles, Jonathan, Nathan. All start inactive. Public profiles use first names; Seth and Scott photos are from the Meadows team page. Supply approved photos for the remaining six (initials are deliberate fallbacks).

The code list and personalized manufacturing files are delivered privately, never committed. `data/cards.json` contains randomized lookup hashes and AES-GCM encrypted contact payloads. Each tag has a 192-bit QR secret and an independent 60-bit manual code. PBKDF2-SHA256 (150,000 iterations, random salt) derives its encryption key. URL fragments are removed before analytics initializes. Card IDs such as LA01 are management references, not redeemable codes.

This is a static invitation system, not a server-enforced voucher system. Browser cooldown is a usability deterrent, not a security rate limiter. Security against guessing depends on random secret entropy and encryption. People holding a card can recover its contact details; deactivation cannot revoke details already learned or historical ciphertext. A copied tag can be used to contact the same host. Hosts approve meals personally; there is no cash redemption or automatic booking.

## Before handing out tags

1. Open `/admin.html` and load the privately supplied `Free-Lunch-Pilot.private.json` locally. Never upload this manifest to GitHub.
2. Select a host and enter their approved phone number. Download the encrypted `cards.json`, then immediately replace `data/cards.json` on GitHub. This preserves the latest statuses fetched at generation time; regenerate if anyone has updated the repository since the download.
3. In Actions → **Manage lunch cards**, select that host, `all`, and `activate`. The workflow refuses activation until encrypted contacts are prepared. It uses GitHub's built-in repository authorization; only repository writers can run it. No phone numbers or secret codes belong in workflow inputs.
4. Use the printed pack references to update individual lunches to requested, scheduled, or completed. Scheduled requires a date. Scans do not modify data or count as meals. Public claimed = scheduled + completed; public open = active + handed_out.
5. Updates trigger a build of the existing branch-based GitHub Pages site. If Pages is changed to an Actions-source deployment later, adapt that final deployment step.

## Profiles

Edit `data/hosts.json` for approved introductions and photo URLs. Never add private phone numbers or guest data there. Do not infer a host's hobbies or personal bio. Public quantities are computed from current card statuses, with no invented historical totals.

## Manufacturing

The physical concept is a collectible 60 x 40 mm molded soft-PVC keychain with a raised lightning bolt and FREE LUNCH lettering, a recessed 26 x 33 mm QR insert, and a printed 4 x 6 inch backing card. Image-generated mockup, prototype STL/STEP, and private 80-tag QR labels are delivered separately. Manufacturer DFM/sample approval is still needed; do not treat the visualization as a tooling drawing.

## Validation

JavaScript syntax; 80 unique QR/manual secrets; all 160 encrypted payload round-trips; wrong-secret rejection; encrypted contact update; no plaintext card secrets in public data. No real guest messages or lunch claims were created.
