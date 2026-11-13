# Rethink Workflow archive and gap report

**Ticket:** GST-499 · **Date:** 13 Nov 2026 · **Status:** Basic export archived; full export not obtained

This report records how Kruispad's Rethink Workflow history was preserved before Rethink deletes its data on 15 Nov 2026, and what was not captured. It contains no record contents or personal data.

## Decision

Eswan Holl, 13 Nov 2026 18:26 SAST (relayed via Boss Bot): "Accept the basic export with a gap report, and back it up today."

This uses the "archived and reported" branch of VISION.md "Done means" item 3 instead of a full import.

## What was archived

| File | Records | Size (bytes) | SHA-256 |
|---|---|---|---|
| `rethink_payment_requests_all_2238.csv` | 2,238 | 503,718 | `5e8423cb02deed621370d75d46343bdea9cce383c1f3632a4744b9977ddc905c` |
| `rethink_payment_requests_all_2238.json` | 2,238 | 792,392 | `b78267c6012745bfb7bff2bb82b5c664b3dfbd7f426b85342a8af330a6a19eca` |

- **Source:** Rethink Workflow basic export of all payment requests. The local export files are timestamped 12 Nov 2026 06:44 SAST. The most recent record update in the data is 27 Oct 2026.
- **Coverage:** records created from 18 Aug 2016 to 26 Oct 2026, across 10 distinct workflow state labels.
- **Fields (CSV header):** `document.key`, `document.name`, `owner._id`, `owner.name`, `owner.email`, `state._id`, `state.name`, `createdAt`, `updatedAt`.
- **Fields (JSON keys, checked on all 2,238 records):** `document.key`, `document.name`, `owner` {`_id`, `name`, `email`, `profileUrl`}, `state` {`_id`, `name`}, `createdAt`, `updatedAt`. The JSON also has `owner.profileUrl`, which the CSV omits. There are no other keys.
- **Backup location:** GekkoTech Google Drive, private folder "Kruispad - Rethink archive 2026-11-13", owned by Eswan. It holds both files and a `SHA256SUMS.txt` file.
- **Integrity check (13 Nov 2026):** both files were re-hashed before upload, downloaded back from Drive, and re-hashed. The SHA-256 values match the table above, the sizes match, and a byte-for-byte comparison passed.
- **Not in git:** the export data stays out of the repository because it contains personal data.

## What is lost (not captured)

The basic export has only the fields listed above. These were **not** captured and will be lost when Rethink deletes its data:

- **Approval history / audit trail:** who approved each step and when, plus the intermediate state transitions. Only the *current* state and the last `updatedAt` survive.
- **Custom form fields:** amounts, payees, banking details, cost centres, descriptions, and any other request-form data.
- **Attachments:** invoices, quotes, proofs of payment, and any other uploaded files.
- **Comments and notes** on requests.
- **Step assignees and due dates,** other than the request owner.
- **Workflow and form definitions:** step configuration, routing rules, and the user and role setup.
- **Notification and email logs.**

## Context: full export request

A full export, including approval history, was requested from Rethink. The last reply from Rethink (Dewey) in that thread was on 26 Oct 2026. Sarah sent a follow-up on 3 Nov 2026 at 10:04 SAST. Whether Rethink fulfilled that follow-up is **unverified**, because Sarah's Gmail connection is signed out and her inbox can't be checked. No further contact with Rethink was made for this report.

## Impact on VISION.md "Done means" item 3

Item 3 reads: "Rethink history is imported, or archived and reported, with an audit trail."

- **Archived:** yes, in the verified Drive backup above.
- **Reported:** yes, in this document.
- **Audit trail:** partial. Each request's existence, owner, current state, and created/updated dates are preserved. The approval-by-approval history is not.

## Residual risks

1. **No approval evidence:** pre-migration requests have no approval evidence. Questions from an auditor or the board about who approved a historical payment have to be answered from bank records, the paper files ("Document Printed" state), or minutes.
2. **No financial detail:** amounts and payees are not in the archive, so the archive alone can't reconcile payments.
3. **Single cloud copy:** the Drive folder is the only off-box copy. A second offline copy would reduce the risk of losing it.
4. **Drive sharing:** the folder sits in a Google Workspace account where new items inherit a domain-wide (gekkotech.co.za) read permission. The owner should restrict the folder to owner-only access.
5. **Possible late full export:** if Rethink fulfilled the 3 Nov follow-up, the full export may still be sitting in Sarah's inbox. Once her Gmail is reconnected, check it and, if the export is there, archive it the same way.
