/** HELP — a friendly guide for the owner. */
import { state, liveUrl } from '../state.js';
import { prettyIst } from '../util.js';
import { h } from '../ui.js';
import { sectionHead } from './common.js';

export function renderHelp() {
  const item = (title, open, ...body) => h('details.help-item', { open }, h('summary', title), h('div.help-body', ...body));
  const live = liveUrl();
  const unlock = prettyIst(state.site.settings.lock.unlockAt);
  return h('div.help',
    sectionHead('Help', 'How the Lantern Room works', 'Everything you change is saved on this device as a draft. Nothing reaches the real site until you press Publish.'),
    h('div.help-list',
      item('The three buttons at the top', true,
        h('p', h('b', 'Save draft'), ' — keeps your work on this device (it also saves automatically every few seconds).'),
        h('p', h('b', 'Preview'), ' — opens the film in a new tab with your draft, exactly as she’ll see it.'),
        h('p', h('b', 'Publish'), ' — sends everything to the real site in one go.'),
        h('p', 'The ⋯ menu has ', h('b', 'Export'), ' (a .zip of the content + new files, if you ever host it yourself) and ', h('b', 'Reset changes'), ' (throw the draft away and go back to what’s live).')),
      item('Replacing a photo — the “same shape” rule', false,
        h('p', 'Every photo has a fixed shape, shown on its badge (for example ', h('b', '4:5'), ' = portrait, ', h('b', '1:1'), ' = square, ', h('b', '16:9'), ' = wide).'),
        h('p', 'If the new photo has the same shape, it’s used straight away. If not, you’ll see a note like ', h('b', '“Expected ratio: 4:5 · Uploaded ratio: 16:9”'), ' and three choices:'),
        h('ul',
          h('li', h('b', 'Crop'), ' — pick the part to keep (the frame starts centred on the face).'),
          h('li', h('b', 'Contain'), ' — show the whole photo, framed by a soft blurred extension of itself.'),
          h('li', h('b', 'Choose another photo'), '.')),
        h('p', 'Photos are never stretched, and never cut without you seeing it first.')),
      item('Adding photos later (December, January, any time)', false,
        h('p', 'Go to ', h('b', 'Photo library → Add photo'), ', choose the chapter and a shape, pick one or many photos, crop, add a caption. There’s no limit, and the film adapts to however many photos each chapter has.'),
        h('p', 'Extra memories (the album) appear in the finale and after the credits — perfect for photos from her birthday itself.')),
      item('Editing a photo', false,
        h('p', 'Tap a photo (or ', h('b', 'Edit'), ') to change its caption, date, description, chapter, special part (hero / grand reveal / you two), “Featured”, the hero-hair moment, or hide it.'),
        h('p', 'Tap the face in the preview to set the ', h('b', 'focal point'), ' — the film keeps it in view. ', h('b', 'Re-crop from original'), ' and the colour sliders always work from your untouched original.')),
      item('Colour grading', false,
        h('p', 'Every photo shown in the film is a gently graded copy so they all feel like one film: evened-out brightness, soft highlights, a touch of warmth. Skin tones are protected. Your originals are never changed.'),
        h('p', 'Change the overall strength in ', h('b', 'Settings → Colour grading'), ' (then “Re-grade all photos”), or per photo in its editor.')),
      item('Previewing', false,
        h('p', 'Preview always shows your draft and skips the countdown. Use the ', h('b', 'Preview'), ' section to jump straight to one chapter. Nobody else can see your draft — it lives only on this device.')),
      item('Publishing — how long does it take?', false,
        h('p', 'Press ', h('b', 'Publish'), '. Everything goes to the site in one go. ', h('b', 'The live site updates about 1–2 minutes later'), ' (refresh if it still looks old).'),
        h('p', 'If something blocks publishing (a real problem), the checks tell you exactly what. Gentle reminders like “2 photo spots are still empty” never block — empty spots show a pretty placeholder.'),
        live ? h('p', 'The live site: ', h('a', { href: live, target: '_blank', rel: 'noopener' }, live)) : null),
      item('3 January — release day checklist', false,
        h('ol.steps',
          h('li', 'A day or two before: open ', h('b', 'Preview'), ' and watch the whole film once, with sound, on your phone.'),
          h('li', 'Check ', h('b', 'Settings → Countdown lock'), ': it’s on, and set to ', h('b', unlock), '.'),
          h('li', 'Check the ', h('b', 'Preview → Before you publish'), ' list, then ', h('b', 'Publish'), ' (well before midnight — it takes 1–2 minutes to go live).'),
          h('li', 'Open the live site on your phone: you should see the countdown. At the unlock moment it opens by itself.'),
          h('li', 'Send her the link (WhatsApp is perfect). Tell her: headphones on, lights low. ✨'),
          h('li', 'After her birthday you can keep adding memories — the same way, any time.'))),
      item('What is the “token”?', false,
        h('p', 'A private key that lets this page update the website on GitHub for you. Make it for this one repository only, with “Contents: Read and write”, expiring a little after her birthday. It is kept only in this browser and is only ever sent to GitHub — never put into the site, your drafts or an export.'),
        h('p', 'On a shared or borrowed device, switch off ', h('b', 'Remember on this device'), ' when you connect (it is then forgotten when the tab closes), or use ', h('b', 'Settings → GitHub → Forget token'), ' afterwards.'),
        h('p', 'Lost the device, or worried? Delete the token on github.com (Settings → Developer settings → Personal access tokens) — it stops working at once. Then make a new one the same way.'),
        h('p', 'Everything in the repository — words, settings and photos — is public, even before her birthday: the countdown only hides the film, not the files.')),
      item('Something went wrong', false,
        h('p', 'Your draft is saved on this device, so nothing is lost if the tab closes. If publishing fails, the message says why — usually an expired token or no internet. Fix that and press Publish again.'),
        h('p', 'iPhone HEIC photos may not open in some browsers: share them as JPEG / “Most Compatible” instead.'))));
}
