# Open Course Builder

A simple CRUD course builder that aggregates web links, text notes, and markdown notes into one place. Backed by a single `db.json` file and a tiny Node/Express server.

## Stack
- **Frontend:** HTML, Bootstrap 5, vanilla JS (no build step).
- **Backend:** Node + Express, `uuid` for IDs.
- **Storage:** `db.json` (auto-created).

## Run
```bash
npm install
npm start
```
Then open http://localhost:3000

## Project layout
```
open-course-builder/
├── server.js        # Express API + static server
├── package.json
├── db.json          # JSON database (auto-created)
├── public/          # Static frontend
│   ├── index.html
│   ├── app.js
│   └── styles.css
```

## API
- `GET    /api/courses` — list courses
- `POST   /api/courses` — create a course (with optional `lessons[]`)
- `GET    /api/courses/:id` — get one course
- `PUT    /api/courses/:id` — update title/description
- `DELETE /api/courses/:id` — delete a course
- `POST   /api/courses/:id/lessons` — add a lesson
- `PUT    /api/courses/:id/lessons/:lessonId` — update a lesson
- `PATCH  /api/courses/:id/lessons/:lessonId/toggle` — toggle `isCompleted`
- `DELETE /api/courses/:id/lessons/:lessonId` — delete a lesson
- `PUT    /api/courses/:id/lessons/:lessonId/note` — autosave the per-lesson markdown note

## Lesson shape
```json
{
  "id": "uuid",
  "title": "Flexbox basics",
  "type": "link | text | markdown",
  "resource": "https://example.com/article",
  "notes": "free-form notes",
  "lessonNote": "per-lesson markdown note (autosaved)",
  "isCompleted": false,
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

`type` is one of `link` (any URL), `text` (plain-text note stored in `notes`), or `markdown` (GitHub-flavored markdown stored in `notes`). Legacy `type` values (e.g. `youtube`, `pdf`, `image`) are automatically normalized to `link` on read.
