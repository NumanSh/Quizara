# Specification: Supabase Google Auth Migration

## Summary
Migrate the Trivia Nexus (Quizara) authentication system from Replit-specific OIDC to Supabase Auth with Google as the identity provider. This will enable local development and provide a robust, production-ready authentication flow.

## User Scenarios

### Scenario 1: New User Sign Up
- **Precondition**: User is not logged in and does not have an account.
- **Action**: User clicks "Login with Google".
- **Result**: User is redirected to Google, authorizes the app, and is redirected back. A new entry is created in the `profiles` table using their Google profile information.

### Scenario 2: Existing User Login
- **Precondition**: User has previously logged in with Google.
- **Action**: User clicks "Login with Google".
- **Result**: User is instantly authenticated and redirected to their dashboard. Their session is maintained via Supabase JWT.

### Scenario 3: Secure API Access
- **Precondition**: User is logged in.
- **Action**: User performs an action that requires API access (e.g., submitting a quiz).
- **Result**: The frontend sends the Supabase JWT in the Authorization header. The backend validates the JWT and associates the request with the correct `user_id`.

## Functional Requirements

1. **Frontend Integration**:
   - Implement Supabase Auth client in the `quizara` artifact.
   - Replace the Replit Auth button with a "Login with Google" button.
   - Handle auth state changes (login/logout) globally.

2. **Backend Integration**:
   - Implement middleware in `api-server` to verify Supabase JWTs.
   - Replace `replit-auth` middleware with the new Supabase middleware.
   - Ensure the `req.user` object is correctly populated from the JWT claims.

3. **Database Sync**:
   - Ensure that when a user logs in, their profile in the `profiles` table is kept up-to-date.
   - Use the `sub` claim from the JWT as the unique `user_id`.

4. **Environment Configuration**:
   - Support `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `DATABASE_URL` via environment variables.

## Success Criteria

- **Seamless Login**: Users can log in with a single click via Google.
- **Zero Local Dependencies**: The app runs locally without requiring the Replit environment for authentication.
- **Secure API**: All protected routes correctly reject unauthenticated requests.
- **Data Integrity**: User IDs remain consistent between the auth provider and the database.

## Entities

- **User**: Represented by `user_id` (Google/Supabase ID), `email`, `display_name`, and `avatar_url`.
- **Session**: Managed by Supabase (JWT with ~1 hour expiry, auto-refreshable).

## Assumptions

- The user has already configured Google Auth in the Supabase Dashboard.
- The `profiles` table in the database is compatible with the data returned by Google Auth.
- The project will use the `service_role` key for administrative backend tasks if necessary.

## Open Questions
- [ ] Should we support other providers besides Google in the future? (Guess: Yes, but Google is the priority).
- [ ] Do we need to migrate existing Replit user IDs? (Guess: No, start fresh for local dev).
