# DeskNote

A private couple message board for two ESP32-based desk displays.
Built with Next.js (App Router), TypeScript, Tailwind CSS, and Supabase.
Ready to deploy on Vercel.

> Two desks. One conversation.

## Features

- Email magic-link auth via Supabase (`/login` → `/auth/callback`)
- Server actions for sending notes and auth
- Protected routes via Next.js middleware + Supabase SSR cookies
- Romantic-minimal design system (warm cream, rose, blush, muted plum)
- Mobile-first responsive layout with a floating bottom nav
- PWA manifest + iOS web app metadata
- Device API route (`/api/device/notes`) consumed by the ESP32 firmware,
  authenticated with a shared `DEVICE_API_KEY`

## Tech stack

| Layer       | Choice                                     |
| ----------- | ------------------------------------------ |
| Framework   | Next.js 15 (App Router, Server Actions)    |
| Language    | TypeScript (strict)                        |
| Styling     | Tailwind CSS 3                             |
| Auth + DB   | Supabase (`@supabase/ssr`)                 |
| Fonts       | Inter + Fraunces (next/font)               |
| Deployment  | Vercel                                     |

## Project structure

```
.
├── app/
│   ├── login/page.tsx             # Magic link sign-in
│   ├── auth/callback/route.ts   # OAuth / magic-link code exchange
│   ├── actions/                   # Server actions (auth, notes)
│   ├── api/device/notes/route.ts  # ESP32-facing REST endpoint
│   ├── dashboard/page.tsx         # Note feed + composer
│   ├── devices/page.tsx           # Manage desk displays
│   ├── settings/page.tsx          # Account + pairing
│   ├── globals.css                # Tailwind + design tokens
│   ├── layout.tsx                 # Root layout, metadata, fonts
│   ├── not-found.tsx              # 404 page
│   └── page.tsx                   # Marketing homepage
├── components/
│   ├── ui/                        # Button, Card, Input
│   ├── AppShell.tsx               # Shared layout with nav
│   ├── Navigation.tsx             # Desktop sidebar + mobile bottom nav
│   ├── NoteCard.tsx
│   └── NoteComposer.tsx           # Client form using server action
├── lib/
│   ├── auth/                      # routes.ts, site-url.ts, session helpers
│   ├── supabase/
│   │   └── auth.ts                # getUser, requireAuth (uses utils/supabase)
│   └── utils.ts                   # `cn()`, time helpers
├── utils/
│   └── supabase/                  # @supabase/ssr clients (URL + publishable key)
│       ├── env.ts
│       ├── client.ts
│       ├── server.ts
│       ├── middleware.ts
│       └── route-handler.ts
├── public/
│   ├── icons/                     # PWA icons (add your own)
│   └── manifest.json              # PWA manifest
├── types/database.ts              # Typed Supabase schema
├── middleware.ts                  # Auth guard for /dashboard, /devices
├── next.config.ts
├── tailwind.config.ts
├── postcss.config.mjs
├── tsconfig.json
└── package.json
```

## Getting started

1. Install dependencies

   ```bash
   npm install
   ```

2. Configure environment variables

   Copy `.env.example` to `.env.local` and fill in your Supabase
   project's URL, anon key, service-role key, and a random
   `DEVICE_API_KEY` that your ESP32 firmware will send as the
   `X-Device-Key` header.

3. Create the database schema in Supabase

   DeskNote expects three tables: `profiles`, `notes`, `devices`
   (see `types/database.ts` for their shapes). Run something like:

   ```sql
   create table profiles (
     id uuid primary key references auth.users(id) on delete cascade,
     display_name text,
     partner_id uuid references profiles(id),
     avatar_url text,
     created_at timestamptz default now()
   );

   create table devices (
     id uuid primary key default gen_random_uuid(),
     owner_id uuid not null references profiles(id) on delete cascade,
     name text not null,
     last_seen_at timestamptz,
     firmware_version text,
     online boolean default false,
     created_at timestamptz default now()
   );

   create type note_status as enum ('queued', 'delivered', 'seen');

   create table notes (
     id uuid primary key default gen_random_uuid(),
     sender_id uuid not null references profiles(id) on delete cascade,
     recipient_id uuid not null references profiles(id) on delete cascade,
     device_id uuid references devices(id),
     body text not null check (char_length(body) <= 140),
     status note_status default 'queued',
     created_at timestamptz default now()
   );

   alter table profiles enable row level security;
   alter table devices  enable row level security;
   alter table notes    enable row level security;

   -- sample policies (tighten for production)
   create policy "profiles self" on profiles
     for all using (auth.uid() = id) with check (auth.uid() = id);

   create policy "own devices" on devices
     for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

   create policy "notes sender or recipient" on notes
     for select using (auth.uid() in (sender_id, recipient_id));
   create policy "notes insert as sender" on notes
     for insert with check (auth.uid() = sender_id);
   ```

4. Run the dev server

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Deploying to Vercel

1. Push this repo to GitHub.
2. Import it in Vercel.
3. Add the four env vars from `.env.example` in the project's
   Environment Variables tab.
4. Deploy.

No further config is needed — `next.config.ts` is production-ready.

## ESP32 desk firmware contract

The desk display polls:

```
GET /api/device/notes?device_id={uuid}
Headers: X-Device-Key: <DEVICE_API_KEY>

→ 200 { "notes": [{ "id", "body", "created_at" }] }
```

And acks what it shows:

```
POST /api/device/notes
Headers: X-Device-Key: <DEVICE_API_KEY>
Body:    { "note_id": "<uuid>", "status": "delivered" | "seen" }
```

## Design tokens

| Token     | Value      | Use                   |
| --------- | ---------- | --------------------- |
| `cream`   | `#FDFAF6`  | Page background       |
| `blush`   | `#F5D5D0`  | Soft accents, chips   |
| `rose`    | `#D98A8A`  | Primary accent, links |
| `plum`    | `#6B4E57`  | Text, buttons         |
| `ash`     | `#E5DED6`  | Borders, muted BG     |

Fonts: **Inter** (UI) and **Fraunces** (display / serif).

## License

MIT.
