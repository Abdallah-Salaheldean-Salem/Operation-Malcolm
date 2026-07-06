# Deployment

This guide explains how to deploy the application.

## Prerequisites
- Node.js installed
- npm or yarn

## Build Process
1. Install dependencies: `npm install`
2. Run production build: `npm run build`
3. The build output will be generated in the `dist` directory.

## Hosting
The application is a standard static SPA (Single Page Application) and can be hosted on any static hosting provider like Vercel, Netlify, GitHub Pages, or Firebase Hosting.

## Environment Variables
The app persists workspace data to Supabase. Set these in your hosting provider (e.g. Vercel project settings):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

See `.env.example` for the current project's values. These are safe to expose client-side; access is governed by the `projects` table's row-level security policy.
