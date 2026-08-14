# Internationalization Status

The site currently supports Chinese and English through `i18n.js`, the
`i18nMiddleware`, `/set-language/:lang`, and
`views/partials/language-switcher.ejs`.

## Current conventions

- Templates receive `lang`, `t`, and `__` from middleware.
- Complex or page-specific copy may use an explicit `lang === 'zh'` branch.
- Client scripts derive the language from `document.documentElement.lang` and
  use `public/js/i18n-helpers.js` for common server-message translations.
- The language cookie is parsed by the application's structured cookie helper;
  no `cookie-parser` dependency is required.
- User-controlled text must be assigned with `textContent` or rendered through
  escaped EJS output. Translation work must not reintroduce `innerHTML` sinks.

## Maintenance

The old reports and source-rewriting helpers that described partial coverage,
generated `.backup` files, or modified templates with regular expressions were
removed because they contradicted the current tree and could corrupt EJS or
client JavaScript. New copy must be reviewed in both languages and exercised by
desktop/mobile browser tests.
