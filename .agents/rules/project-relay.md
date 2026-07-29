# Project Relay Operating Rules

- Work on one bounded question or behavioural change at a time.
- State the roadmap/task ID and role: implementer, reviewer, reproducer, auditor, or human decision authority.
- Preserve all pre-existing working-tree changes.
- If the same failure occurs twice, stop retrying. Preserve the current state,
  report the error and evidence, present practical resolution options with
  tradeoffs, and wait for the user's choice before continuing.
- Do not silently change schemas, invariants, acceptance criteria, hashes, evidence, or generated status.
- An agent cannot supply the final human decision or independently approve evidence it produced.
- Do not commit, push, publish, add credentials, install paid services, or perform live GitHub writes without separate explicit authorisation.
- Use synthetic public-safe fixtures only.
- Never add credentials, private data, personal information, customer or commercial records, confidential prompts, or unpublished ITSM material.
- Relay and ITSM are separate. Do not add ITSM equations, claims, datasets, results, manuscripts, or scientific decisions here.
- GitHub Pages and the current MCP server remain read-only boundaries.
- A hash proves content integrity, not truth, authorship, safety, or provenance.
- Before handoff run `npm run check`, `git diff --check`, and inspect the diff.
