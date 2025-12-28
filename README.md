# Just the Fields (JTF)

<img width="1150" height="450" alt="JTF_Logo_White_Banner" src="https://github.com/user-attachments/assets/c40bb4a8-f2c4-4339-8ebe-6c041748ae02" />

A lightweight JSON viewer that helps you focus on just the fields that matter.

JTF runs entirely in your browser and works great on GitHub Pages.  
Drop in JSON files, explore them safely, and use templates to control what you see.

### Live demo

👉 https://thebimsider.github.io/just-the-fields/  

Runs entirely in your browser. No uploads. No installs.

---

## What JTF is

- A fast, browser-based JSON viewer
- A way to explore large or messy JSON without writing code
- A template-driven layout tool for records like Issues, RFIs, or API responses
- Offline-friendly and easy to host
  
<img width="1920" height="884" alt="JTF" src="https://github.com/user-attachments/assets/51ca6cb9-10d0-4cbf-a2b9-b8552ef77883" />

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

---

## How JTF views your JSON

JTF automatically adapts to common JSON shapes so you do not have to restructure your data first.

### Dataset mode

Best for large, flat arrays (table-like data).

- Automatically detected for large arrays
- Filter rows
- Jump to specific rows
- Templates do not apply in this mode

### Records mode

Best for API responses and structured objects.

- Detects records from common wrapper shapes
- Lets you select individual records
- Templates control layout and record labels

You can override the mode at any time.

---

## Templates

Templates let you define **what fields appear and in what order**.

They are:

- Plain JSON files
- Declarative (no logic, no scripting)
- Safe if fields are missing
- Easy to edit in any text editor

Templates control layout only.  
They cannot change app behavior or data.

---

## Getting started with templates

- Click **Download** in the Templates panel to get a starter file  
- Or open the [starter templates page](templates/index.html) (save the file locally if it opens in your browser)
- Edit paths and labels
- Upload the template back into JTF

---

## Template basics

A template contains:

- `templateName`
- Optional `match` rules (to control when it applies)
- Optional `recordLabel` rules (for the record dropdown)
- A `layout` made of sections and fields

If a field path does not exist, it is simply skipped.

## Design goals

- Keep it boring and readable
- No dependencies
- No build step
- No framework lock-in
- Easy to modify months or years later

If someone opens this code cold in the future, they should be able to follow it.

---

## Contributing

Contributions are welcome, but keep the scope tight.

Please avoid proposals that add:
- Template scripting or conditional logic
- Data editing or write-back
- Accounts, storage, or backends
- Heavy dependencies or frameworks

Small, focused improvements are best.

See `CONTRIBUTING.md` for details.

---

## License

This project is licensed under the BSD-3-Clause License.

---

*Built with ❤️ & 🤖 AI assistance from ChatGPT by The BIMsider for the AECO community*  

*Just the Fields: Your JSON Detective - See what matters.*


