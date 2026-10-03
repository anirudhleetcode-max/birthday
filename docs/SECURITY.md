# Security & privacy: the admin, the token, and what's public

This page covers the admin portal (**The Lantern Room**, at `/admin/`): the GitHub token it
uses, how to create one with as little power as possible, how to switch it off, and what other
people can see.

---

## In one minute

- **The site has no passwords.** The admin page is public, but it can't change anything until
  you paste a **GitHub token** into it.
- **Make the token as weak as possible.** It should work on **this one repository**, have
  **Contents: Read and write** and nothing else, and **expire a little after 3 January 2027**.
  The steps are below.
- **The token stays in your browser.** It is only ever sent to GitHub. It is never written into
  the site, your drafts, an export or a link.
- **You can kill it at any time** on github.com. It stops working immediately.
- **Everything you publish is public, including the photos and the letter.** The countdown hides
  the film before her birthday, but it does not hide the files. See
  [What is public](#what-is-public) before you upload anything private.

---

## What the token can do

The admin publishes by saving files into the GitHub repository
(`anirudhleetcode-max/birthday`). GitHub then rebuilds the website from those files. The token
is the key that allows that.

**With the token set up as below, anyone who has it can:**

- read every file in this one repository;
- add, change or delete files in it. For example, they could change the words or photos of the
  film, or break the site.

**They cannot:**

- touch any other repository you own, or your GitHub account, email, password or settings;
- delete the repository, rename it, change who has access to it, or change its settings;
- see or use anything else (issues, Actions, secrets and so on). The token is only given
  "Contents".

If someone else got hold of your token, the worst they could do is make unwanted changes to this
site. Even then, nothing is lost for good: every published version is kept in the repository's
history and can be restored (see [If something went wrong](#if-something-went-wrong)).

---

## Create a minimal token (2 minutes)

1. Sign in on **github.com** as `anirudhleetcode-max`.
2. Open **Settings → Developer settings → Personal access tokens → Fine-grained tokens**, then
   **Generate new token**. Direct link: <https://github.com/settings/personal-access-tokens/new>
3. **Token name:** `Lantern Room`.
4. **Expiration:** choose **Custom** and pick a date a little after her birthday, for example
   **31 January 2027**. You can always make a new one later if you want to keep adding memories.
5. **Repository access:** choose **Only select repositories**, then **birthday**.
   Don't pick "All repositories".
6. **Permissions → Repository permissions → Contents → Read and write.**
   Change nothing else. GitHub adds "Metadata: Read-only" by itself, and that's fine.
7. Tap **Generate token** and copy it. It starts with `github_pat_`. GitHub shows it only once.
8. In the Lantern Room, tap **Connect** (or go to **Settings → GitHub → Add token**), paste it,
   and tap **Connect**.
   - **Remember on this device** is on by default. On your own phone or laptop, leave it on.
   - On a **shared or borrowed** device, switch it **off**. The token is then forgotten as soon
     as you close the tab.

Don't send the token to anyone, paste it into a chat, or save it in a note that syncs to other
people.

---

## Where the token is kept, and where it goes

| | |
|---|---|
| Stored | Only in this browser on this device. "Remember on this device" **on** keeps it in `localStorage` until you forget it. **Off** keeps it in `sessionStorage`, which is gone when the tab closes. |
| Sent to | **Only `https://api.github.com`**, inside the `Authorization` header of each request. The code refuses to attach it to any other address, and the page's security policy (below) blocks connections anywhere else. |
| Never in | The website's files, your **draft** (saved in the browser's IndexedDB), the **Export (.zip)**, any **URL**, the browser console or logs. Automated tests check every one of these. |
| Removed by | **Settings → GitHub → Forget token** clears it from this browser. Forgetting does **not** cancel the token on GitHub. Revoking does (below). |

**One thing to know about GitHub Pages.** Every Pages site of one account shares a single web
address, `anirudhleetcode-max.github.io`. Browsers treat them as one site, so any page published
there could read the remembered token. That includes the film and any other repository the
account publishes with Pages. This site's own code never reads the token, and it loads nothing
from other websites. So: don't publish other Pages projects under this account that run
third-party code (analytics, ads, embedded widgets) while a token is remembered. If you do, switch
**Remember on this device** off.

---

## How to revoke (switch off) the token

Do this if you lose a device, if you think someone saw the token, or once you have finished with
the site.

1. On **github.com**: **Settings → Developer settings → Personal access tokens → Fine-grained tokens**.
2. Open **Lantern Room**, then **Delete** (it might say **Revoke**). It stops working immediately,
   on every device.
3. If you still need to publish, create a new token (steps above) and connect again. Any other
   device that still has the old token just shows "GitHub didn't accept the token".

When the token **expires**, the same thing happens by itself. Your published site keeps working;
you just can't publish until you add a new token.

---

## Why it's safe to keep the admin on the public site

- **Nothing works without a token.** Anyone can open `/admin/`, but without your token it can only
  show what's already public on the site. A visitor's own "drafts" are saved only in their own
  browser. Nobody else ever sees them, and they can't reach the real site.
- **There are no secrets in the code.** The admin is plain HTML and JavaScript, like the film. The
  repository and its full history were scanned for tokens, keys and passwords on 3 Oct 2026.
  Nothing was found (see [Checks](#checks)).
- **The page protects itself:**
  - A strict **Content Security Policy** means only the site's own scripts can run. Inline or
    injected scripts and `eval` are blocked, and the page can only connect to this site,
    `api.github.com` and `raw.githubusercontent.com`.
  - Everything you type is shown as **plain text**, never as HTML. Even text pasted from
    somewhere strange can't run code in the admin. A test publishes hostile text in every field
    to check this.
  - `Referrer-Policy: no-referrer` means the admin's address isn't passed on to other sites.
  - The page **refuses to run inside another site's frame**. This stops a page from tricking you
    into clicking Publish.
  - It's marked `noindex`, so search engines don't list it. That's tidiness, not security.

---

## What is public

**Everything you publish can be read by anyone who knows where to look, including before
3 January.** The countdown is a curtain over the film. It is not a lock on the files.

| What | Where | Notes |
|---|---|---|
| Every word in the film, **including your letter** | `data/messages.json` | Readable at `…/birthday/data/messages.json`. |
| Names, birth date, unlock time, your WhatsApp number (if you add one) | `data/settings.json` | The WhatsApp number is needed for "Send a hug". Leave it empty if you'd rather not publish it. |
| Every photo: the film copy and a thumbnail | `photos/`, `photos/thumbs/` | These are what the film shows. |
| The full-size originals | `photos/originals/` in the **repository** | **Not on the website** since the GitHub Actions build (`npm run build` leaves them out), but still in the repository: the admin downloads them through the GitHub API when you re-crop or re-grade. In a public repository, anyone can still view them on github.com. |
| Music, voice note, video | `media/` | |
| **Everything you ever published, even after you delete it** | the repository's history | Deleting or replacing a photo removes it from the site, but the old version stays in the repository's history. If the repository is public, anyone can find it there. |

If the GitHub repository is **public** (GitHub Pages on a free account needs that), all of the
above, originals included, can also be browsed on github.com. If it's private, the website files
are still downloadable from the website itself.

### Where things stand right now (3 October 2026)

- The repository **anirudhleetcode-max/birthday is public.** Her 36 photos (film copies,
  thumbnails and originals), the letter and every message have been on github.com since they were
  committed, and they are in the repository's history.
- **GitHub Pages is not switched on yet** (there's no `main` branch). So there is no live website
  yet, but the repository itself is browsable by anyone who finds it.
- The countdown will hide the *film*, not the files. Anyone can open a photo's address directly.

**To keep everything private until her birthday** (it takes one minute, and nobody but you can do
it, because it needs your GitHub account):
1. GitHub → the repository → **Settings → General → Danger zone → Change visibility → Private.**
   From then on, the photos, letter and history are visible only to you. The admin keeps working,
   because your token reads and writes the private repository.
2. On **2 January**, switch it back to **Public**, create `main` and turn on Pages (README §2).
   Free GitHub Pages can't serve a private repository, so the site goes live at that moment.

Making the repository private hides the history too. Deleting the photos from the repository
instead would *not* help: they would stay in the history. Rewriting the history isn't needed if
the repository goes private, and the photos are meant to be seen from 3 January anyway.

**So:** only upload photos and words you're happy for anyone to see. Assume the surprise could be
discovered early by someone who goes looking. To truly erase something you already published,
the repository's history has to be rewritten, or the repository deleted and created again. Ask
for help with that; the admin doesn't do it.

### Hidden information in photos and videos is removed automatically

Phones store extra information inside photos and videos: **where they were taken (GPS)**, when,
the phone's make, model and serial number, and sometimes a hidden copy of the uncropped picture.
Because originals are published, the Lantern Room removes this **before anything is saved or
uploaded**:

- **Photos (JPEG / PNG / WebP):** the location, dates, camera details, XMP and IPTC data,
  comments and hidden extra images are removed. Only the "which way up" flag is kept, so the
  photo still shows upright. The picture itself isn't re-compressed. Other formats (and photos
  over 12 MB) are stored as a fresh JPEG copy, which carries no hidden information at all.
- **Videos and voice notes (MP4 / MOV / M4A):** the recording location is blanked out. Other
  details, like the recording date, can remain. If that matters, turn off **Location** when you
  share or export the video from your phone.

---

## If something went wrong

- **Token leaked or a device lost:** [revoke the token](#how-to-revoke-switch-off-the-token) first.
- **Unexpected changes on the site:** open `github.com/anirudhleetcode-max/birthday/commits`.
  Every publish from the admin is one commit, named "Lantern Room: …". Open the last good one,
  then **Browse files**, or ask for help to revert the bad commit. Nothing is lost: history keeps
  every version.
- **The admin says "GitHub didn't accept the token":** it expired or was revoked. Make a new one.

---

## Checks

Run these from the project folder:

```sh
git log -p --all | grep -iE "ghp_|github_pat_"   # no real tokens anywhere in history
node scripts/check-assets.mjs                    # content valid, files present, no secrets committed
node --test "tests/unit/*.test.mjs" "tests/admin/*.test.mjs"
NODE_PATH=$(npm root -g) node tests/e2e/admin-qa.cjs --only security
```

The `security` flow checks all of the following:

- the token is kept in `localStorage` with "remember" on, or `sessionStorage` with it off;
- it is sent only to `api.github.com`, and only in the `Authorization` header;
- it never appears in a URL, a request body, the console, IndexedDB, other storage or the export;
- the page runs with no Content Security Policy violations;
- hostile text is shown as plain text, not run;
- the page refuses to start inside a frame.

Unit tests cover the metadata clean-up (`tests/admin/metadata.test.mjs`).
