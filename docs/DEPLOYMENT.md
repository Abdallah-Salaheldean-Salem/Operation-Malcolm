# Deployment Guide

This document serves as the strict, step-by-step instruction manual for taking the code from GitHub and putting it live on the internet.

## 1. Hosting Environment
This project is deployed on Vercel and utilizes Continuous Deployment (CD) directly from the main branch of this GitHub repository.

## 2. Prerequisites
To manage the deployment, you will need the following:
- A GitHub account with write access to the repository.
- A Vercel account linked to the GitHub repository.
- Any required command-line tools (like Git or the Vercel CLI, if you use it locally).

## 3. The Deployment Process (Step-by-Step)
Our Vercel setup makes deploying highly automated and straightforward.

- **Production Deployment**: Any code pushed or merged into the `main` branch triggers an automatic build and deployment to the live production URL. 
- **Preview Deployments**: If you create a new branch or open a Pull Request, Vercel automatically generates a temporary "Preview URL" allowing you to test changes securely before they go live.

## 4. Environment Variables
The project relies on external APIs (such as Gemini for AI reporting and Supabase for the database backend) and requires environment variables to function correctly. **Never commit API keys directly into your code.**

The project requires the following environment variables:
- `GEMINI_API_KEY`: Required for Gemini AI API calls (project reports).
- `APP_URL`: The URL where this applet is hosted.
- `VITE_SUPABASE_URL`: Your Supabase project URL. *Optional* — the app falls back to the shared Operation Malcolm project baked into `src/lib/supabase.ts`, so the shared workspace works with zero configuration.
- `VITE_SUPABASE_ANON_KEY`: Your Supabase publishable (anon) key. *Optional*, same fallback as above. This key is safe to expose client-side; access is governed by Row Level Security.

**Shared workspace note**: the app treats Supabase as the shared source of truth — every visitor sees and edits the same workspace (there is no login). Edits are pushed automatically a moment after each change, and the app pulls the latest data on load and whenever the tab regains focus.

**Where to configure them**: Add these variables in the Vercel Dashboard under **Settings > Environment Variables**.

## 5. Custom Domain Configuration
*If you eventually purchase a custom domain, document it here.*

- **Live Domain**: [Insert Live Domain Name Here]
- **DNS Management**: [Insert DNS Provider, e.g., GoDaddy, Namecheap, Route53]

*Note: Update this section once a custom domain is linked to the Vercel project.*

## 6. Rollback Procedures
If a bad update is pushed to production, you can easily revert to a previous working version.

- **Vercel Rollback**: Open the Vercel Dashboard, go to the **Deployments** tab, click the three dots (`...`) next to the previous successful deployment, and select **Promote to Production** to instantly revert the live site.
