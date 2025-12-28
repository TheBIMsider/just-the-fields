# Just the Fields (JTF)

A lightweight JSON viewer that helps you focus on just the fields that matter.

JTF runs entirely in your browser and works great on GitHub Pages.  
Drop in JSON files, explore them safely, and use templates to control what you see.

---

## What JTF is

- A fast, browser-based JSON viewer
- A way to explore large or messy JSON without writing code
- A template-driven layout tool for records like Issues, RFIs, or API responses
- Offline-friendly and easy to host

---

## What JTF is not

- Not a JSON editor
- Not a validator or schema checker
- Not a workflow tool
- Not a backend service
- Not a data exporter (aside from downloading templates)

**JTF reads data. It does not change data.**

---

## Running JTF locally

Because browsers restrict file access when opening files directly, use a small local server.

### Option A: VS Code Live Server

1. Install the **Live Server** extension
2. Right-click `index.html`
3. Select **Open with Live Server**

### Option B: Python

From the project folder:

```bash
python -m http.server 8080
```
