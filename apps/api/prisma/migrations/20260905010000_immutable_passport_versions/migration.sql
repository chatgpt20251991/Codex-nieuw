CREATE FUNCTION enforce_published_passport_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."publicationState" = 'published' THEN
    RAISE EXCEPTION 'Published passport versions are immutable'
      USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION enforce_published_passport_immutable() FROM PUBLIC;
CREATE TRIGGER published_passport_immutable
  BEFORE UPDATE OR DELETE ON "PassportVersion"
  FOR EACH ROW EXECUTE FUNCTION enforce_published_passport_immutable();
