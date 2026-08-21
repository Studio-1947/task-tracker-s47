# Architecture

## Strict Separation

Frontend and Backend are strictly separated. No shared code allowed.

## Frontend

- **Web**: Next.js
- **Mobile**: React Native
- **Shared**: UI components and validation logic (Frontend only)

## Backend

- **API**: NestJS
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: JWT, RBAC
