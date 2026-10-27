## What changed

<!-- One or two sentences. What and why. -->

## Type of change

- [ ] Bug fix
- [ ] Feature
- [ ] Documentation
- [ ] Refactor / test
- [ ] Accessibility

## The five gates are green

Run these locally and confirm each exits 0 before requesting review (this is exactly what CI checks):

- [ ] `npm run lint`
- [ ] `npm run type-check`
- [ ] `npm run test` (Vitest — the current suite counts and the day they were counted stand in the README)
- [ ] `npm run build`
- [ ] `node scripts/audit-gate.mjs` (dependency audit)

## Notes for the reviewer

- [ ] I did **not** add telemetry or send locally-analyzed file content off the machine.
- [ ] UI strings are English.
- [ ] If I touched a 3D / render-critical file, I attached a real-GPU screenshot (headless CI cannot render WebGL).

Closes #(issue)
