# Photo inventory

The 36 photographs from the PDF (one per page, WhatsApp exports, 720–1754 px). All are solo photos of Deepu; there are no group photos and no photo of the two of you. They were imported with `scripts/import-photos.cjs` (the admin's own pipeline):

- **Originals** in `photos/originals/`: the PDF's JPEG bytes, untouched. There was no camera metadata to strip. Page 4 was stored sideways; it got a standard EXIF orientation tag, and its pixels are unchanged.
- **Display copies** in `photos/` (WebP): cropped to each spot's exact shape around her face, never stretched or upscaled, with the film's gentle colour grade (no retouching, smoothing or reshaping).
- **Thumbnails** in `photos/thumbs/`: 640 px or smaller.

Captions and dates are empty on purpose: the owner can add them in the admin. Change any placement there too (Photo library → Move / Replace), or edit `scripts/photo-import-spec.json` and re-run `npm run import-photos -- <folder>`.

| PDF page | Size | Shape / type | Where it is in the film | Record |
|---|---|---|---|---|
| 1 | 960×1280 | portrait · outdoors · three-quarter | Tower wall | `tower-1` |
| 2 | 960×1280 | portrait · outdoors · full length, small in frame | Golden thread polaroid | `hair-4` |
| 3 | 720×1280 | tall · indoors · green saree, long hair | **Prologue: the first photo she sees** (role *hero*) | `hero` |
| 4 | 1280×720 | landscape selfie (stored sideways) · close-up | How it began · "you'd tell me about your day" | `story-9` |
| 5 | 897×1599 | tall · outdoors · full length | Festival ring | `dance-1` |
| 6 | 960×1280 | portrait · decorated stage · full length | Festival ring | `dance-2` |
| 7 | 1080×1080 | square selfie · by a vehicle window | How it began · journeys (window) | `story-5` |
| 8 | 740×1599 | tall · mirror selfie · full length | How it began · "your day" | `story-10` |
| 9 | 740×1599 | tall · mirror selfie | Golden thread polaroid | `hair-5` |
| 10 | 960×1280 | portrait · evening outdoors · full length | Tower wall | `tower-5` |
| 11 | 960×1280 | portrait · mirror selfie · long hair over one shoulder | Golden thread polaroid (featured) | `hair-3` |
| 12 | 960×1280 | portrait · night, lamplight · full length | Photo lantern | `lantern-2` |
| 13 | 978×1601 | tall · close-up smile | How it began · "we talked every day" | `story-4` |
| 14 | 720×1280 | tall · indoors · lying down, smiling | Pinned to the letter; the hug's polaroid | `letter-1` |
| 15 | 720×1280 | tall · close-up, looking up | Her names · **Kuchu Puchu** | `name-kuchu` |
| 16 | 960×1280 | portrait · from behind, hair past her knees | **Golden thread: the hero-hair moment** | `hair-1` |
| 17 | 960×1280 | portrait · night outdoors · full length | Photo lantern | `lantern-3` |
| 18 | 960×1280 | portrait · over her shoulder, long hair | Golden thread polaroid | `hair-2` |
| 19 | 960×1280 | portrait · night outdoors · full length | Photo lantern | `lantern-5` |
| 20 | 960×1280 | portrait · indoors · three-quarter | Tower wall | `tower-4` |
| 21 | 960×1280 | portrait · indoors · three-quarter | Festival ring | `dance-3` |
| 22 | 960×1280 | portrait · indoors · hair down | Photo lantern | `lantern-4` |
| 23 | 1080×1080 | square selfie · by a vehicle window | How it began · journeys | `story-6` |
| 24 | 1080×1080 | square selfie · by a vehicle window | How it began · journeys | `story-7` |
| 25 | 1080×1080 | square selfie · by a vehicle window | How it began · journeys | `story-8` |
| 26 | 960×1280 | portrait · on a lawn with roses · full length | How it began · "it started at a college event" | `story-1` |
| 27 | 1240×930 | landscape selfie · a rose in her hair | **The final photograph** (role *reveal*) | `finale` |
| 28 | 960×1280 | portrait · indoors · full length | Her names · **Deepu** | `name-deepu` |
| 29 | 1240×697 | wide · corridor · laughing | How it began · the beginning | `story-2` |
| 30 | 720×1280 | tall · sunny garden · full length | Tower wall | `tower-2` |
| 31 | 1240×697 | wide · corridor | How it began · "every day" | `story-3` |
| 32 | 1240×930 | landscape · indoors · half length | Tower wall (4:3) | `tower-3` |
| 33 | 1032×774 | landscape · indoors · half length | Festival ring | `dance-4` |
| 34 | 960×1280 | portrait · indoors · full length | Festival ring | `dance-6` |
| 35 | 987×1754 | tall · fairy lights | Photo lantern (featured) | `lantern-1` |
| 36 | 960×1280 | portrait · lit, decorated gateway · full length | Festival ring (featured) | `dance-5` |

Every photo also appears in the finale's photo heart and the credits. The featured ones lead the last frame around "Happy 20th Birthday".

**Not used as fact:** what a photo shows (a corridor, a window, an outfit) only guided *where* it sits. No caption, date or memory was taken from a photo.
