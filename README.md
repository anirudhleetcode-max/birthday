# For Deepu 🌞🏮

A cinematic, *Tangled*-inspired birthday film-in-a-website for **Deepu** (aka Pinky, aka Kuchu Puchu), born **3 January 2007**, turning **20** on **3 January 2027**.

It plays like a short film: chapters, music, transitions, and moments she interacts with herself (blowing out candles with her breath, cutting the cake, releasing lanterns).

| | Chapter | What happens |
|---|---|---|
| ⏳ | **Countdown** | Before midnight on her birthday she only sees a lantern waiting and a countdown. At midnight it lights up. |
| 🏮 | **Invitation** | "Hey Pinky." She lights the lantern, the music starts and the film begins. |
| ✨ | **Prologue** | *Once upon a time…* a drop of sunlight falls, a golden flower blooms, and it becomes her. |
| 🎨 | **Ch.1 The Girl in the Tower** | You stand inside a painted tower room; her photos are brush-painted onto the walls. Drag to look around. |
| 💛 | **Ch.2 Every Strand, a Memory** | A glowing golden braid with flowers; polaroids hang from it and develop like instant film. |
| 🦎 | **Ch.3 A Girl of Many Names** | Deepu → Pinky → Kuchu Puchu, with a little chameleon who turns pink and blushes. |
| 🎪 | **Ch.4 The Kingdom Dance** | Festival at dusk: bunting, petals, a chalk sun, her photos dancing in a 3D circle. |
| 🌌 | **Ch.5 The Night the Sky Lit Up** | Real 3D: a lake, a kingdom on the water, thousands of lanterns rising, photo-lanterns drifting past. She can tap to release her own. |
| 🎂 | **Ch.6 Make a Wish** | A 3D cake with 20 candles. She **blows into her phone** to blow them out, then **swipes to cut** it. Confetti, colour bursts, Happy Birthday music box. |
| 💌 | **Ch.7 The Letter** | A wax-sealed envelope; the letter writes itself out in handwriting. (Optional: your voice note.) |
| 🎥 | *(optional)* **Video message** | Only appears if you upload one. |
| 💖 | **Finale** | Every photo flies in and forms a heart, it beats, we fly through it into light: **Happy Birthday, Deepu**, with fireworks. Then a photo of you two and a **Send a hug** button. |
| 🎬 | **Credits** | Movie-style end credits over a slideshow, then: *The end of chapter nineteen. Chapter twenty begins now.* |

All music is **composed and synthesized live in the browser** (an original lullaby-waltz plus a music-box *Happy Birthday*), so there are no copyright problems. You can also upload your own song in the admin. No Disney artwork, audio or logos are used; everything is original and only *inspired by* the film.

---

## 1. Put it online (one time, about 3 minutes)

The site is plain HTML/JS. There's no build step, so **GitHub Pages** can host it for free:

1. Merge this work into the `main` branch (or ask Claude to do it).
2. On GitHub: **Settings → Pages → Build and deployment → Source: "Deploy from a branch" → Branch: `main` / `(root)` → Save.**
3. After about a minute the site is live at **https://anirudhleetcode-max.github.io/birthday/**
4. The admin portal is at **https://anirudhleetcode-max.github.io/birthday/admin/**

> The repo must stay **public** for free GitHub Pages. The countdown lock (below) keeps the content hidden until her birthday.

## 2. The admin portal ("The Lantern Room")

Open `/admin/` on your phone or laptop.

**First time: connect it to GitHub** (that's how it saves your changes):
1. github.com → your photo (top-right) → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Name it anything, set **Repository access → Only select repositories → `birthday`**.
3. **Repository permissions → Contents → Read and write.** Generate, copy the token, paste it into the admin. It's stored only in your browser.

**Then you can:**
- **Fill all 36 photo spots.** Use *Fill all empty slots*, pick up to 36 photos at once, and they are auto-cropped to each spot's shape. Review each one and tap *Adjust* to re-frame it.
- **Replace any photo, anytime** (Oct, Nov, Dec…). 📏 **The rule:** every spot has a fixed shape (for example 3:4). A replacement **must be the same shape** as the photo before it. If your new photo is a different shape, the admin opens a cropper **locked to that exact shape**, so the result always matches.
- **Add new memories ("Extra memories"), as many as you like.** Choose a shape when adding (3:4, 4:5, 1:1, 4:3, 16:9) and that shape is then locked for that memory too. Extras appear in the finale heart, the end-credits slideshow, and a "More memories" album at the end.
- **Colour grading.** Every uploaded photo is automatically graded into one warm, golden "lantern-night" palette so all of them look like the same film. Adjust the strength in Settings, and re-grade everything from the stored originals with one button.
- **Edit every word**: greetings, chapter lines, captions under the polaroids, the letter, the credits, your name.
- **Music & video**: upload your own song (it replaces the built-in score), a video message, or a voice note for the letter.
- **Settings**: unlock date/time, turning the countdown lock on or off, your WhatsApp number (the *Send a hug* button opens WhatsApp to you with a message), and grading strength.
- **Preview** your changes before publishing. **Publish** saves everything to GitHub in one go, and the live site updates in about 1–2 minutes.

## 3. The 36 photo spots

Every spot's shape is fixed (that's the replacement rule). Prepare photos roughly in these shapes, or just upload and crop.

| # | Spot | Chapter | Shape (locked) | Best photo for it |
|---|---|---|---|---|
| 1 | `hero` | Prologue | **4:5** | Her prettiest solo portrait. This is the first photo she sees. |
| 2 | `tower-1` | Ch.1 The Tower | **3:4** | A candid where she's laughing |
| 3 | `tower-2` | Ch.1 The Tower | **1:1** | A childhood-ish or old memory |
| 4 | `tower-3` | Ch.1 The Tower | **4:5** | Her doing something she loves |
| 5 | `tower-4` | Ch.1 The Tower | **4:3** | A wide photo — a trip, a place, a moment |
| 6 | `tower-5` | Ch.1 The Tower | **3:4** | Her being silly / making a face |
| 7 | `tower-6` | Ch.1 The Tower | **4:5** | Her looking out somewhere, dreamy |
| 8 | `hair-1` | Ch.2 Golden Hair | **3:4** | Instax-style memory. Edit the handwritten caption in Words → Captions. |
| 9 | `hair-2` | Ch.2 Golden Hair | **3:4** | Instax-style memory. Edit the handwritten caption in Words → Captions. |
| 10 | `hair-3` | Ch.2 Golden Hair | **3:4** | Instax-style memory. Edit the handwritten caption in Words → Captions. |
| 11 | `hair-4` | Ch.2 Golden Hair | **3:4** | Instax-style memory. Edit the handwritten caption in Words → Captions. |
| 12 | `hair-5` | Ch.2 Golden Hair | **3:4** | Instax-style memory. Edit the handwritten caption in Words → Captions. |
| 13 | `hair-6` | Ch.2 Golden Hair | **3:4** | Instax-style memory. Edit the handwritten caption in Words → Captions. |
| 14 | `hair-7` | Ch.2 Golden Hair | **3:4** | Instax-style memory. Edit the handwritten caption in Words → Captions. |
| 15 | `hair-8` | Ch.2 Golden Hair | **3:4** | Instax-style memory. Edit the handwritten caption in Words → Captions. |
| 16 | `name-deepu` | Ch.3 Her Names | **4:5** | Her classic, everyday self. |
| 17 | `name-pinky` | Ch.3 Her Names | **4:5** | Her cutest photo — ideally with something pink. |
| 18 | `name-kuchu` | Ch.3 Her Names | **4:5** | The most adorable / goofy one. |
| 19 | `dance-1` | Ch.4 Kingdom Dance | **3:4** | Happy, festive, fun moments. |
| 20 | `dance-2` | Ch.4 Kingdom Dance | **3:4** | Happy, festive, fun moments. |
| 21 | `dance-3` | Ch.4 Kingdom Dance | **3:4** | Happy, festive, fun moments. |
| 22 | `dance-4` | Ch.4 Kingdom Dance | **3:4** | Happy, festive, fun moments. |
| 23 | `dance-5` | Ch.4 Kingdom Dance | **3:4** | Happy, festive, fun moments. |
| 24 | `dance-6` | Ch.4 Kingdom Dance | **3:4** | Happy, festive, fun moments. |
| 25 | `dance-7` | Ch.4 Kingdom Dance | **3:4** | Happy, festive, fun moments. |
| 26 | `dance-8` | Ch.4 Kingdom Dance | **3:4** | Happy, festive, fun moments. |
| 27 | `lantern-1` | Ch.5 Lanterns | **1:1** | Soft, glowy, emotional moments. |
| 28 | `lantern-2` | Ch.5 Lanterns | **1:1** | Soft, glowy, emotional moments. |
| 29 | `lantern-3` | Ch.5 Lanterns | **1:1** | Soft, glowy, emotional moments. |
| 30 | `lantern-4` | Ch.5 Lanterns | **1:1** | Soft, glowy, emotional moments. |
| 31 | `lantern-5` | Ch.5 Lanterns | **1:1** | Soft, glowy, emotional moments. |
| 32 | `lantern-6` | Ch.5 Lanterns | **1:1** | Soft, glowy, emotional moments. |
| 33 | `letter-1` | Ch.7 The Letter | **1:1** | A photo of you two, if possible. |
| 34 | `letter-2` | Ch.7 The Letter | **3:4** | Any photo that means a lot. |
| 35 | `finale` | Finale | **4:5** | Her single best photo. Saved for the big birthday reveal. |
| 36 | `us` | Finale | **4:5** | A photo of BOTH of you. It appears with ‘come here, hug me’. |

## 4. The countdown lock

`settings.lock` in `data/site.json` (editable in the admin's Settings) defaults to **unlock at 2027-01-03 00:00 IST**. Before that, visitors only see the countdown. When the clock hits midnight, the lantern lights and an *Open your gift* button appears, with no reload needed.

**To watch it yourself before then**, add `?preview` to the address:
`https://anirudhleetcode-max.github.io/birthday/?preview`

Handy for testing: `?preview&scene=lanterns` jumps straight to a chapter (`prologue`, `tower`, `hair`, `names`, `dance`, `lanterns`, `cake`, `letter`, `finale`, `credits`). `?draft` shows your unpublished admin changes (on the same device).

## 5. Tips for the big moment
- Send her the link **just before midnight** on 2 Jan (IST). She'll see the countdown tick to zero.
- Tell her: **headphones on, lights low, sound up**. The phone stays awake during the film, and on Android it goes full-screen.
- When the cake comes, she can **really blow into the phone** (she'll be asked for microphone permission; there's always a tap fallback).
- It's built for phones first, and also looks great on a laptop.

## Project structure

```
index.html              the film
admin/                  the admin portal (The Lantern Room)
data/site.json          all words, settings and the 36 photo slots (edited by the admin)
photos/                 graded photos (+ originals/ for re-grading, extras/)
media/                  optional music / video / voice note
assets/css/             styles (main.css, scenes.css)
assets/js/main.js       the projector: runs chapters, transitions, shared context
assets/js/core/         audio engine, effects, subtitles, transitions, artwork, data
assets/js/scenes/       one file per chapter
assets/js/shared/       colour grading + drafts (shared by site and admin)
assets/vendor/          three.js (MIT), GSAP (standard no-charge license)
assets/fonts/           self-hosted Google Fonts (SIL Open Font License)
```

Run it locally with any static server, e.g. `npx http-server . -c-1` then open `http://localhost:8080/?preview`.
