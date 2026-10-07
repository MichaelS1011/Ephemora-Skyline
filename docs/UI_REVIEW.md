# UI review — 1 October 2026

The app was started locally at http://localhost:3010 with its backend on port 4000. The review focused on onboarding, readable controls, keyboard access, and small-screen layouts. Brand colors and the existing 3D renderer are preserved.

## Changes

- A clearer project entry screen with a schematic explaining how code maps to buildings, a visible demo action, and optional scan settings.
- A consistent workspace header with an accessible project switcher, project identity and severity filters. Demo projects are identified correctly.
- Larger interface text and controls; a smaller primary toolbar with secondary actions in a keyboard-accessible More menu.
- Readable findings, synchronized severity filters, recoverable collapsed project overview, and a concise navigation guide.
- Panels stay within the viewport at narrow widths. Opening Findings returns from a selected file; search results and the More menu appear above file details.
- Native Tab navigation, arrow-key building selection, accessible search selection, dialog focus handling and predictable Escape priority.
- Demo loading failures, clipboard failures and PNG failures have visible feedback.

## Verification

- `npm run lint`: passed.
- `npm run type-check`: passed.
- `npm run test`: 686 passed (363 frontend, 323 backend) in 80 files. DOM interaction tests cover search and workspace controls. Re-measured on 4 October; the review itself ran on 1 October.
- `npm run build`: passed.
- `git diff --check`: passed.
- Browser checks: desktop 1440 × 900, narrow window 390 × 844, narrow landing 320 × 740; no horizontal document overflow observed. These are width checks in a desktop browser, not a phone claim: Ephemora Skyline is a local web application and is not intended for phones.
- Interactions: demo loading, scan-profile dialog, nested-dialog Escape, project switcher, search selection with Enter, findings/detail switching, More menu, security tour next/exit, and Tab leaving the focused city canvas.
- Actual local API smoke test: two generated source files analyzed successfully, completed result retrieved, and its city permalink loaded in the browser. The city showed the correct two-file count and local-project identity.

## Limits

The native directory picker did not produce an automatable file-chooser event in the in-app browser. Its file-selection step was not completed automatically; the analysis pipeline was verified independently using the local API and generated fixtures. This is not an end-to-end assertion for the OS picker.

The browser already reports a Three.js Clock deprecation warning; the rendering dependency was not changed. No new browser errors were observed after correcting a conflicting border style during the review. Export and clipboard error handling are covered by DOM tests; successful native downloads and external editor launches were not exercised.

## Screenshots

- [Project entry](assets/ui-landing.png)
- [Desktop workspace](assets/ui-workspace.png)
- [Narrow-window findings](assets/ui-mobile.png)
