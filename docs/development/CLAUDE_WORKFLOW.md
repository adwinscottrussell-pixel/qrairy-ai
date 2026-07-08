# QRAIVY — Claude Workflow

This is how Claude Code should approach work on this project. Follow these
steps in order, for any task beyond pure documentation.

## The Workflow

1. **Read the Product Bible.** Start at `docs/00_START_HERE.md` and read
   what's relevant to the task — at minimum `company/02_PRODUCT_VISION.md`,
   `company/03_CORE_PRINCIPLES.md`, and `company/04_DECISIONS.md`, plus
   whichever `architecture/` documents cover the area being touched.
2. **Inspect the existing code.** Read the actual files involved before
   proposing or making any change. The Bible tells you what's true as of
   its last verification — the code is the ground truth for anything more
   current or more specific than the Bible covers.
3. **Produce a plan.** Describe what you intend to change and why, in
   enough detail that someone could review it without reading the code
   themselves first. Reference the specific principle or decision (from
   `company/03_CORE_PRINCIPLES.md` or `company/04_DECISIONS.md`) the plan
   is consistent with, if relevant.
4. **Wait for approval.** Do not proceed to making changes until the plan
   is explicitly approved.
5. **Make one focused change.** Once approved, implement exactly what was
   planned — not a broader refactor, not adjacent cleanup, not a second
   unrelated fix noticed along the way. If something else needs fixing,
   name it for a separate, later change rather than folding it in.
6. **Test.** Verify the change actually works before presenting it —
   whatever "test" means for the specific change (running existing checks,
   manual verification, tracing the logic against real data). See
   `development/TESTING.md` if/when it exists for more on this project's
   testing state; as of this writing, no automated test suite was found in
   the codebase, so manual verification is the default.
7. **Show git diff.** Present the actual diff of what changed — not a
   description of it — so it can be reviewed line by line.
8. **Wait for approval.** Do not commit until the diff is explicitly
   approved.
9. **Commit.** Once approved, commit with a clear, conventional-commit-style
   message describing the change.
10. **Push.** Only after the commit is made and, if there's any doubt about
    whether pushing is expected at this point, confirm first — pushing can
    trigger deployment depending on this project's CI/CD setup, and that's
    not something to do without being sure it's wanted.

## Why This Order Matters

Each "wait for approval" step exists because the previous step produced
something worth reviewing before more effort (or any risk) is added on top
of it — a plan is cheap to redirect, a made-and-tested change is not free
to redirect, and a pushed commit is the most expensive of all to undo
cleanly. Skipping a wait-for-approval step to save time trades a small
time savings for a much larger risk if the direction was wrong.

## Documentation-Only Work Is Different

Everything above assumes a code change. Pure documentation work (updating
something in `docs/`) doesn't require the "make one focused change / test"
steps in the same way, but should still: read what's relevant first,
propose what will change, show the actual result (not just describe it),
and wait for approval before it's treated as final — commit and push still
apply the same way.

## What This Workflow Does Not Override

This workflow describes process, not permission. It doesn't grant authority
to run destructive database operations, deploy to production, or make any
change outside what was explicitly approved in step 4 — those boundaries
apply regardless of which step of this workflow is active.
