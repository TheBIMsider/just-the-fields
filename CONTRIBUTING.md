# Contributing to Just the Fields (JTF)

Thanks for your interest in contributing.

Before opening a pull request, please read this file. It explains the scope
and design intent of the project.

---

## Project philosophy

Just the Fields is intentionally simple.

- Viewer-focused
- Read-only
- No backend
- No build step
- No framework lock-in

If a change makes the code harder to read or harder to explain, it is probably
not a good fit.

---

## Scope guardrails (important)

Please avoid proposals that add:

- Template scripting, conditionals, or execution logic
- Data editing, write-back, or mutation
- Validation engines or schema enforcement
- User accounts, storage, or backends
- New dependencies or frameworks

Templates control layout only.  
They do not control behavior.

---

## What makes a good contribution

Good contributions are usually:

- Small and focused
- Easy to understand by reading the diff
- Boring in the best way
- Backwards-compatible

Examples:
- UI polish
- Accessibility improvements
- Documentation fixes
- Template examples
- Performance improvements that do not add complexity

---

## How to contribute

1. Fork the repository
2. Create a branch from `main`
3. Make your change
4. Open a pull request with:
   - A clear description of what changed
   - Screenshots if the UI changed
   - A brief explanation of why the change is useful

---

## Code style

- Vanilla HTML, CSS, and JavaScript only
- Prefer clarity over cleverness
- Comment intent, not implementation
- Assume a future reader is new to the code

---

Thanks for helping keep JTF simple and useful.
