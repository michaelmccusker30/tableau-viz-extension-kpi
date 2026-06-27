# KPI Card — Tableau Viz Extension

A custom Tableau viz extension that replaces the standard KPI card workflow. Drop a measure and a date onto two encoding shelves and get a Big Ass Number, period-over-period delta, sparkline trend chart, and optional goal tracking — all without writing a single calculated field.

![KPI Card screenshot](docs/screenshot.png)

---

## What it does

- **BAN** — formats your measure as currency, percentage, plain number, or a custom prefix/suffix format
- **Delta** — year-over-year or period-over-period % change with coloured up/down indicators
- **Trend chart** — SVG area + line chart showing current year vs. prior year
- **Goal bar** — set a target value in the settings; the card handles the comparison
- **Colour picker** — Tableau 10, Tableau 20, Miller Stone, Nuriel Stone, Colour Blind palettes
- **Period grain** — switch between day, week, month, quarter, year on the fly
- **Ratio measures** — use the Denominator shelf for metrics like Profit Ratio (see below)

---

## Requirements

- [Node.js](https://nodejs.org) (v18+)
- [Tableau Desktop](https://www.tableau.com/products/desktop) (free version works — this is not compatible with Tableau Public Desktop)
- A self-signed localhost SSL certificate (required by the Tableau Extensions API)

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/michaelmccusker30/tableau-viz-extension-kpi.git
cd tableau-viz-extension-kpi
npm install
```

### 2. Generate a localhost SSL certificate

Tableau Desktop requires extensions to be served over HTTPS, even locally. Use [mkcert](https://github.com/FiloSottile/mkcert) to generate a trusted local certificate:

```bash
brew install mkcert
mkcert -install
mkcert localhost
```

This creates `localhost.pem` and `localhost-key.pem` in the current directory. The server looks for them here by default — if they're somewhere else, update the paths in `server-tableau.js`.

### 3. Start the server

```bash
npm run tableau
```

This serves the extension over HTTPS on port 3001.

> For development without Tableau (browser preview only), run `npm start` instead — this serves HTTP on port 3000.

### 4. Load in Tableau Desktop

1. Open Tableau Desktop and connect to your data source
2. Create a new sheet
3. Change the mark type to **Extension**
4. Click **"My Extensions"** and load `manifest.trex` from this project folder
5. Accept the prompt — the KPI card will appear

---

## Using the extension

### Encoding shelves

| Shelf | What to put here |
|---|---|
| **Measure** | The numeric field you want to display (e.g. Sales, Revenue) |
| **Date** | A date or datetime field (e.g. Order Date) |
| **Denominator** | *(Optional)* For ratio measures only — see below |

### Settings

Click the **⚙ Settings** button on the card to open the settings panel. Changes apply live — you don't need to close the panel to see updates.

| Setting | Options |
|---|---|
| Number format | Currency, Percentage, Number, Custom |
| Decimal places | 0 – 4 |
| Abbreviate | Toggle $85,175 → $85.2K |
| Comparison | Year-over-year or Period-over-period |
| Period grain | Day, Week, Month, Quarter, Year |
| Goal | Set a target value; choose whether higher or lower is better |
| Colour palette | Tableau 10/20, Miller Stone, Nuriel Stone, Colour Blind |
| Up / Down colours | Custom colours for positive and negative deltas |
| Font | System, Inter, Lato, Montserrat, DM Sans, Georgia, Playfair, Mono |

### Ratio measures (e.g. Profit Ratio)

The extension receives row-level data from Tableau, so dragging a pre-calculated ratio field (like `AGG(Profit Ratio)`) onto the Measure shelf will give an incorrect result — it can't derive `SUM(Profit) / SUM(Sales)` from individual row ratios.

**The fix:** use the Denominator shelf.

1. Drag your numerator field (e.g. `Profit`) onto **Measure**
2. Drag your denominator field (e.g. `Sales`) onto **Denominator**

The extension computes `SUM(numerator) / SUM(denominator)` per period bucket correctly. For more complex metrics, create separate numerator and denominator calculated fields in Tableau and use those.

---

## Project structure

```
manifest.trex          Tableau extension manifest
public/
  index.html           Main extension UI
src/
  main.js              All extension logic (data, chart, settings)
  dev/
    tableauStub.js     Browser dev stub (replaces Tableau API for local preview)
styles/
  kpi.css              Styles
server.js              HTTP dev server (port 3000)
server-tableau.js      HTTPS server for Tableau Desktop (port 3001)
```

---

## Acknowledgements

Built with [Claude Code](https://claude.ai/code). Read the full write-up on how this was built at [michael-mccusker.com](https://michael-mccusker.com).
