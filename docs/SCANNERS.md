# Scanners, categories and rule packs

The README names the four profiles and the nine categories. This is where the rules come from, and why one obvious answer — shipping Semgrep's registry — is not available.

## Categories

Findings fall into nine categories that can be switched per scan, inside a city: injection and execution, secrets, cryptography, transport and certificates, data exposure, dependencies and supply chain, permissions and destructive actions, code hygiene, and a bucket for findings whose rule carries no CWE the taxonomy knows.

## Your own patterns

Up to 25 regular expressions, each with severity, message, suggested fix, CWE and language gates. Every one is validated against a ReDoS canary before it is ever run, so a pattern that hangs the scanner on adversarial input is refused rather than deferred to the first real scan.

## Rule packs, and the licence attached to the question

The deep AST scan needs rules, and where those rules come from is a decision with a licence attached. The Semgrep Rules License v1.0 states: "This license does not allow you to distribute the rules, or to make them available to others as a service." So the registry stays what it always was — fetched by `semgrep` itself, by you, at scan time — and what ships in this repository is rules we wrote and own.

| Pack                 | Where it lives                                                       | Rules                                                                  | Licence                                                 |
| -------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------- |
| `ephemora-core`      | `backend/rules/ephemora-core/`                                       | 12                                                                     | Apache-2.0, same as the program — ours to ship and grow |
| _(nothing selected)_ | `semgrep.dev`, during the scan                                       | not in this tree — the registry's own count, on the registry's own day | Semgrep Rules License v1.0 — not redistributable        |
| your own             | `~/.ephemora-skyline/rule-packs/<id>/` (or `CODECITY_RULE_PACK_DIR`) | any                                                                    | yours                                                   |

A pack is a directory with a `pack.json` manifest and rule YAML beside it. The manifest's `ruleCount` is checked against the files at load time, and a pack whose manifest lies is not offered at all. Scans select packs **by id**; a path is rejected, because a client-supplied directory would let the scanner read rules from anywhere on the machine.

## Engines, and what happens when one is missing

`gitleaks`, `semgrep`, `osv-scanner` and `ruff` are optional and asked for on `PATH`. Without one, the corresponding check reports itself as skipped — on the card, in the provenance and in the summary — instead of pretending to have run. Semgrep falls back to a Docker image when no binary is present and Docker is, and `SKYLINE_OFFLINE=1` closes that fallback unless a local pack is selected. The probe that decides whether a case can run asks the filesystem, not the scanner, because a cold `semgrep --version` took 11–104 s on this machine and used to retire three real assertions as skips.
