# QRAIVY — Start Here

This is the QRAIVY Project Bible: the permanent knowledge foundation for
this codebase. Read this before touching anything else.

## What QRAIVY Is

QRAIVY is a QR-code-driven customer engagement platform. A business creates
a QR code that leads to an AI-assisted Smart Landing Page, and from there
can layer on wallet passes, loyalty tracking, and multi-channel push
campaigns — all attached to that one QR code and page. See
`company/02_PRODUCT_VISION.md` for the full picture.

## How This Documentation Is Organized

```
docs/
├── 00_START_HERE.md          this file
├── company/                   why QRAIVY exists, what matters, what's been decided
│   ├── 01_MISSION.md
│   ├── 02_PRODUCT_VISION.md
│   ├── 03_CORE_PRINCIPLES.md
│   └── 04_DECISIONS.md
├── architecture/               how the system is actually built, verified against source
│   ├── SYSTEM_ARCHITECTURE.md
│   ├── DATABASE_SCHEMA.md
│   └── API_REFERENCE.md
└── development/                 how to work in this codebase
    ├── CODING_RULES.md
    └── CLAUDE_WORKFLOW.md
```

`company/` documents are written as durable statements of purpose and
direction. `architecture/` documents are technical and verified directly
against the source code — where something isn't yet built, that's stated
plainly in the text rather than through labels.

## Recommended Reading Order

1. **`company/01_MISSION.md`** — why QRAIVY exists
2. **`company/02_PRODUCT_VISION.md`** — what QRAIVY is, for whom, and where
   it's going
3. **`company/03_CORE_PRINCIPLES.md`** — what governs product and
   engineering decisions
4. **`architecture/SYSTEM_ARCHITECTURE.md`** — how the system fits together
5. **`architecture/DATABASE_SCHEMA.md`** and **`architecture/API_REFERENCE.md`**
   — the actual data model and endpoints, as read directly from source
6. **`development/CODING_RULES.md`** — conventions to follow when writing code
7. **`company/04_DECISIONS.md`** — the permanent record of major decisions
   and why they were made; read this whenever you're unsure if something
   has already been decided
8. **`development/CLAUDE_WORKFLOW.md`** — how Claude Code should approach
   work on this project, step by step

## A Note on This Being "Version 1"

This structure is intentionally small. It exists to stay valuable for
years, not to catalog every detail of the codebase. When something needs
documenting that doesn't fit here, the right move is usually to extend one
of these ten files thoughtfully, not to add an eleventh.

## Existing Documentation Preserved

Earlier verified documentation still exists at `docs/API_REFERENCE.md`,
`docs/DATABASE_SCHEMA.md`, `docs/QRAIVY_MASTER_ARCHITECTURE.md`,
`docs/QRAIVY_CODING_RULES.md`, `docs/QRAIVY_ROADMAP.md`,
`docs/01_QRAIVY_PRODUCT_VISION.md`, and `docs/QRAIVY_DESIGN_SYSTEM.md` —
none of these were deleted, renamed, or modified. Their verified content
was reused to build the structure above. `docs/QRAIVY_DESIGN_SYSTEM.md` and
`docs/QRAIVY_ROADMAP.md` don't have a direct home in Version 1 — they
remain the source of truth for design tokens and roadmap detail until a
future version of this Bible addresses them deliberately.
