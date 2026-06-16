# Deployment Guide - Smart Meeting Scribe

This guide outlines how to deploy the **Smart Meeting Scribe** application online.

---

## 🐋 Option 1: Docker Container Deployment (Recommended)
You can deploy the unified application to any cloud platform that support Docker (like **Railway**, **Render Web Services**, **Fly.io**, or your own **VPS**).

The included [Dockerfile](file:///c:/Users/onur1/Desktop/Anti/smart-meeting-scribe/Dockerfile) performs a multi-stage build:
1. Builds the React/TypeScript frontend.
2. Copies static files to the Express backend.
3. Sets up a Node production server serving the API and the UI on a single port (`5000`).

### Persistent Volume Configuration (Critical for SQLite)
Since SQLite is a file-based database, container restarts will wipe your data unless a persistent volume is mounted:
*   **Mount Path:** `/data`
*   **Environment Variable:** `DATABASE_PATH=/data/database.sqlite`

#### 🚂 Deployment on Railway:
1. Create a new project on Railway and choose **Deploy from GitHub repo**.
2. Select the repository. Railway will automatically detect the `Dockerfile` at the root and build it.
3. Go to the service **Settings** ➔ **Volumes** ➔ click **Add Volume**. 
   * Mount path: `/data`
4. Go to **Variables** and add:
   * `DATABASE_PATH=/data/database.sqlite`
   * `JWT_SECRET=your_production_jwt_secret_key`
   * `GEMINI_API_KEY=your_gemini_api_key`
   * `DEEPGRAM_API_KEY=05d2e929a2417549a8ad9703a8221a8e1cdadb16`
   * `PORT=5000`

---

## 🌐 Option 2: Split Deployments (Render + Vercel)

If you prefer to host the frontend and backend on different platforms:

### 1. Backend Server (on Render/Railway/Heroku)
*   **Build Command:** `npm install` (inside `/backend`)
*   **Start Command:** `npm start` (inside `/backend`)
*   **Persistent Disk:** Add a persistent disk on Render (e.g. `1 GB` mounted at `/data`) and set:
    *   `DATABASE_PATH=/data/database.sqlite`
*   **Environment Variables:**
    *   `JWT_SECRET=your_production_jwt_secret_key`
    *   `GEMINI_API_KEY=your_gemini_api_key`
    *   `DEEPGRAM_API_KEY=05d2e929a2417549a8ad9703a8221a8e1cdadb16`

### 2. Frontend SPA (on Vercel/Netlify/GitHub Pages)
*   Deploy the `frontend` folder.
*   **Build Command:** `npm run build`
*   **Output Directory:** `dist`
*   **Environment Variables:**
    *   Configure `API_BASE` in the code or set a `VITE_API_URL` variable to point to your live Backend server URL (e.g. `https://your-backend.onrender.com/api`).

---

## 🔐 Seeding Default Administrator Account

Upon the first database connection in production, the system automatically checks and seeds a default admin account:
*   **Admin Email:** `admin@scribe.com`
*   **Admin Password:** `admin123`

> [!WARNING]
> For security reasons, immediately log in with `admin@scribe.com` in production, navigate to the User Management panel, promote your personal account to Admin, and change the default admin's password or delete the account.
