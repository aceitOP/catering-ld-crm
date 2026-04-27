ALTER TABLE recipe_steps
  ADD COLUMN IF NOT EXISTS photo_document_id INTEGER REFERENCES dokumenty(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_recipe_steps_photo_document_id
  ON recipe_steps(photo_document_id);
