# vercel_clone

Minimal Node.js demo app with an Express server and static frontend.

## Summary
- Entry point: `index.js`
- Simple Express-based server serving static HTML from `front/` and using Mongoose models in `models/`.

## Requirements
- Node.js (>= 18 recommended)
- npm

## Install
```bash
npm install
```

## Run (development)
Start the app with nodemon (script defined in `package.json`):
```bash
npm start
```

## Environment
- Use environment variables for sensitive values (database URI, JWT secret). Example env vars:
	- `MONGODB_URI` — MongoDB connection string
	- `JWT_SECRET` — JSON Web Token secret

## Project structure
- `index.js` — application entry point
- `package.json` — project metadata and scripts
- `front/` — static HTML views (Home.html, login.html, Reg.html)
- `models/` — Mongoose models (`User.js`, `deploy.js`)

Note: This repository does not include a `projects/` folder. Remove or add demo deploy folders as needed.

## Notes / Next steps
- Add proper environment configuration (e.g., `.env` and `dotenv`) before deploying.
- Add README files for any demo subapps you add under separate folders.
- Add tests and CI if you plan to extend the project.

## License
- ISC (see `package.json`)
# deployment-server
