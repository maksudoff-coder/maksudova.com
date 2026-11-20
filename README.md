# Tutor Maksudova — maksudova.com

Online math tutoring site for Dilobar Maksudova (Grades 1–8 and Algebra 1).

- Static site: everything lives in `index.html`, plus icons, images and `sw.js`.
- Hosting: Cloudflare Pages (project `maksudova`), deployed automatically from the `main` branch.
- Data: Firebase (project `tutor-maksudova`). The Firebase web config in `index.html` is public by design; service-account keys and the Telegram bot token are **never** stored in this repository.

## Cloudflare Pages settings

| Setting | Value |
|---|---|
| Production branch | `main` |
| Framework preset | None |
| Build command | *(empty)* |
| Build output directory | `/` |

After every change, bump `const CACHE` in `sw.js` so visitors get the new version.
