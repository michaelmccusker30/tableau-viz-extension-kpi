# Deployment Guide

This extension is a fully static web app (HTML, CSS, JavaScript). There is no server-side logic and no database — all data processing happens client-side using values passed in by the Tableau Extensions API. This means it can be hosted on any platform that can serve static files over HTTPS.

Tableau requires extensions to be served over HTTPS. This applies both to Tableau Desktop and Tableau Cloud.

---

## Option 1 — Vercel (simplest, free)

Best for personal use, small teams, or public sharing.

1. Push the repository to GitHub (already done if you're reading this in the repo).
2. Go to [vercel.com](https://vercel.com) and sign in with GitHub.
3. Click **Add New → Project** and import this repository.
4. Vercel will detect the `vercel.json` and use `public/` as the output directory. No build configuration needed.
5. Click **Deploy**. Vercel assigns a URL like `https://your-project.vercel.app`.

Once deployed:
- Open `manifest.production.trex`
- Replace both instances of `VERCEL_URL_HERE` with your Vercel URL (without trailing slash)
- Load `manifest.production.trex` in Tableau Desktop or add the URL to your Tableau Cloud safelist

Any future `git push` to the main branch redeploys automatically.

---

## Option 2 — Any static hosting provider

The extension works on any host that supports HTTPS and static file serving. Examples include Netlify, AWS S3 + CloudFront, Azure Static Web Apps, and GitHub Pages.

The only requirements are:
- HTTPS (required by Tableau)
- The root URL serves `index.html`
- `/styles/kpi.css`, `/src/main.js`, and `/tableau.extensions.1.latest.min.js` are accessible relative to the root

Upload or deploy the contents of the `public/` directory to your host's root. Update `manifest.production.trex` with the resulting URL.

---

## Option 3 — Internal / self-hosted

For environments where the extension must be hosted on your own infrastructure (behind a firewall, on an internal network, or on a company-managed server), the approach is the same as Option 2 — serve the contents of `public/` as static files over HTTPS.

**What you'll need:**
- A web server capable of serving static files (nginx, Apache, IIS, Caddy, or any equivalent)
- A valid SSL certificate for your domain (from your organisation's certificate authority, Let's Encrypt, or a commercial CA)
- Network access from the machines running Tableau Desktop or Tableau Cloud to the server

**nginx example config:**

```nginx
server {
    listen 443 ssl;
    server_name kpi-extension.your-domain.internal;

    ssl_certificate     /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    root /var/www/kpi-extension;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Place the contents of `public/` at the path specified in `root`. Restart nginx and confirm the URL is reachable over HTTPS.

Update `manifest.production.trex` with your internal URL.

---

## Tableau Cloud safelist

If the extension will be used in a Tableau Cloud workbook, a site administrator must add the extension URL to the safelist before users can load it.

1. Sign in to Tableau Cloud as a site administrator
2. Go to **Settings → Extensions**
3. Under **Viz Extensions**, click **Add Extension by URL**
4. Enter the URL (e.g. `https://your-project.vercel.app`)
5. Save

Once safelisted, users on that site can load the extension in published workbooks.

---

## Updating the manifest

There are two manifest files:

| File | Use |
|---|---|
| `manifest.trex` | Local development — points to `https://localhost:3001` |
| `manifest.production.trex` | Production — points to your hosted URL |

When loading the extension in Tableau Desktop for production use, or embedding it in a published Tableau Cloud workbook, use `manifest.production.trex`.
