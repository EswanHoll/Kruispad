# Payment Request Approval Workflow — Project Brief & Technical Specification

**Project:** Kruispad Payment Request Approval Workflow
**Author:** Gai | Virtual CEO, acting on behalf of Eswan Holl | GekkoTech
**Date:** June 23, 2026
**Version:** 1.3

---

## 1. Project Brief

### 1.1 Objective

The objective of this project is to rebuild the existing "Payment Request Approval Workflow V1.0" (currently hosted on Rethink Workflow) as a modern, standalone web application using the Manus Web Dev capability. The new application will digitise the expense submission, parallel approval, and payment process for Kruispad, replacing the legacy third-party platform with a purpose-built, hosted solution.

### 1.2 Target Audience

**Initiators (Staff/Volunteers)** are users who draft and submit payment requests. **Approvers (Fred Louw and Anton Prinsloo)** are management or board members who review and approve or decline requests in parallel. **Finance/Admin (Frikkie Geyser and Elsje)** are the personnel responsible for executing payments and printing or filing finalised documents.

### 1.3 Key Features

The application must deliver secure user authentication with role-based access control, a comprehensive request form with file attachment capability, a parallel dual-approval workflow with distinct states and transitions, role-specific dashboard views (e.g., "My Requests" and "Pending Approvals"), and a full audit trail capturing timestamps and reasons for all approvals and declinations.

---

## 2. Technical Specification

### 2.1 Technology Stack

The project will be initialised using the `web-db-user` scaffold in Manus Web Dev, which provides the following:

| Layer | Technology |
| --- | --- |
| Frontend | React, TypeScript, TailwindCSS, Vite |
| Backend | Node.js API framework |
| Database | MySQL/TiDB via Drizzle ORM |
| Authentication | Manus-Oauth |
| File Storage | S3 (receipts and invoices) |

### 2.2 Database Schema (Proposed)

#### Users Table

| Field | Type | Description |
| --- | --- | --- |
| id | UUID | Primary Key |
| email | String | User's email address |
| name | String | User's full name |
| role | Enum | `Initiator`, `Approver_Fred`, `Approver_Anton`, `Finance`, `Admin` |

#### Payment Requests Table

| Field | Type | Description |
| --- | --- | --- |
| id | UUID | Primary Key |
| initiator_id | UUID | Foreign Key → Users |
| date_requested | DateTime | Timestamp of initial save/submission |
| beneficiary_name | String | Name of the payment recipient |
| payment_type | Enum | `Expense`, `Maintenance`, `Donation` |
| description | Text | Detailed description of the request |
| amount | Decimal(10,2) | Payment amount in ZAR |
| status | Enum | See Workflow States in §2.3 |
| file_url | String | S3 URL to attached invoice or receipt |
| fred_status | Enum | `Pending`, `Approved`, `Declined` |
| fred_action_date | DateTime | Timestamp of Fred's action |
| fred_decline_reason | Text | Reason if declined by Fred |
| anton_status | Enum | `Pending`, `Approved`, `Declined` |
| anton_action_date | DateTime | Timestamp of Anton's action |
| anton_decline_reason | Text | Reason if declined by Anton |
| frikkie_action_date | DateTime | Timestamp of Frikkie's action |
| frikkie_decline_reason | Text | Reason if declined by Frikkie |
| created_at | DateTime | Record creation timestamp |
| updated_at | DateTime | Last update timestamp |

> **Design note:** The `fred_status` and `anton_status` fields are required to support the parallel approval model. The overall `status` field reflects the macro state of the request in the workflow, while the individual approver status fields track each approver's independent decision.

---

### 2.3 Workflow States & Transitions

The application must enforce the following state machine. The critical design change from the legacy system is that **Fred and Anton approve in parallel** — both approvals are required before the request can advance to Frikkie for payment. A decline by either approver at any time returns the request to `Drafted` for revision.

#### Workflow States

| # | State | Description |
| --- | --- | --- |
| 01 | **Drafted** | Initial save state. Editable by the Initiator. Not yet submitted for approval. |
| 02 | **Submitted** | Submitted by the Initiator. Pending parallel approval from Fred and Anton. |
| 03 | **Fully Approved** | Both Fred and Anton have approved. Ready for Frikkie to execute payment. |
| 04 | **Paid** | Payment executed by Frikkie. Pending document printing/filing. |
| 05 | **Document Printed** | Finalised. Document printed or filed by Elsje/Admin. |

#### Transitions (Actions)

The following table defines every permitted state transition, the actor who triggers it, and any preconditions that must be met.

| Transition | From State | To State | Actor | Preconditions |
| --- | --- | --- | --- | --- |
| **Save as Draft** | (New) | `01 Drafted` | Initiator | Form partially or fully complete |
| **Submit** | `01 Drafted` | `02 Submitted` | Initiator | All required fields complete, at least one file attached |
| **Return to Draft** | `01 Drafted` | `01 Drafted` | Initiator | Edit and re-save without submitting |
| **Fred Approve** | `02 Submitted` | *(fred_status = Approved)* | Fred Louw | Request in `Submitted` state |
| **Fred Decline** | `02 Submitted` | `01 Drafted` | Fred Louw | `fred_decline_reason` must be provided; resets both approver statuses |
| **Anton Approve** | `02 Submitted` | *(anton_status = Approved)* | Anton Prinsloo | Request in `Submitted` state |
| **Anton Decline** | `02 Submitted` | `01 Drafted` | Anton Prinsloo | `anton_decline_reason` must be provided; resets both approver statuses |
| **Auto-advance to Fully Approved** | `02 Submitted` | `03 Fully Approved` | System | Triggered automatically when **both** `fred_status = Approved` AND `anton_status = Approved` |
| **Frikkie Pay** | `03 Fully Approved` | `04 Paid` | Frikkie Geyser | Request in `Fully Approved` state |
| **Frikkie Decline** | `03 Fully Approved` | `01 Drafted` | Frikkie Geyser | `frikkie_decline_reason` must be provided; resets all approver statuses |
| **Print Document** | `04 Paid` | `05 Document Printed` | Elsje / Admin | Request in `Paid` state |

#### Parallel Approval Logic (Key Rule)

When a request reaches `02 Submitted`, both Fred and Anton receive a notification simultaneously. Each can independently approve or decline. The system must track each approver's status independently. The request only advances to `03 Fully Approved` when the system detects that **both** `fred_status` and `anton_status` are set to `Approved`. If either approver declines, the request immediately reverts to `01 Drafted` and both approver status fields are reset to `Pending`.

---

### 2.4 Form Design

#### Request Form Fields

| Field | Type | Required | Validation |
| --- | --- | --- | --- |
| Date Requested | Date Picker | Yes | Defaults to today |
| Beneficiary Name | Text Input | Yes | Max 255 characters |
| Payment Type | Radio Group | Yes | Options: Expense, Maintenance, Donation |
| Description | Rich Text Editor | Yes | Supports bold, italic, lists |
| Amount | Number Input | Yes | Positive decimal, ZAR currency format |
| File Upload | File Attachment | Yes | At least one file required; PDF, JPG, PNG accepted |

#### Form Action Buttons

The form must present two action buttons at the bottom:

- **Save** — Saves the form in `01 Drafted` state. No validation required beyond basic data integrity. User can return and edit at any time.

- **Submit** — Validates all required fields (including the file attachment) and transitions the request to `02 Submitted`. Prompts the user with a confirmation dialog before submitting.

---

### 2.5 User Interface Requirements

The UI must follow Kruispad's established design principles:

- **Navigation:** Left-aligned sidebar. Clicking any navigation item must scroll the content area to the top.

- **Typography & Colour:** Avoid grey text on dark backgrounds. Use white or bright colours for text on dark surfaces. All headings must be bold. Body text must be legible (minimum 14px).

- **Interactivity:** Clean, functional, colourful, and intuitive. Support drill-down from list views to detail views.

#### Required Views

| View | Accessible By | Description |
| --- | --- | --- |
| Dashboard | All roles | Role-specific summary: pending items, approved this month, total spend |
| New / Edit Request | Initiator | Form with Save and Submit actions |
| My Requests | Initiator | List of own requests with status badges |
| Approval Queue | Fred, Anton | List of `Submitted` requests awaiting their individual action |
| Payment Queue | Frikkie | List of `Fully Approved` requests ready for payment |
| Print Queue | Elsje, Admin | List of `Paid` requests ready for printing |
| All Requests | Admin | Full audit view of all requests across all states |

---

### 2.6 Roles & Permissions

| Role | Permissions |
| --- | --- |
| **Initiator (Document Owner)** | Create, save as draft, edit (if `Drafted`), submit, view own requests |
| **Fred Louw** | View `Submitted` requests, execute Fred Approve or Fred Decline |
| **Anton Prinsloo** | View `Submitted` requests, execute Anton Approve or Anton Decline |
| **Frikkie Geyser** | View `Fully Approved` requests, execute Frikkie Pay or Frikkie Decline |
| **Elsje / Admin** | View all requests, execute Print Document, manage users |

---

### 2.7 Notifications (Recommended)

The following in-app and/or email notifications should be triggered at key transitions:

| Event | Notify |
| --- | --- |
| Request submitted | Fred Louw and Anton Prinsloo (simultaneously) |
| Fred or Anton approves | Initiator (informational — awaiting second approval) |
| Both approvals received | Frikkie Geyser |
| Request declined (any stage) | Initiator (with decline reason) |
| Payment executed | Initiator and Elsje/Admin |
| Document printed | Initiator (final confirmation) |

---

*Gai | Virtual CEO, acting on behalf of Eswan Holl | GekkoTech*

