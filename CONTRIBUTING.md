# Contributing to FieldLab

Open an issue or pull request at https://github.com/Supergoldfish101/FieldLab. For a numerical issue, include the exported setup JSON, calculation mode, frequency, geometry and return-path settings, expected result and its reference. Include the browser/version and relevant console error for browser failures. Remove private names or other personal data from attachments. Do not submit credentials.

Use Node.js 24 or later. There are no application npm dependencies to install. Run `npm run dev` for http://127.0.0.1:4186 and `npm test` for the numerical, actual WASM, geometry, import validation, print-data and offline-cache checks. Tests exercise both root hosting and the `/FieldLab/` Pages path.

Keep physics/modeling boundaries explicit. Preserve existing portable setup schemas, local storage, accessible controls, module-worker loading and relative runtime paths. Test affected controls in a browser. For hosting or PWA changes, also verify an accurate solve, JSON export/import, print preview, Offline ready, disconnected reload and a new disconnected solve. Check for page errors and failed asset requests. Browser install support and graphics capabilities vary by platform.

Before committing application or documentation changes:

```sh
node scripts/build-pwa.mjs
npm test
python scripts/package-source.py
```

The first step regenerates the offline cache version and asset list. The final step refreshes the preferred editable application source ZIP, including these docs, scripts, tests and vendored runtime. Keep the separate NEC corresponding-source archive and its provenance information. Do not manually edit generated WASM or remove vendor notices. To replace the engine, use the pinned upstream source/build instructions and update provenance and all corresponding sources together.

The existing GPL-2.0-or-later project license applies to original application contributions. Submit only code you are entitled to contribute under compatible terms, retain third-party attributions, and mark changes to GPL-covered files with the nature and date of changes. No contributor license agreement is currently included. A push to `main` runs the publishing workflow, so use a pull request for review before changing production.
