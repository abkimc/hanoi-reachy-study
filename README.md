# Hanoi with Reachy

A self-guided study for phones and desktops. Serve the repository root over HTTPS or localhost. Each round uses three pegs and a five-minute timer. Participants solve a three-ring puzzle alone, report their stress, then solve a five-ring puzzle with Reachy. They can drag disks, tap two pegs, or use the keyboard. The goal is the last peg in each round. Participants can see the board before starting. Disk movement unlocks when the timer starts.

## Participant links

Add `?participant=P001` to prefill a pseudonymous code or let the site generate one. The participant provides consent and three stress ratings: before, between rounds, and after. The final questionnaire also captures their experience with Reachy. The app automatically assigns friendly or direct help during the assisted round; organizers can set a fixed style in `config.js`.

Both rounds record moves, illegal attempts, time, and outcome. The assisted round also records requests, proactive offers, and whether the next legal move followed the latest hint. Free-text questions are omitted from exports. All five records share a run ID and participant code. The board and order both change across rounds, so the difference between rounds combines board difficulty, practice, and assistance.

## GitHub Pages

Upload this folder's contents to the root of a GitHub repository. In **Settings → Pages**, publish from the main branch and root. Use the resulting HTTPS link. Every image and video used by the site is in this repository. No simulator or Python server is needed on participants' devices.

## Google Forms

1. In the Google account that will own the results, create an Apps Script project. Paste `integrations/Code.gs` and run `createStudyForm` once. Authorize Forms access. Open the resulting form from the execution log. Link a response spreadsheet from the form's Responses tab if desired.
2. In Apps Script project settings, set the script property `SITE_ORIGIN` to the Pages origin, for example `https://YOUR-NAME.github.io` without a path or trailing slash. For local testing, use `http://127.0.0.1:8092` and deploy a separate test instance if necessary.
3. Deploy as a Web app running as the owner, with access set to Anyone so invited participants can submit without signing in. Copy the deployed HTTPS `/exec` URL into `formsEndpoint` in `config.js` and publish the change.
4. Run one synthetic test on the published origin and verify that five rows labeled before, solo, between, assisted, and after appear. The page confirms success only after Google acknowledges submission. A blank endpoint explicitly enables preview and local JSON download.

The Apps Script endpoint accepts public submissions. Its origin check limits where acknowledgments are sent. Treat unsolicited rows as possible and distribute unique pseudonymous participant codes. Avoid real names in links. The questionnaire is for a research pilot. The rapport items are exploratory, and the timer and behavior logs measure task performance and help use.

## Reachy and speech

The self-guided build uses the puzzle solver, built-in explanations, bundled Kokoro voice clips, and prerecorded video. Browser speech serves as an audio fallback. Participants need no account, API key, or facilitator. The settings are fixed in `config.js`. API-generated text and speech would require a hosted service with a protected key before they can run unattended.

For a future model comparison, use identical puzzle questions and states for Nemotron 3.5 Lightning and Nemotron 3 Ultra. For speech, compare Fish Audio S2.1 Pro Free, device speech, and Kokoro 82M on latency, peg-number pronunciation, pauses, and cutoff. No provider comparison has been run.

- GitHub Pages: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
- Google Apps Script deployment: https://developers.google.com/apps-script/guides/web
- Free models and limits: https://openrouter.ai/collections/free-models/
- Fish Audio speech endpoint: https://openrouter.ai/fish-audio/s2.1-pro-free%3Afree
- Kokoro reference: https://huggingface.co/hexgrad/Kokoro-82M

## Media

The WebM library was recorded from the existing Reachy Mini simulation. `record_clips.py` is an optional regeneration tool that uses the sibling Reachy Studio source and its simulator dependencies. It is unnecessary for hosting or playing the study. 
