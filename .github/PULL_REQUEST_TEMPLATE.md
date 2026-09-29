## What changed

<!-- One or two sentences. What and why. -->

## Type of change

- [ ] Bug fix
- [ ] Feature
- [ ] Documentation
- [ ] Refactor / test
- [ ] Accessibility

## The four gates are green

Run these locally and confirm each exits 0 before requesting review (this is exactly what CI checks):

- [ ] `npm run lint`
- [ ] `npm run type-check`
- [ ] `npm run test` (expected: 120 passed)
- [ ] `npm run build`

## Notes for the reviewer

- [ ] I did **not** add telemetry or send locally-analyzed file content off the machine.
- [ ] UI strings are English.
- [ ] If I touched a 3D / render-critical file, I attached a real-GPU screenshot (headless CI cannot render WebGL).

Closes #(issue)
