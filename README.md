# zeyad.is-a.dev

my portfolio. plain html, css and js, no framework and no dependencies.

run it locally:

```
node build.mjs
python serve.py
```

then open http://localhost:3002

posts live in `posts/` as `YYYY-MM-DD-slug.md`, with their images in `media/<slug>/`. pushing to `main` builds the blog and deploys it.

projects live in `projects.json`. the build writes a page for each one to `p/<slug>/` and fills the work list on the home page, and their images are in `media/p/<slug>/`. the "how i made it" lines stay off the site until `approved` is true; `PREVIEW=1 node build.mjs` shows them as drafts.

checks and share images need chromium (or chrome) installed:

```
node tests/smoke.mjs          # every page at 360 and 1280 px, add more with WIDTHS=320,390
node tools/share-images.mjs   # redraws media/share/*.jpg after a thumbnail or tagline changes
```
