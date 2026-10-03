# Architecture & Art Bible — "For Deepu"

A static, no-build, interactive **film** for Deepu's 20th birthday (born 3 Jan 2007 → 20 on **3 Jan 2027**, exactly **7,305 days** / **240 months**). The visual DNA is a *Tangled*-inspired lantern-lit fairy tale, but everything (geometry, illustrations, music, characters) is **original**. Her **real photographs are the protagonist**, our friendship is the story, and lanterns / golden light / tower / flowers / the sun motif / a golden ribbon are the cinematic language.

Emotional arc: **curious → beautiful → funny → nostalgic → personal → magical → emotional → overwhelmingly sweet → happy**.
Target reaction: *"They actually made something this huge just for me?"*

---

## 1. Runtime

```
index.html                 the film (import map: 'three', 'three/addons/'; GSAP globals incl. CustomEase, DrawSVG, MotionPath, SplitText, Physics2D)
assets/js/main.js          the projector — chapter list, transitions, shared ctx, quality tiers
assets/js/core/            shared engines (ui, fx, audio, data, transitions, ribbon, lanternfield, chameleon, eggs, art, sky)
assets/js/scenes/<id>.js   one module per chapter (default export {id, title, enter(ctx, el), exit()})
assets/js/shared/          code shared with the admin: model.js (content model), drafts.js, grade.js
assets/css/main.css        tokens, layers, UI
assets/css/scenes/<id>.css per-chapter styles (each chapter owns its file)
data/settings.json | messages.json | photos.json   all content (edited by the admin)
admin/                     "The Lantern Room" CMS
```

### Story order (main.js `CHAPTERS`)
| id | title (shown via messages.<id>.title) | via (transition in) | grade | music mood |
|---|---|---|---|---|
| gate | countdown (only before unlock) | — | night | none (no sound before a tap) |
| invite | "Hey Pinky." + Enter | fade | night | — (first tap starts sound → hush) |
| prologue | Once Upon a Deepu | lantern | dawn | hush → tender → wonder |
| tower | A Tower Full of You | sun | day | tender |
| hair | The Golden Thread | ribbon | sunset | wonder |
| names | A Legend of Many Names (funny) | ember | sunset | festive/sfx comedy |
| dance | Somewhere Between Chaos and Magic | petals | twilight | festive |
| lanterns | The Night of Lanterns | lantern | night | wonder → soar |
| letter | A Letter You Were Supposed to Read | ember | candle | tender |
| cake | Twenty Candles | curtain | candle | hush → festive + happyBirthday |
| video | (optional) | fade | candle | ducked |
| constellation | Every Little Piece of You | dust | deep | quiet → wonder |
| birthday | 7,305 Days → The Last Lantern | none (continuous) | golden | quiet → soar |
| hug | One Last Thing | ember | golden | tender |
| credits | credits + post-credits | fade | deep | tender → quiet |

Chapters can be switched off in `settings.chapters` (admin → Chapters). A chapter must work with **any number of photos** in its photo chapter (including 0 → graceful placeholder/skip of the photo beat).

### Scene module contract
```js
export default {
  id: 'tower',
  title: 'A Tower Full of You',
  async enter(ctx, el) { /* build inside el (an empty full-viewport <section class="scene scene-tower">), run the beat, finally: await ctx.ui.waitContinue('Continue'); ctx.next(); */ },
  async exit() { /* kill timers, listeners, rAF, WebGL (dispose geometries/materials/textures/renderer), audio elements, mic tracks */ },
};
```
`enter` may be long-running; guard async steps — `ctx.wait()` rejects with AbortError when the scene exits (that's expected; let it propagate).

### `ctx` (main.js `makeCtx`)
```js
ctx.id, ctx.title, ctx.site (combined content), ctx.text (= messages), ctx.store
ctx.photos(chapter, {limit}) → Photo[]        // enabled photos of a photo-chapter, in order (placeholders if no image yet)
ctx.photo(id) → Photo
ctx.role('hero' | 'reveal' | 'together') → Photo   // special photos (falls back sensibly)
ctx.featured() → Photo[]   ctx.heroHair() → Photo|null   ctx.extras() → Photo[] (album)   ctx.allPhotos() → Photo[]   ctx.realPhotos() → Photo[]
ctx.media('music'|'video'|'voice') → url|null
ctx.daysAlive() → 7305 (at the unlock moment)
ctx.fill(str)            // replaces {name} {nick1} {nick2} {creator} {photoCount} {days} {age}; ui.* calls fill automatically
ctx.preload(url) → Promise<HTMLImageElement|null>
ctx.gsap, ctx.audio, ctx.fx, ctx.ui, ctx.eggs, ctx.device, ctx.theme, ctx.signal
ctx.wait(seconds)        // abortable sleep
ctx.letterbox(true|false|'8vh')
ctx.grade(name)          // override the film grade: night | dawn | day | sunset | twilight | candle | deep | golden
ctx.handoff({x, y, color, kind})  // tell the NEXT transition where its light comes from (continuity); also ctx.next(handoffInfo)
ctx.incoming             // the previous chapter's hand-off {x, y, color, kind, from} | null (use it for seamless 'none' transitions)
ctx.next(handoffInfo?)   ctx.restart()   ctx.openGallery({only:'extras'|'all'})   ctx.immersive()   ctx.startSound()
```

**Photo object**
```js
{ id, chapter, order, role, label, caption, date, alt, ratio /*w/h number*/, ratioStr, focal:{x,y} /*0..1*/, objectPosition /*css*/,
  featured, heroHair, animation, effect, duration, isPlaceholder, url /*display ≤1800px*/, thumbUrl /*≤640px*/ }
```
Always use `object-fit: cover; object-position: photo.objectPosition` (faces live near the focal point). Use `thumbUrl` for small tiles (heart mosaics, galleries, textures < 400px on screen). `alt` on every `<img>`.

**ctx.device**: `{ mobile, lowPower, reducedMotion, tier: 'low'|'mid'|'high', dpr, portrait }`. Scale particles/shadows/post by tier; with `reducedMotion` remove camera drift/parallax, shorten/soften motion, keep the story usable.

**ctx.ui**: `narrate(lines, {hold, gap, style:'big'|'whisper'|'title'|'hand', position:'bottom'|'top'|'center', duck})`, `say(text)→{hide()}`, `chapterCard(kicker, title)`, `waitContinue(label)`, `hint(text)→{remove()}`, `fill(t)`.
**ctx.fx** (2D overlay above scenes): `confetti({x,y,angle,spread,count,power,colors})`, `cannons()`, `rain(n)`, `colorBurst({x,y,colors,size})`, `sparkle(x,y,n,{spread,pink})`, `firework({x,y,color})`, `flash({color,duration,peak})`, `dust({density,speed,alpha})`, `trail(on)`, `clear()`.
**ctx.audio**: `sfx(name)`, `setMood('hush'|'tender'|'wonder'|'festive'|'soar'|'quiet')`, `duck(level0to1, holdSeconds)` (falls to level, holds, restores smoothly), `happyBirthday()→Promise`, `context`. SFX: chime shimmer whoosh swell sparkle pop candleOut blow heartbeat pageTurn lanternRise tap magic braam choir drumroll scratch clang wind bells.
**ctx.eggs**: `found(id, message)`, `has(id)`, `count`, `total`. Secret ids are listed in `core/eggs.js` (`SECRETS`). Eggs are optional — the film never depends on them.

---

## 2. Content model (assets/js/shared/model.js)

Three files; in memory one combined object `{ version:2, her, from, settings, media, chapters, text, photoChapters, photos }`.

`data/photos.json` → `{ version, chapters:{}, photos:[Photo record] }` — **no photo limit**. Record:
```
id, chapter (prologue|tower|hair|names|dance|lanterns|letter|finale|album), order (1..n within chapter), role (hero|reveal|together|null),
label, hint, ratio "w:h" (LOCKED — replacements must match), src (display image), thumb, original (untouched upload),
crop {x,y,w,h} normalised in original | null, cropMode cover|contain, focal {x,y} 0..1 in display image,
caption, date, alt, enabled, featured, heroHair, grade {strength|null, warmth, exposure}, animation, effect, duration, addedAt, updatedAt
```
Display files are derived (crop + colour grade) and regenerable from `original`; originals are never modified.
Files: display `photos/<id>-<stamp>.webp|jpg` (≤1800 px, exact ratio, graded), thumbnail `photos/thumbs/<id>-<stamp>.jpg` (≤640 px), original `photos/originals/<id>-<stamp>.<ext>` (byte-for-byte upload). Publishing deletes replaced files in the same commit. Unknown fields added by hand to a photo record or to the top level of settings.json/photos.json are preserved.
Optional per-photo hints (null = the chapter decides): `animation` ∈ kenburns-in | kenburns-out | pan-left | pan-right | drift | none; `effect` ∈ glow | sparkle | petals | lanterns | none; `duration` ∈ 3 | 4 | 5 | 6 | 8 | 10 (seconds on screen where a chapter shows photos one at a time, e.g. credits, album slideshow). `cropMode: 'contain'` display files already include their own blurred surround, so cover-fitting them is safe. `settings.theme.ribbon === false` turns off the decorative golden-ribbon flourishes and the `ribbon` transition (chapter-essential threads stay).

`data/messages.json` → every word on screen, grouped by chapter id (see §4). `data/settings.json` → `her {name, nicknames[], birthDate}`, `from {name, signoff}`, `settings {lock {enabled, unlockAt}, grading {strength}, whatsapp, github {owner, repo, branch}, theme {grain, particles, ribbon}}`, `media {music, musicTitle, video, videoCaption, voice}`, `chapters [{id, enabled}]`.

Nicknames: **Deepu**, **Pinky**, **Kuchi Puchi** (owner-editable; use `{nick1}`/`{nick2}` or `ctx.site.her.nicknames`). Don't overuse them.

---

## 3. Shared engines (contracts)

### core/ribbon.js — the golden ribbon (2D, the film's signature motif)
Inspired by Deepu's very long hair; it represents memories / time / connection. It must look like **warm silk made of light**: smooth Catmull-Rom splines, 3–7 soft strands with slight offsets and parallax, soft glow (not neon, no rainbow), a bright head, a few shed particles, natural secondary motion.
```js
import { createRibbon, ribbonPaths } from '../core/ribbon.js';
const rib = createRibbon(containerEl, { strands = 5, width = 2.2, glow = 1, color = '#ffd98a', particles = true, zIndex, device });
rib.setPath(points /* [{x,y}] px in container coords */)
await rib.draw({ duration = 2.5, ease = 'power2.inOut', from = 0, to = 1 })   // the head travels along the path
rib.flow(true|false)                                  // shimmer travelling along the visible ribbon
await rib.morph(points, { duration })                 // reshape (any point count; resampled)
rib.follow(() => points)                              // per-frame points (e.g. projected 3D photo positions) — pass null to stop
rib.head() → {x, y}
await rib.fade(alpha, duration)
await rib.dissolve({ duration })                      // breaks into golden dust
rib.destroy()
ribbonPaths.wave(w, h, opts) | heart(cx, cy, size, n) | circle(cx, cy, r, n, turns) | through(points, {loose}) | twenty(box) | timeline(x0, x1, y, n) | spiral(...)
```
Usage budget (quality over quantity): 1 major introduction (tower window → *ribbon* transition into the Golden Thread), 2–3 subtle chapter appearances (golden thread connecting polaroids, lantern links, 7,305 timeline), 1 cake appearance (3D strand lighting the 20 candles — cake's own), 1 major finale appearance (ribbon connects photos and curves into the heart; draws "20").

### core/lanternfield.js — 3D lanterns (Three.js), shared by `lanterns`, `constellation`, `birthday`
*(Implemented API is a superset of the sketch below — read the header comment of core/lanternfield.js: `formShape` returns `Promise<indices>`; also `releaseShape`, `rebase`, `extinguish`, `pin`, `positionOf`, `screenOf`, `visible`, `nearest`, `setIntensity`, `setExposure`, `setHaze`; options `water`, `haze`, `wind`, `size`, `exposure`, `intensity`; photo-lantern `setClarity`, `hiRes`, `isReady`, `size`; ribbon `setPoints`, `setOpacity`, `setWidth`, `head`. The field is driven by your own clock via `field.update(time, dt)`; `wave({start})` is relative to `field.time` (negative = already risen).)*
GPU-animated instanced lanterns with depth layers (foreground / midground / background / far), varied size/brightness, haze, water reflections, plus photo-lanterns (glass-like glow around a real photo) and a 3D ribbon.
```js
import { createLanternField, createPhotoLantern, createRibbon3D } from '../core/lanternfield.js';
const field = createLanternField({ scene, camera, renderer, device, max });   // adds itself to scene
field.wave({ count, from: {x:[a,b], y:[a,b], z:[a,b]}, start, spread, speed:[a,b], scale:[a,b], warmth })  // schedule births (seconds from now)
field.release(worldPos, { speed, scale })      // one lantern now (user taps, "a single lantern appears")
field.formShape(points3D, { duration })        // gather N lanterns into a shape (heart constellation)
field.update(time, dt); field.dispose()
const pl = createPhotoLantern(photo, { size, device });  // THREE.Group with .setOpacity(a), .update(time, camera), .dispose()
const r3 = createRibbon3D({ points, color, width }); r3.setProgress(0..1); r3.update(time); r3.dispose()
```

### core/transitions.js
`transition(type, swap, opts)` where `opts = { handoff:{x,y,color,kind,from}, to, device, audio, letterbox }`.
Types: `fade`, `glow`, `iris`, `curtain`, `dream` (existing) + **`lantern`** (a lantern rises through frame; its light becomes the next world), **`sun`** (storybook iris shaped like the sun motif), **`ribbon`** (golden strands enter, weave into a glowing path, the camera follows it into the next chapter — the major hair-inspired transition), **`ember`** (a spark travels from `handoff` and blooms), **`petals`** (a soft petal swirl), **`dust`** (the frame dissolves into golden dust), **`page`** (storybook page turn). All must respect `device.reducedMotion` (→ gentle crossfade) and be ≤ ~2.6s total.

### scenes/cake.js + scenes/cake/ — Twenty Candles (Three.js)
Phases: `reveal → wish → ignite → blow → dark → party → cut → served → done`.
- `model.js` / `geometry.js` / `textures.js`: the cake (two cuttable fondant tiers, gold drips, sugar flowers, 20 spiral candles, sun-plaque topper). Every texture is painted at runtime, with no network.
- `strand.js`: the golden strand (her hair motif) that travels along a spline and lights the 20 wicks.
- `flames.js` / `smoke.js` / `particles.js`: instanced flames and halos, smoke wisps, glitter and crumbs (one draw call each).
- `blow.js`: conservative mic breath detection (0.7 s calibration, 150 ms of broadband low-frequency energy over ≥4 frames). Fallbacks: "Blow them out" button, swipe across the candles, or hold Space. The fallback button appears after 12 s of silence or if the mic is denied. The mic track is stopped on exit.
- `room.js`: the midnight room, bokeh lights and table.
- Cutting: swipe (or Enter/Space) to cut, then the slice is plated. Exit disposes the renderer and forces context loss.
- Tiers: low (DPR ≤ 1.25, no shadows/AA/bloom), mid (512 shadows), high (1024 shadows + light bloom). Reduced motion: no camera drift, a short strand sweep, shorter timings.
- Dev harness: `dev/cake.html` with `dev/mock-ctx.js`.

### core/chameleon.js — an ORIGINAL tiny chameleon companion (not Pascal)
Own silhouette, proportions, palette and personality (e.g. rounder, tear-drop body, star-shaped crest, freckles, a curly tail with a tiny leaf, sleepy half-lid eyes). API: `createChameleon(container, {size, color}) → { el, peek(side), hide(), colorTo(hex), blush(), react('surprised'|'happy'|'sleepy'|'proud'), lookAt(x,y), destroy() }`. Appears rarely: names (turns pink), credits, a hidden peek or two. Easter egg `chameleon` when tapped.

---

## 4. messages.json schema (every key optional — scenes keep sensible fallbacks)
```
personal { memory1, memory2, tease, neverForget, admire, wantHerToKnow, insideJoke }   ← the owner's own words
invite   { greeting, lines[], button, foot }
gate     { kicker, title, sub, openKicker, openTitle, openSub, button }
prologue { kicker, title, lines[], titleSub, date }
tower    { kicker, title, lines[], windowLine, hint }
hair     { kicker, title, lines[], heroHairLine, endLine }
names    { kicker, title, documentary[], items:[{name, line, sub}], aka, finale }
dance    { kicker, title, lines[], hint }
lanterns { kicker, title, lines[], tapHint, photoHint, after, secret }
letter   { kicker, title, salutation, body[], signoff, ps, tapSeal, fasterHint }
cake     { kicker, title, lines[], blowHint, tapFallback, afterBlow, cutHint, afterCut, wish }
constellation { kicker, title, lines[], handwritten }
birthday { years, months ('' = no line), days, memories, somehow, beginning, lanterns[], big, name, loved[], closing }
hug      { lines[], holdHint, holdLonger, done[], message }
credits  { opening, roles:[[role, name]], end, endSub, postCredits[], extrasTitle, extrasSub, secrets }
gallery  { allTitle, allKicker }
```
Tokens allowed anywhere: `{name} {nick1} {nick2} {creator} {photoCount} {days} {age}`, plus the memories `{memory1} {memory2} {tease} {neverForget} {admire} {wantHerToKnow} {insideJoke}`.

**Nothing personal is invented.** `fillText()` (shared/model.js) returns `''` for a line that uses a memory nobody has written yet, or that still holds a hand-typed `[PLACEHOLDER]`; `ui.narrate`, the letter and the credits leave such lines out. In `?preview` the line shows with its `[LABEL]` instead, so the owner can see where it goes. `validate()` / `npm run check` list what's still empty.

---

## 5. Art bible

**Palette (one film):** warm gold `#f4c463` / `#ffe3a3`, deep midnight blue `#0b1030`→`#141a46`, indigo/violet `#24113d` `#3b1a57` `#6b3fa0`, soft cream `#fff4e0`, warm rose `#f2a7c3`, lavender `#b9a3e3`, lantern amber `#ffb347`. No neon, no rainbow gradients, no random colours per chapter.
**Day → night journey:** dawn (cream/peach/soft pink) → day (warm cream, sunlight) → sunset (gold/rose/violet) → twilight (violet/blue) → night (midnight blue/indigo + amber) → candle (intimate amber) → deep (midnight + gold) → golden finale.
**Type:** Cinzel Decorative (cinematic titles, sparingly), Cinzel (small caps kickers), Cormorant Garamond (narration, italic), Great Vibes (names, signatures — sparingly), Caveat (handwritten notes). Not everything uppercase; typography breathes; one loud element per screen at most.
**Textures:** extremely subtle film grain, paper/parchment, watercolour washes, soft bloom. Expensive, never dirty.
**Motifs:** lanterns (recurring language: depth, haze, sizes, drift), original sun emblem (`core/art.js sunEmblem()`), flowers (elegant, sparing), the golden ribbon (see budget), tower atmosphere, storybook flourishes.
**Humour:** inside-joke, not childish: treating nicknames like legendary titles with absurdly epic effects, a fake serious documentary narrator, a chameleon reaction, a frying-pan-*inspired* joke (original skillet silhouette; never the movie prop).
**Photos are always real:** never alter her face/identity; only grading, framing, light, particles, reflections around them. Every photo group gets a **distinct** treatment (painted walls, hanging polaroids on the golden thread, legendary title frames, 3D festival carousel, photo-lanterns, pinned in the letter, constellation/heart, credits Ken Burns, album).
**Copyright boundary:** no Disney/Tangled footage, screenshots, artwork, logos, character designs, music, dialogue; no frame-for-frame recreations. Original everything.

## 6. Quality bar
Mobile first (WhatsApp → phone). Must look right at 390×844, 393×852, 412×915, 768×1024, 1366×768, 1440×900: no horizontal scroll, clipped text, overlapping UI, unreadable captions or unreachable buttons. Touch + mouse + keyboard (Enter/→/Space continue). No console errors; dispose everything on exit; cap particles; lazy/decoded images; reduced-motion path. Ask: *does this look like a $10,000 interactive film, or a template?* If template — keep polishing.
