CREATE TABLE IF NOT EXISTS "category_favorites" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "category_id" varchar NOT NULL REFERENCES "categories"("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "cf_user_category_idx"
  ON "category_favorites" ("user_id", "category_id");
