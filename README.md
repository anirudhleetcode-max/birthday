# For Deepu 🏮

A cinematic, interactive birthday **film** for **Deepu** (aka Pinky, aka Kuchi Puchi), born **3 January 2007**, turning **20** on **3 January 2027**. That's exactly **7,305 days**.

It plays like a short animated film set in a lantern-lit fairy-tale world, inspired by the atmosphere of *Tangled*, which she loves. Her real photographs are the heart of every scene. Everything you see and hear (lanterns, the tower, the golden ribbon, the little chameleon, the music) is **original**. No Disney footage, artwork, characters, music or dialogue is used.

## The story

| | Chapter | What happens |
|---|---|---|
| ⏳ | **Countdown** | Before midnight (IST) on her birthday: twenty unlit lanterns and a countdown. At midnight they light up one by one. |
| 🏮 | **Invitation** | "Hey Pinky." She lights the lantern, which starts the music, and the film begins. |
| ✨ | **Once Upon a Deepu** | A drop of sunlight falls through the night, a golden flower blooms, dawn breaks, and her photo appears. |
| 🎨 | **A Tower Full of You** | A sunlit tower room where her photos are brush-painted onto the walls. A golden ribbon waits outside the window. |
| 💛 | **The Golden Thread** | Polaroids on a glowing golden thread, inspired by her long hair. They develop like instant film. |
| 🦎 | **A Legend of Many Names** | A fake nature documentary, then an absurdly epic trailer-style reveal: Deepu… also known as… Pinky… Kuchi Puchi. |
| 🎪 | **Somewhere Between Chaos and Magic** | A twilight festival with her photos dancing in a 3D circle. |
| 🌌 | **The Night of Lanterns** | A lake at night: one lantern, then thousands. Photo-lanterns she can tap to bring closer, and a sky she can send her own lanterns into. |
| 💌 | **A Letter You Were Supposed to Read** | A wax-sealed letter on a candle-lit desk that writes itself out in handwriting. |
| 🎂 | **Twenty Candles** | "Okay… one last thing." A 3D cake. She **blows into her phone** to put the candles out (or taps), then **swipes to cut** it. |
| 🎥 | *(optional)* **Video message** | Only appears if you upload one. |
| 💖 | **Every Little Piece of You** | All her photos float in the dark, a golden ribbon connects them into a heart, then one final photo. |
| 🎉 | **The Last Lantern** | 20 years → 240 months → 7,305 days → thousands of lanterns → **Happy 20th Birthday, Deepu**. |
| 🤗 | **One Last Thing** | "Send me a hug." Press and hold. |
| 🎬 | **Credits** | Movie-style credits, the album, and a post-credits scene for whoever waits. |

There are also a few **hidden secrets** to find (the credits tell her how many she found).

---

## 1. Run it on your computer

```bash
npm run serve              # or: npx http-server . -p 8090 -c-1
# then open http://localhost:8090/?preview   (the film, skipping the countdown)
#      and  http://localhost:8090/admin/     (the admin portal)
```

Handy addresses:
- `?preview` watches the film before the unlock date.
- `?preview&scene=lanterns` jumps to a chapter (`prologue tower hair names dance lanterns letter cake constellation birthday hug credits`).
- `?preview&draft` shows your **unsaved admin changes** on the same device.
- `&reduced` and `&low` test the reduced-motion and low-power versions.

## 2. Put it online (once)

1. The repository currently has a single branch, `claude/focused-ramanujan-ntd4tc`. Create `main` from it: on GitHub, open the branch dropdown → type `main` → **Create branch: main from claude/focused-ramanujan-ntd4tc**. Then set `main` as the default branch under **Settings → General**.
2. On GitHub: **Settings → Pages → Source: Deploy from a branch → `main` / `(root)` → Save**.
3. About a minute later: **https://anirudhleetcode-max.github.io/birthday/**. The admin is at **/admin/**.

The admin publishes to the branch set under **Settings → GitHub (where the site lives)** in the admin (`main` by default). That must be the same branch that Pages serves.

The repository must stay **public** for free GitHub Pages. Until the unlock moment, visitors only see the countdown.

## 3. The admin portal: "The Lantern Room" (`/admin/`)

Connect once with a GitHub token. The admin shows step-by-step instructions, and [docs/SECURITY.md](docs/SECURITY.md) explains what the token can do and how to revoke it. The token stays in your browser (switch off **Remember on this device** to keep it only until the tab closes). It is only ever sent to GitHub and is never stored in the site, the drafts or exports.

Privacy: before anything is published, the admin removes hidden photo details (GPS location, camera serial number, embedded thumbnails) from your originals without re-compressing them, and blanks the recording location in videos and voice notes. Everything you publish is public on the internet (that's how free GitHub Pages works). The countdown only hides the film itself.

| Section | What you can do |
|---|---|
| **Photo library** | Thumbnails of every photo by chapter. **Edit · Replace · Move · Delete · Preview**, **Add photo**, reorder (drag or arrows), turn a photo on or off, mark it ★ featured or as the *hero-hair* photo, assign the special roles (first photo, grand reveal, the two of you). |
| **Chapters** | Turn chapters on or off and see how many photos each has. |
| **Messages** | Every word in the film: greetings, chapter lines, captions, the letter, the credits. |
| **Audio / Video** | Your own song, a voice note for the letter, a video message. |
| **Theme** | Film grain, particle amount, golden ribbon on/off. |
| **Settings** | Names, birth date, your name, the countdown unlock time (IST), WhatsApp number for the hug, colour-grading strength. |
| **Preview** | Watch the real film with your draft. Nothing goes live until you publish. |
| **Publish / Export** | Publish saves everything to GitHub in one go (live in 1–2 minutes). Export downloads a zip instead. |

**Save draft** keeps your work on that device. **Reset** throws the draft away. Before publishing, the admin warns about missing photos and blocks real errors. It also warns you before you leave with unsaved changes.

### Where the 36 photos go
**Upload them through the admin.** Don't copy files into folders by hand. Open **Photo library** and use **Fill empty spots** (or **Replace** on each placeholder). The admin:
- keeps your **original file untouched** in `photos/originals/`,
- makes a cropped, gently colour-graded display copy in `photos/` and a thumbnail in `photos/thumbs/`,
- records everything in `data/photos.json`.

The initial spots and their shapes:

| Chapter | Spots | Shape | Best photos |
|---|---|---|---|
| Prologue (first photo she sees) | 1 | 4:5 | Her prettiest solo portrait |
| Tower walls | 6 | 3:4 · 1:1 · 4:5 · 4:3 | Candid, warm, everyday moments |
| Golden thread (polaroids) | 8 | 3:4 | Memories in order, with captions |
| Her names | 3 | 4:5 | One each for Deepu, Pinky, Kuchi Puchi |
| Festival | 8 | 3:4 | Happy, fun, festive |
| Photo lanterns | 6 | 1:1 | Soft, glowy, emotional |
| The letter | 2 | 1:1 · 3:4 | The two of you |
| Finale | 2 | 4:5 | Her single best photo + one of **both of you** |

If one photo shows her **long hair** beautifully, open it and tick **Hero-hair photo**. It then gets its own cinematic moment on the golden thread.

### Replacing a photo later (the same-shape rule)
1. Photo library → the photo → **Replace** → choose the new image.
2. If it's the same shape, it's accepted immediately.
3. If not, you'll see something like **"Expected ratio: 4:5 · Uploaded ratio: 16:9"**. Then choose:
   - **Crop** to the right shape (it starts centred on her face if you've set a focal point),
   - **Contain**: the whole photo fitted in, with a soft blurred extension of itself as background, or
   - **Choose another photo**.
   
   Photos are never stretched or silently cropped.
4. **Preview**, then **Publish**.

### Adding new photos (October, November, December, January…)
Photo library → **Add photo** → choose the chapter (or **Extra memories**) → pick a shape → crop → add a caption and date → **Publish**. There is no limit. Chapters adapt to however many photos they have, and every enabled photo also appears in the finale heart, the credits and the album.

## 4. The January 3, 2027 release (checklist)

1. In the admin, open **Settings**. Check the unlock time is **3 Jan 2027, 00:00 (IST)** and the countdown lock is **on**.
2. Fill every photo spot. The validation panel should show no "empty spot" warnings.
3. Read through **Messages** and personalise the letter and captions with your own memories.
4. Preview the entire film once on your phone (`?preview&draft`), with headphones in.
5. **Publish**. Wait two minutes, then open the live link in a private window: you should see the countdown.
6. Send her the link a little before midnight on **2 January**, so she watches the countdown reach zero.
7. Tell her: *headphones on, lights low, sound up*. The phone stays awake during the film, and on Android it goes full-screen.

## 5. Quality checks

```bash
npm run check     # content + files + 7,305-day check + secret scan
npm run lint      # ESLint (uses a global eslint)
npm test          # unit tests (content model, admin logic)
npm run e2e       # film smoke test on every chapter + admin flows (needs `npm run serve` running)
NODE_PATH=$(npm root -g) node tests/e2e/admin-qa.cjs      # deep admin QA (184 checks)
NODE_PATH=$(npm root -g) node tests/e2e/admin-visual.cjs  # admin layout audit at 4 sizes (302 checks)
npm run e2e:full  # plays the whole film start to finish (slow in headless Chromium)
```

## Project structure

```
index.html                 the film
admin/                     the admin portal (The Lantern Room)
data/settings.json         names, dates, countdown, theme, media, chapter visibility
data/messages.json         every word on screen
data/photos.json           the photo library (unlimited) + per-photo details
photos/ originals/ thumbs/ display photos, untouched originals, thumbnails
media/                     optional music / video / voice note
assets/js/main.js          the projector: chapter order, transitions, shared context
assets/js/core/            engines: ribbon, lanternfield, audio, effects, subtitles, transitions, chameleon, secrets
assets/js/scenes/          one file per chapter
assets/js/shared/          content model, colour grading, drafts (shared with the admin)
assets/css/                styles (main.css + one file per chapter)
docs/ARCHITECTURE.md       how it all fits together (contract + art bible)
docs/SECURITY.md           the admin token, privacy, what's public
tests/                     unit, e2e and visual QA tools
dev/                       developer test pages (cake, ribbon, transitions), not linked from the film
```

Libraries (vendored, no CDN): three.js (MIT), GSAP (standard no-charge licence). Fonts are self-hosted Google Fonts (SIL Open Font License).
