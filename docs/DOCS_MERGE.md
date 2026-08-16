# Documentation-Only Administrator Merge Policy

**Status:** Active · **Scope:** This repository

## Purpose

Documentation changes should be reviewable and fast without being held hostage by code-quality checks that cannot evaluate documentation. This policy permits a repository administrator to merge a documentation-only pull request after confirming its scope and suitability.

## Documentation-only scope

A documentation-only pull request changes only durable documentation and documentation entry points, such as Markdown files under `docs/`, `README.md`, `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, or `CHANGELOG.md`. It must not modify application or infrastructure source code, package or dependency files, CI workflows, build or deployment configuration, tests, generated binaries, secrets, access controls, or runtime data.

## Administrator merge rule

A repository administrator may merge a documentation-only pull request without requiring **CI, unit tests, Cursor Bugbot, or any other automated code-quality check**. The administrator must first confirm from the changed-file list that the pull request remains within documentation-only scope. Do not manufacture or retry missing code-check contexts for a documentation-only pull request.

The administrator's merge decision is the human review for ordinary documentation. Controlled records, legal or compliance material, security guidance, significant architecture decisions, and other explicitly high-risk documentation retain any human approval, ratification, privacy, or access-control gate that applies to their content.

## Code and mixed changes

A pull request that changes code or any non-documentation operational material is not documentation-only. It follows the repository's normal checks, review, security, and deployment controls. This policy never authorizes a direct push to the default branch and never permits the bypass to be used for a mixed pull request.

## GitHub enforcement

Where GitHub status checks are globally required on the default branch, an administrator may use a **pull-request-only bypass** solely for a confirmed documentation-only pull request. That exception must not be used to bypass checks for code or mixed changes. GitHub rules do not distinguish changed paths for required status checks; do not remove code protections globally merely to make documentation merges convenient.
