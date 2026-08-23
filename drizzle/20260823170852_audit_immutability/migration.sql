-- Az auditnapló alkalmazásból nem módosítható és nem törölhető (spec 13.2).
CREATE OR REPLACE FUNCTION prevent_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Az auditnapló nem módosítható és nem törölhető';
END;
$$ LANGUAGE plpgsql;

--> statement-breakpoint

CREATE TRIGGER audit_log_no_update
BEFORE UPDATE OR DELETE ON "audit_log"
FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
