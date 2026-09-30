# GlowCoach

A selfie becomes a skin plan you can shop. GlowCoach uses the YouCam API to read 8 skin concerns and your skin tone, builds a morning and night routine for your goals and budget, matches your foundation shade, lets you try three makeup looks on, previews your skin with the targeted concerns improved, and tracks your scores over time.

## YouCam APIs used

| Feature | YouCam API | What GlowCoach does with it |
|---|---|---|
| Skin scan | AI Skin Analysis (`skin-analysis`, 8 concerns, SD) | Scores, a glow score, skin type, and per-concern masks you can tap to see where each concern was found |
| Shade match | AI Skin Tone Analysis (`skin-tone-analysis`) | Nearest foundation shade (CIE Lab color distance) and undertone; picks lip and blush colors for three looks |
| Try-on | AI Makeup Virtual Try-On (`makeup-vto`) | Applies each look (foundation, lip, blush) with a before/after slider |
| Goal preview | AI Skin Simulation (`skin-simulation`) | Shows the routine's priority concerns improved, labeled as an illustration |

## How it works

```
public/            static app (no build step)
  js/app.js        screens, camera, journey, try-on, bag, progress
  js/coach.js      coaching rules: priorities, routine, shade match, looks (pure, tested)
  js/catalog.js    sample catalog for the fictional brand "Lumen & Leaf"
  js/store.js      scores and bag kept in localStorage (photos are never stored)
  js/api.js        photo resize, upload, task polling
  sample/          a journey recorded once from real YouCam calls on YouCam's sample photo
api/               Vercel serverless functions (status, upload, task)
lib/               YouCam client, task allow-list, spending guard, shared handlers
server.js          local dev server
```

- The API key stays on the server. The browser only talks to `/api/*`.
- The server builds every YouCam request from an allow-list, so a visitor can't call other features or send arbitrary parameters.
- A spending guard caps units per visitor and per day. When live units run out, visitors can still try the full journey on the recorded sample, which is clearly labeled.
- Skin analysis and skin tone run in parallel; try-on and the goal preview run only when asked, to save units.

## Run locally

Requires Node 18+.

```
cp .env.example .env    # then add your YOUCAM_API_KEY
npm run dev             # http://localhost:8790
npm test                # 30 tests: backend, coaching engine, storage
```

To record the sample journey (about 41 units): `node scripts/record-sample.mjs`.

## Deploy

Deploy the repository to Vercel and set `YOUCAM_API_KEY` in the project's environment variables.

## Notes

Lumen & Leaf and its products are fictional; a retailer would plug in its own catalog. GlowCoach is a cosmetic guide, not medical advice.
