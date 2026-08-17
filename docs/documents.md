# 1. PRD — Dynamic NGO Survey & Data Intelligence Platform

## 1.1 Product Name

Working name: **NGO Data Platform**

The final product name can be defined later and should itself be configurable at the organizational level.

## 1.2 Product Vision

A secure, dynamic, organization-owned platform for collecting, managing, analyzing, visualizing, and exporting program, research, survey, polling, focus-group, and operational data.

The platform enables an NGO to:

* Design its own data structures.
* Create multiple types of data-collection instruments.
* Publish forms through controlled links.
* Collect responses online.
* Review and manage submissions.
* Organize information by programs, projects, campaigns and research activities.
* Import existing Excel datasets.
* Build dashboards dynamically.
* Generate reports.
* Export organizational data in open formats.
* Maintain ownership and control of organizational data.

## 1.3 Problem

NGOs frequently maintain organizational data across:

* Excel spreadsheets
* Google Forms
* Word documents
* PDFs
* Survey platforms
* Individual staff computers
* Email
* Shared drives
* Paper forms

This creates:

* fragmented data
* inconsistent structures
* duplicated records
* weak data governance
* difficult historical analysis
* vendor dependency
* limited institutional knowledge
* difficult reporting
* unclear ownership
* poor data lineage

The platform addresses this by creating a **single organizational data environment**.

---

# 1.4 Product Principles

### Dynamic by default

Forms, fields, categories, workflows and dashboards should be metadata-driven.

### Data sovereignty

The NGO owns its data and should be able to export it at any time.

### Schema flexibility

The organization should not need a developer every time it needs a new field.

### Data integrity

Historical responses should remain traceable to the schema/form version that produced them.

### Security by design

Access control, auditability and data protection are foundational.

### Simplicity for field workers

Complex backend capabilities should not create complicated respondent experiences.

### Progressive complexity

A user should see simple interfaces by default, while advanced functionality remains available.

---

# 1.5 Primary Users

### System Administrator

Manages:

* organization configuration
* users
* roles
* permissions
* data policies
* integrations
* audit logs

### Program Manager

Manages:

* programs
* projects
* forms
* datasets
* dashboards
* reports

### Research/M&E Officer

Works with:

* surveys
* baseline/endline assessments
* focus groups
* qualitative datasets
* analysis
* reporting

### Field Worker

Primarily:

* collects data
* reviews submissions
* completes assigned forms

### Analyst

Works primarily with:

* datasets
* filters
* dashboards
* exports
* cross-tabulations

### Respondent

Usually has no account.

They receive a link, complete the instrument and submit.

---

# 1.6 Core Domain Model

The platform should not be centered around "forms."

The core domain should be:

```text
Organization
    ↓
Programs
    ↓
Projects / Activities
    ↓
Data Collection Instruments
    ↓
Datasets
    ↓
Responses / Records
    ↓
Analysis
    ↓
Dashboards / Reports
```

A **form is an instrument for collecting data**.

That distinction will be important later.

---

# 1.7 Data Collection Instruments

The platform should support dynamically defined instrument types.

Examples:

* Survey
* Poll
* Questionnaire
* Program registration
* Needs assessment
* Baseline
* Midline
* Endline
* Feedback
* Evaluation
* Interview
* Focus group
* Monitoring form
* Event registration
* Intake form

The system should not require a developer to create a new instrument type.

Instead:

```text
Instrument Type
    name
    description
    configuration
    schema
    workflow
    permissions
```

---

# 1.8 Form Creation

Administrators create a form through a structured backend.

Example:

```text
Create Instrument

Name
Description
Instrument Type
Program
Project
Collection Period

Fields
 ├── Text
 ├── Number
 ├── Date
 ├── Select
 ├── Multi-select
 ├── Radio
 ├── Checkbox
 ├── Rating
 ├── Likert
 ├── Matrix
 ├── Ranking
 ├── File
 ├── Location
 └── Long Text
```

Drag-and-drop may be added, but it is **not a foundational requirement**.

---

# 1.9 Dynamic Conditional Logic

The form engine must support rules.

Example:

```text
IF
employment_status = "Unemployed"

THEN
SHOW
reason_for_unemployment
```

More complex:

```text
IF
age >= 18
AND
program_participant = true

THEN
SHOW adult_program_section
```

Rules should themselves be stored as configuration rather than hard-coded.

---

# 1.10 Form Lifecycle

```text
Draft
   ↓
Review
   ↓
Published
   ↓
Paused
   ↓
Closed
   ↓
Archived
```

Published instruments should be versioned.

```text
Baseline Survey v1
Baseline Survey v2
Baseline Survey v3
```

Existing responses remain attached to their original version.

---

# 1.11 Distribution

Every published instrument can generate a unique collection endpoint.

Examples:

```text
/forms/{public-token}
```

or:

```text
/collect/{instrument-token}
```

Distribution options:

* Public link
* Private link
* Password-protected link
* Organization-only
* Invitation-based
* QR code

---

# 1.12 Response Workflow

```text
Opened
   ↓
Started
   ↓
Draft
   ↓
Submitted
   ↓
Under Review
   ↓
Approved
   ↓
Locked
```

Depending on the instrument, some states can be disabled.

---

# 1.13 Dataset Management

Every instrument produces or updates a dataset.

Users should be able to:

* view records
* filter
* search
* sort
* edit
* review
* approve
* reject
* archive
* export
* analyze

Dataset fields should be dynamically derived from the instrument schema.

---

# 1.14 Excel Import

Excel is a first-class interoperability format.

Workflow:

```text
Upload Excel
      ↓
Detect Sheets
      ↓
Detect Columns
      ↓
Infer Data Types
      ↓
Map Columns
      ↓
Validate
      ↓
Preview
      ↓
Import
```

Example:

```text
Excel Column       → Platform Field

Age                → respondent_age
Sex                → sex
Community          → community
Satisfaction       → satisfaction_score
```

The system should never silently alter imported data.

---

# 1.15 Export

Support:

* XLSX
* CSV
* JSON
* PDF
* potentially DOCX

Exports should respect permissions and data policies.

---

# 1.16 Dashboard Builder

Dashboards must also be dynamic.

Users can select:

```text
Dataset
 ↓
Dimension
 ↓
Measure
 ↓
Filter
 ↓
Visualization
```

Supported visualizations should eventually include:

* KPI
* table
* bar
* stacked bar
* line
* area
* pie/donut
* histogram
* scatter
* heatmap
* geographic visualization

---

# 1.17 Dashboard Filters

Filters should dynamically derive from available dataset fields.

Example:

```text
Program
Community
Age
Gender
Date
Participant Type
Outcome
```

No dashboard should require developers to manually create filters.

---

# 1.18 Reporting

Reports should support:

* selected datasets
* charts
* tables
* narrative sections
* KPIs
* methodology
* date range
* organizational branding

The report engine should be configuration-driven.

---

# 1.19 Auditability

Every important action should be auditable.

Examples:

```text
User A
created Survey X

User B
changed Question 7

User C
exported Dataset Y

User D
approved Record 184
```

---

# 1.20 Non-Functional Requirements

### Security

* RBAC
* row-level access controls
* encrypted transport
* secure authentication
* audit logs
* secure file storage
* session management
* export controls

### Performance

The architecture should support growth from:

```text
1 NGO
→ 10 programs
→ 100 forms
→ 100,000+ responses
```

without requiring a redesign.

### Availability

The initial deployment can use managed infrastructure, but the architecture should remain portable.

---

# 2. Data Schema

The database should be **metadata-driven**.

A simplified model:

```text
organizations
    │
    ├── users
    ├── programs
    │      └── projects
    │
    ├── instrument_types
    ├── instruments
    │      └── instrument_versions
    │              └── fields
    │
    ├── datasets
    │      └── records
    │
    ├── dashboards
    ├── reports
    ├── imports
    ├── exports
    └── audit_logs
```

## Core tables

### organizations

```text
id
name
slug
description
logo
settings
created_at
updated_at
```

### users

```text
id
organization_id
name
email
status
created_at
updated_at
```

### roles

```text
id
organization_id
name
permissions
```

### programs

```text
id
organization_id
name
description
status
metadata
created_at
updated_at
```

### projects

```text
id
program_id
name
description
status
metadata
start_date
end_date
```

---

## Instrument model

### instrument_types

```text
id
organization_id
name
description
configuration
```

This allows the NGO to create new instrument categories.

### instruments

```text
id
organization_id
instrument_type_id
program_id
project_id
name
description
status
current_version_id
metadata
created_at
updated_at
```

### instrument_versions

```text
id
instrument_id
version_number
schema
logic
settings
published_at
created_at
created_by
```

This is one of the most important tables.

The entire structure of a form can be represented by versioned metadata.

---

# Field Schema

A field could conceptually look like:

```text
{
    "id": "field_123",
    "key": "household_size",
    "label": "Household Size",
    "type": "number",
    "required": true,
    "validation": {
        "min": 1,
        "max": 50
    }
}
```

A select field:

```text
{
    "id": "field_124",
    "key": "community",
    "label": "Community",
    "type": "select",
    "options": [
        {
            "value": "community_a",
            "label": "Community A"
        },
        {
            "value": "community_b",
            "label": "Community B"
        }
    ]
}
```

But we should **not overcommit to JSON-only storage**.

The final architecture should distinguish between:

**metadata**

and

**actual analytical data**.

That decision will matter significantly when designing the database.

---

# Dataset Model

### datasets

```text
id
organization_id
name
description
source_type
instrument_id
program_id
project_id
schema
created_at
updated_at
```

### dataset_records

```text
id
dataset_id
record_key
data
status
created_at
updated_at
submitted_at
reviewed_at
reviewed_by
```

For the first implementation, JSONB can provide substantial flexibility.

PostgreSQL JSONB is particularly useful for dynamic fields.

But frequently queried dimensions may eventually need normalized/indexed representations.

---

# Supporting Data Models

### dashboards

```text
id
organization_id
name
description
configuration
created_by
created_at
updated_at
```

### reports

```text
id
organization_id
name
configuration
created_by
created_at
updated_at
```

### imports

```text
id
organization_id
filename
source_type
status
mapping
validation_results
created_by
created_at
```

### exports

```text
id
organization_id
dataset_id
format
filters
status
created_by
created_at
```

### audit_logs

```text
id
organization_id
user_id
action
resource_type
resource_id
before
after
metadata
created_at
```

---

# 3. UI/UX Considerations

The UI should feel like an **enterprise research/data system without looking like enterprise software**.

The guiding principle:

> **Powerful underneath, simple on the surface.**

## Primary navigation

```text
Dashboard

Programs
Projects

Data Collection
   Instruments
   Responses
   Templates

Data
   Datasets
   Imports
   Exports

Analytics
   Dashboards
   Reports

Administration
   Users
   Roles
   Organization
   Audit Log
```

---

## Instrument Builder

Use a two-panel structure.

```text
┌──────────────────────────────────────────────┐
│ Instrument Name                 [Save] [Publish]
├───────────────┬──────────────────────────────┤
│ FIELD TYPES   │ FORM                         │
│               │                              │
│ Text          │ Household Size              │
│ Number        │ [_____________]              │
│ Select        │                              │
│ Date          │ Community                    │
│ Rating        │ [Select ▼]                   │
│ Matrix        │                              │
│ ...           │                              │
└───────────────┴──────────────────────────────┘
```

Drag-and-drop can later be introduced into the middle/right panel.

---

# Dataset UI

Think **spreadsheet + database**, not spreadsheet alone.

```text
Dataset
──────────────────────────────────────────────

Filters     Search                 Export

| ID | Age | Community | Program | Score |
|----|-----|-----------|---------|-------|
| 01 | 24  | A         | Youth   | 4     |
| 02 | 31  | B         | Youth   | 5     |
```

Clicking a row opens the full record.

---

# Record Review

The record view should be optimized for human review.

```text
Respondent #1024

Identity
────────────
Respondent ID
Community
Collection Date

Responses
────────────
Question 1
Answer

Question 2
Answer

Question 3
Answer

────────────────
[Reject] [Approve] [Save]
```

---

# Dashboard UX

Avoid forcing users to understand data visualization terminology.

Instead:

> **What would you like to see?**

Then:

```text
Measure
[Number of respondents ▼]

Group by
[Community ▼]

Chart
[Bar Chart ▼]
```

Advanced users can access the more powerful configuration.

---

# Responsive design

Three major experiences:

### Desktop

Administration, analysis, dashboards.

### Tablet

Field management and data collection.

### Mobile

Respondent forms and field collection.

The respondent interface should be **extremely lightweight**.

---

# Accessibility

For a top NGO, accessibility should not be an afterthought.

Target:

* WCAG 2.2 AA
* keyboard navigation
* screen-reader compatibility
* adequate contrast
* accessible form labels
* error messaging
* focus management
* touch-friendly controls

---

# 4. Typography & Copy

The product should communicate:

**Trust + clarity + competence.**

Avoid overly technical language.

Instead of:

> Create Schema

Prefer:

> Define your data fields

Instead of:

> Execute Query

Prefer:

> Analyze data

Instead of:

> Dataset Record

Prefer:

> Response

Advanced users can still see technical terminology where appropriate.

---

## Tone

The copy should be:

* professional
* calm
* human
* concise
* trustworthy
* non-corporate
* non-technical where unnecessary

Avoid:

> "Oops! Something went wrong!"

Prefer:

> **We couldn't save your changes.**

Then explain what happened.

---

## Core terminology

I would establish a controlled vocabulary early.

| Technical concept | User-facing term    |
| ----------------- | ------------------- |
| Instrument        | Form / Survey       |
| Schema            | Data structure      |
| Dataset           | Dataset             |
| Record            | Response / Record   |
| Field             | Question / Field    |
| Instance          | Submission          |
| Query             | Analysis            |
| Visualization     | Chart               |
| RBAC              | Roles & permissions |

The system can expose advanced terminology to administrators.

---

# Typography

Use a highly readable modern sans-serif.

For example:

**Inter**

or another open-source/system-friendly sans-serif.

Suggested hierarchy:

```text
Page title       28–32px
Section heading  20–24px
Subheading       16–18px
Body             14–16px
Metadata         12–13px
```

Do not rely on font size alone to communicate hierarchy.

Use:

* whitespace
* weight
* grouping
* labels
* borders
* layout

---

# 5. System Architecture

I'd make the architecture **modular monolithic initially**, rather than jumping into microservices.

That is especially appropriate for an internal NGO platform.

```text
                     USERS
                       │
                       ▼
                ┌───────────────┐
                │    Next.js    │
                │ Web Application│
                └───────┬───────┘
                        │
             ┌──────────┴──────────┐
             │                     │
             ▼                     ▼
       Admin Application     Public Collection
             │                     │
             └──────────┬──────────┘
                        ▼
                  Application Layer
                        │
       ┌────────────────┼────────────────┐
       │                │                │
       ▼                ▼                ▼
 Form Engine       Data Engine      Analytics Engine
       │                │                │
       └────────────────┼────────────────┘
                        ▼
                  PostgreSQL
                   (Supabase)
                        │
        ┌───────────────┼────────────────┐
        ▼               ▼                ▼
     Storage           Auth           Audit Log
```

---

# Application Modules

### Identity & Access

Handles:

* authentication
* organizations
* users
* roles
* permissions

### Organization

Handles:

* programs
* projects
* organizational metadata

### Form Engine

Handles:

* form definitions
* field definitions
* validation
* conditional logic
* versions
* publication

### Collection Engine

Handles:

* public forms
* responses
* drafts
* submissions

### Dataset Engine

Handles:

* datasets
* records
* schemas
* imports
* exports

### Analytics Engine

Handles:

* aggregation
* filters
* calculations
* visualization configuration

### Reporting Engine

Handles:

* report definitions
* PDF generation
* branded reports

### Audit Engine

Records organizational activity.

---

# The most important architectural decision

I would establish a strict separation between:

```text
DEFINITION
```

and

```text
DATA
```

For example:

```text
Instrument Definition
        │
        ├── Fields
        ├── Validation
        ├── Logic
        ├── Layout
        └── Settings
                 │
                 ▼
          Collection Engine
                 │
                 ▼
             Responses
                 │
                 ▼
              Dataset
                 │
          ┌──────┴──────┐
          ▼             ▼
      Analytics       Export
```

This allows the platform to remain dynamic without turning the entire application into hard-coded special cases.

---

# Deployment

For the initial implementation:

```text
Next.js
    │
    ▼
Vercel
    │
    ├── Application
    └── API
          │
          ▼
      Supabase
       ├── PostgreSQL
       ├── Auth
       └── Storage
```

But I would **not couple the application tightly to Vercel-specific functionality**.

The application should be designed so that later you can deploy:

```text
Cloud
Vercel + Supabase

OR

Organization-owned
Docker
+
PostgreSQL
+
Object Storage
```

That preserves the data-sovereignty objective.

---

# The architectural roadmap I'd use

### Phase 1 — Foundation

* Organization
* Users
* Roles
* Programs
* Projects
* Dynamic form engine
* Form versions
* Public links
* Response collection
* Dataset storage
* Excel import/export

### Phase 2 — Data Management

* Record review
* Approval workflows
* Advanced filtering
* Dataset management
* Data validation
* Audit logs
* Advanced permissions

### Phase 3 — Analytics

* Dashboard builder
* Dynamic charts
* Cross-tabulation
* KPI widgets
* Saved filters
* Report builder

### Phase 4 — Research

* Focus groups
* Interviews
* qualitative coding
* themes
* research activities
* longitudinal studies
* baseline/midline/endline relationships

### Phase 5 — Sovereignty

* self-hosted deployment
* organization-controlled storage
* backup/restore
* encryption/key management
* data retention policies
* anonymization
* advanced audit
* data residency controls

