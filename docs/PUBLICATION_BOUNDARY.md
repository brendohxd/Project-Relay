# Public/private publication boundary

The public repository is a release destination, not the confidential development workspace.

## Never publish

- credentials, access tokens, cookies, private keys, or environment files;
- unpublished ITSM manuscripts, results, datasets, or reviewer correspondence;
- personally identifying or sensitive information;
- private model transcripts or prompts containing confidential context;
- internal commercial, funding, pricing, or legal records;
- raw customer or collaborator data;
- local machine paths, crash dumps, or logs that may contain secrets.

## Public-safe material

- protocol schemas and public reference implementations;
- synthetic examples;
- reviewed architecture and threat-model summaries;
- public documentation, issues, and release notes;
- generated web assets that contain only approved public state.

## Required release method

1. Develop confidential work in a physically separate local repository.
2. Export only allowlisted paths into a fresh staging directory.
3. Run the public-boundary and secret checks.
4. Review the complete staged diff, including generated files and history.
5. Push a clean public commit or pull request.
6. Assume the pushed content can never be recalled.

Keeping a file untracked or adding it to `.gitignore` is not sufficient isolation. The long-term exporter will create public releases from an allowlist rather than attempting to maintain an ever-growing denylist.
