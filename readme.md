# PRAO på ITS

Material och en publicerad webbplats för en PRAO-vecka på ITS för elever i årskurs 9.

## Innehåll

- `GLOSSARY.md` – projektets ord (schemapost, moment, testrunda med flera).
- `docs/adr/` – beslut som är svåra att ändra och varför de togs.
- `agents.md` – instruktioner till agenten (Copilot) som arbetar med eleven.
- `site/` – webbplatsen som vanliga HTML-sidor (veckoplan, schema, mål med mera) med MVP.css som stilmall.
- `site/spel/` – där eleven bygger sitt eget projekt med HTML, CSS och JavaScript.
- `.github/workflows/pages.yml` – publicerar webbplatsen till GitHub Pages vid varje push till `main`.

## Arbetssätt

Eleven forkar repot (publikt) och arbetar i `site/spel/` tillsammans med en agent som skriver koden. Eleven ritar en skiss, agenten intervjuar eleven och bygger första versionen, och därefter förbättrar eleven spelet i testrundor. Varje push publiceras via GitHub Pages i elevens fork. Schemat med instruktioner per moment finns i `site/schema.html`.

Den inre testloopen är att öppna hemsidan direkt från disk, till exempel genom att öppna `site/index.html` i webbläsaren. Alla sökvägar är relativa, så inga externa eller publicerade adresser behövs. Ändra, ladda om sidan och testa.

Om du vill jobba med filerna direkt i webbläsaren (men utan AI-stöd) så kan du byta ut ".com" till ".dev" i url, då slussas du vidare till https://vscode.dev/github/prao-tb/prao-its?vscode-lang=sv-se

När du är nöjd lokalt gör du commit och push. Webbplatsen publiceras då automatiskt via GitHub Pages och då kan du se resultatet på https://prao-tb.github.io/prao-its.