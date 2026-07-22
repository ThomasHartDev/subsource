# Subsource

A review platform for commercial contractors and the businesses around them. Users find contractors, subcontractors, suppliers, and agencies, then rate and review them. Business owners can claim their listing and respond.

## Overview

Subsource is a Nuxt 3 app with server-side rendering. The catalog is split into four listing types, each with its own search page and detail page: contractors, subcontractors, suppliers, and agencies. Visitors leave star ratings and written reviews, and the detail pages chart the score history. Owners submit a claim on a listing to take it over. There is also a blog for company news and an admin area for moderating everything.

## Features

- Four listing categories: contractors, subcontractors, suppliers, agencies, each with a dedicated search page
- Star ratings and written reviews, with review charts on each listing
- Add a business and claim an existing listing, with a claims queue for review
- Google sign-in plus JWT sessions, passwords hashed with bcrypt
- reCAPTCHA v3 on public forms to cut spam
- Blog with markdown posts and per-post SEO metadata and JSON-LD
- Admin pages to edit listings, users, reviews, blog posts, and claims
- SSR for fast first paint and search indexing

## Stack

- Nuxt 3 (Vue 3, SSR), Pinia for state
- Nuxt server routes for the API
- MongoDB Atlas via Mongoose
- Google OAuth (`nuxt-vue3-google-signin`, `google-auth-library`), `jsonwebtoken`, `bcrypt`
- `vue-recaptcha-v3`, `@nuxt/image`, Chart.js
- Deployed on Vercel

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
```

Create a `.env` in the project root:

```
DB_URI=your_mongodb_connection_string
GOOGLE_CLIENT_ID=your_google_oauth_client_id
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret
JWT_SECRET=your_jwt_secret
RECAPTCHA_SITE_KEY=your_recaptcha_site_key
RECAPTCHA_SECRET_KEY=your_recaptcha_secret_key
```

Build and run production:

```bash
npm run build
npm run start
```

Built by HARTECHO.
