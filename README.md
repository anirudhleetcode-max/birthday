# For Deepu 🏮

A cinematic, interactive birthday **film** for **Deepu** (aka Kuchu Puchu), born **3 January 2007**, turning **20** on **3 January 2027**. That's exactly **7,305 days**.

It plays like a short animated film set in a lantern-lit fairy-tale world, inspired by the atmosphere of *Tangled*, which she loves. Her real photographs are the heart of every scene. Everything you see and hear (lanterns, the tower, the golden ribbon, the little chameleon, the music) is **original**. No Disney footage, artwork, characters, music or dialogue is used.

## The story

| | Chapter | What happens |
|---|---|---|
| ⏳ | **Countdown** | Before midnight (IST) on her birthday: twenty unlit lanterns and a countdown. At midnight they light up one by one. |
| 🏮 | **Invitation** | "Hey Deepu." She lights the lantern, which starts the music, and the film begins. |
| ✨ | **Once Upon a Deepu** | A drop of sunlight falls through the night, a golden flower blooms, dawn breaks, and her photo appears. |
| 🎨 | **A Tower Full of You** | A sunlit tower room where her photos are brush-painted onto the walls. A golden ribbon waits outside the window. |
| 🚌 | **How It Began** | Your real memories on the golden thread: you met at a college event, then talked every day, the bus and train journeys between college and home (a window with the world sliding by), and her telling you about her day. Memories you add later (October, November, December…) appear here too. |
| 💛 | **The Golden Thread** | Polaroids on a glowing golden thread, inspired by her long hair. They develop like instant film. |
| 🦎 | **A Legend of Many Names** | A fake nature documentary, then an absurdly epic trailer-style reveal: Deepu… also known as… Kuchu Puchu. |
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
2. On GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**. The workflow in `.github/workflows/pages.yml` then builds and publishes the site on every push to `main`, including every **Publish** from the admin. It deploys only the public site: film, admin, assets, data, photos and media, without tests, scripts or docs. The build fails, and nothing is published, if any file reference is broken.
   *(Simpler alternative: **Source: Deploy from a branch → `main` / `(root)`**. That also works, but it serves the whole repository.)*
3. A minute or two later: **https://anirudhleetcode-max.github.io/birthday/**. The admin is at **/admin/**.

The admin publishes to the branch set under **Settings → GitHub (where the site lives)** in the admin (`main` by default). That must be the same branch that Pages serves.

The repository must be **public** for free GitHub Pages. **It already is, so her photos, the letter and every word are visible on GitHub right now**, not only after 3 January. The countdown is an experience, not a lock: it hides the film, not the files. If you'd rather keep everything private until the day, make the repository private now (Settings → General → Danger zone) and switch it back to public, and set up Pages, on 2 January. Free GitHub Pages can't serve a private repository.

## 3. The admin portal: "The Lantern Room" (`/admin/`)

Connect once with a GitHub token. The admin shows step-by-step instructions, and [docs/SECURITY.md](docs/SECURITY.md) explains what the token can do and how to revoke it. The token stays in your browser (switch off **Remember on this device** to keep it only until the tab closes). It is only ever sent to GitHub and is never stored in the site, the drafts or exports.

Privacy: before anything is published, the admin removes hidden photo details (GPS location, camera serial number, embedded thumbnails) from your originals without re-compressing them, and blanks the recording location in videos and voice notes. Everything you publish is public on the internet (that's how free GitHub Pages works). The countdown only hides the film itself.

| Section | What you can do |
|---|---|
| **Photo library** | Thumbnails of every photo by chapter. **Edit · Replace · Move · Delete · Preview**, **Add photo**, reorder (drag or arrows), turn a photo on or off, mark it ★ featured or as the *hero-hair* photo, assign the special roles (first photo, grand reveal, the two of you). |
| **Chapters** | Turn chapters on or off and see how many photos each has. |
| **Messages** | Every word in the film: greetings, chapter lines, captions, the letter, the credits. **Your memories** (at the top) is where the letter gets personal, and **How it began (your memories)** right below it is your story, one memory at a time, each with its own photos: see below. |
| **Audio / Video** | Your own song, a voice note for the letter, a video message. |
| **Theme** | Film grain, particle amount, golden ribbon on/off. |
| **Settings** | Names, birth date, your name, the countdown unlock time (IST), WhatsApp number for the hug, colour-grading strength. |
| **Preview** | **Preview draft** plays the real film with your unpublished changes. **Preview published** shows exactly what's live. Both open in a new tab. Nothing goes live until you publish. |
| **Publish / Export** | Publish saves everything to GitHub in one go (live in 1–2 minutes). Export downloads a zip instead. |

**Save draft** keeps your work on that device. **Reset** throws the draft away. Before publishing, the admin warns about missing photos and blocks real errors. It also warns you before you leave with unsaved changes.

### Her 36 photos (already in)
The 36 photos from your PDF are imported and placed by character. [docs/PHOTOS.md](docs/PHOTOS.md) lists every page and where it appears: college photos for how you met, the window selfies for the journeys, festive outfits for the festival, night and fairy-light photos for the lanterns, and the long-hair photos on the golden thread. Captions and dates are left empty for you to add. Nothing was guessed. To move or replace a photo, use the Photo library.

### Adding or replacing photos
**Use the admin.** Don't copy files into folders by hand. The admin:
- keeps your **original file untouched** in `photos/originals/` (in the repository; the website itself only serves the film copies),
- makes a cropped, gently colour-graded display copy in `photos/` and a thumbnail in `photos/thumbs/`,
- records everything in `data/photos.json`.

Where photos live (counts are flexible, chapters adapt):

| Chapter | Now | Shape | Best photos |
|---|---|---|---|
| Prologue (first photo she sees) | 1 | 4:5 | Her prettiest solo portrait |
| Tower walls | 5 | 3:4 · 4:5 · 4:3 | Candid, warm, everyday moments |
| How it began | 10 | any (its own shape) | Photos for each memory (link each to its memory) |
| Golden thread (polaroids) | 5 | 3:4 | Her long hair; mark one **Hero-hair** |
| Her names | 2 | 4:5 | One each for Deepu and Kuchu Puchu |
| Festival | 6 | 3:4 | Happy, fun, festive |
| Photo lanterns | 5 | 1:1 | Soft, glowy, night lights |
| The letter | 1 | 3:4 | A warm one |
| Finale | 1 | 4:5 | The final photograph (+ optionally one of **both of you**, marked *together*) |

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

### Making the letter yours (Messages → Your memories)
Nothing in the film invents memories, inside jokes or stories about her. The letter is built around seven boxes only you can fill:

| Box | Where it goes |
|---|---|
| [MEMORY 1], [MEMORY 2] | Each becomes its own paragraph, in your words |
| [THING I ALWAYS TEASE HER ABOUT] | “And yes, I’m still going to tease you about ___. Forever.” |
| [ONE MOMENT I WILL NEVER FORGET] | “If I had to pick one moment, though, it’s this one: ___” |
| [WHAT I ADMIRE ABOUT HER] | “The thing I admire most about you? ___” |
| [ONE THING I WANT HER TO KNOW] | “And if you only remember one line from this whole film, make it this one: ___” |
| [INSIDE JOKE] (optional) | The P.S. under your signature |

Until a box is filled, the line that uses it is **left out of her film**, so she never sees a placeholder. In **Preview** you'll see it as `[MEMORY 1]` and so on, so you know where it goes. The admin and `npm run check` list what's still empty. You can rewrite any paragraph of the letter (and every other line) under Messages. Nothing needs code.

A few lines are jokes you may want to tune to your friendship: the documentary narrator and the three name cards in **Her names**, the festival lines, and the line after the lanterns. None of them assume what her name means. If “Deepu” comes from a name meaning *lamp* or *light* (Deepa, Deepika…) and that matters to you two, the admin shows where such a joke fits.

### Adding new photos (October, November, December, January…)
Photo library → **Add photo** → choose the chapter (or **Extra memories**) → pick a shape → crop → add a caption and date → **Publish**. There is no limit. Chapters adapt to however many photos they have, and every enabled photo also appears in the finale heart, the credits and the album. Photos of a new memory go in through the memory itself (next section).

### Adding memories later (October, November, December…)
**How it began** (the chapter right after the tower) tells your story through your own memories, in order. Each memory has a date (optional), your words, a style, and its own photos. Nothing is written for you. To add one, say for November:
1. **Messages → How it began (your memories) → Add a memory.**
2. Write **When** (e.g. “November 2026”) and **The memory**, in your own words. Pick a **Style** if you like.
3. Tap **Add photos to this memory** and choose the photos. Each one keeps the shape it was taken in; you just choose what to keep.
4. Use the arrows to put the memory in its place, then **Preview draft** and **Publish**.

A memory with no words and no photos is skipped. Deleting a memory never deletes its photos: they stay in **Photo library → Our story**, shown with the last memory, until you open one and choose another memory under **Belongs to memory**. Moving a photo out of Our story unlinks it.

## 4. The January 3, 2027 release (checklist)

1. In the admin, open **Settings**. Check the unlock time is **3 Jan 2027, 00:00 (IST)** and the countdown lock is **on**. (It's stored with the +05:30 offset, so it opens at midnight India time on any phone, in any time zone.)
2. Photos are in. If you have a photo of the two of you, add it to the Finale and mark it *together* (the hug then shows it as "Deepu & me"). Add captions and dates where you know them.
3. **Messages → Your memories**: fill the boxes (see above), then read the whole letter in Preview.
4. Read through the rest of **Messages** once, especially the jokes, and change anything that doesn't sound like you.
5. Publish, then run the post-upload checks (section 5) or ask Claude to run them and review every photo in place.
6. On your own **Android phone**, with headphones: watch the whole film once with `?preview` (see the real-phone checklist below).
7. Open the live link in a private window: you should see the countdown.
8. Send her the link a little before midnight on **2 January**, so she watches the countdown reach zero.
9. Tell her: *headphones on, lights low, sound up*. The phone stays awake during the film, and on Android it goes full-screen.

### Real-phone checklist (only a real phone can tell you these)
- **Start:** the first screen appears within a few seconds on mobile data; music starts when she taps the lantern.
- **Volume:** comfortable with headphones, and voices/sfx don't spike.
- **Smoothness:** the tower, the festival and the lantern night move smoothly (no long stutters).
- **Cake, microphone:** tapping the mic shows the permission prompt; allowing it shows LISTENING; a normal breath puts the candles out, talking or room noise doesn't; refusing it shows the "Blow them out" button.
- **Cake, cutting:** a swipe across the cake cuts it (and if you wait, it cuts itself).
- **Photos:** faces aren't cut off, text never sits on a face, colours look like her (not orange).
- **Hug:** press and hold works with a thumb; a quick tap gets the "hold longer" nudge.
- **Screen:** after the first tap, Android Chrome goes full-screen; the address bar never covers buttons; nothing scrolls sideways.
- **Fallbacks:** the letter scrolls with a finger, and Continue buttons are easy to reach.

## 5. Quality checks

```bash
npm run check     # content + files + 7,305-day check + secret scan + photo check (shape, weight, GPS/serial left in files)
npm run lint      # ESLint (uses a global eslint)
npm test          # unit tests (content model, admin logic)
npm run e2e       # film smoke test on every chapter + admin flows (needs `npm run serve` running)
NODE_PATH=$(npm root -g) node tests/e2e/admin-qa.cjs      # deep admin QA (184 checks)
NODE_PATH=$(npm root -g) node tests/e2e/admin-visual.cjs  # admin layout audit at 4 sizes (302 checks)
npm run e2e:full  # plays the whole film start to finish (slow in headless Chromium)
npm run e2e:release  # the real midnight-IST unlock, in 5 time zones
npm run build     # production copy in dist/ + every file reference checked (what GitHub Actions deploys)
NODE_PATH=$(npm root -g) node tests/tools/a11y.cjs   # accessibility audit, every chapter, phone + desktop
```

After uploading the photos:
```bash
npm run check                                              # every photo: right shape, not too heavy, no GPS/serial in the public files
NODE_PATH=$(npm root -g) node tests/tools/review-all.cjs   # screenshots of every chapter at the 3 phone sizes, to look at crops, faces and colour
NODE_PATH=$(npm root -g) node tests/tools/perf.cjs         # downloads, memory and frame timing per chapter (headless = slower than a phone)
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
docs/PHOTOS.md             the 36 photos: where each one is used
scripts/                   release checks, photo check, build, photo import
.github/workflows/         GitHub Pages deployment (build → dist/)
tests/                     unit, e2e and visual QA tools
dev/                       developer test pages (cake, ribbon, transitions), not linked from the film
```

Libraries (vendored, no CDN): three.js (MIT), GSAP (standard no-charge licence). Fonts are self-hosted Google Fonts (SIL Open Font License).
