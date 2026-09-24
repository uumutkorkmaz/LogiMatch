-- Prisma'nın ifade edemediği kısıtlar ve index'ler. docs/ARCHITECTURE.md §5, docs/DOMAIN.md §8.

-- ── Coğrafi index'ler (ST_DWithin ön-elemesi) ──────────────────────────
CREATE INDEX "TruckPosting_originLocation_gist" ON "TruckPosting" USING gist ("originLocation");
CREATE INDEX "Load_pickupLocation_gist" ON "Load" USING gist ("pickupLocation");
CREATE INDEX "Load_deliveryLocation_gist" ON "Load" USING gist ("deliveryLocation");
CREATE INDEX "LoadStop_location_gist" ON "LoadStop" USING gist ("location");
CREATE INDEX "Driver_homeBaseLocation_gist" ON "Driver" USING gist ("homeBaseLocation");

-- ── Bulanık firma adı araması ─────────────────────────────────────────
CREATE INDEX "Company_legalName_trgm" ON "Company" USING gin ("legalName" gin_trgm_ops);

-- ── Değer aralığı kontrolleri ─────────────────────────────────────────
ALTER TABLE "Load" ADD CONSTRAINT "Load_pickup_window_valid" CHECK ("pickupWindowStart" < "pickupWindowEnd");
ALTER TABLE "Load" ADD CONSTRAINT "Load_delivery_window_valid" CHECK ("deliveryWindowStart" < "deliveryWindowEnd");
ALTER TABLE "Load" ADD CONSTRAINT "Load_weight_positive" CHECK ("weightKg" > 0);
ALTER TABLE "Load" ADD CONSTRAINT "Load_budget_order" CHECK ("budgetMin" IS NULL OR "budgetMax" IS NULL OR "budgetMin" <= "budgetMax");
ALTER TABLE "TruckPosting" ADD CONSTRAINT "TruckPosting_window_valid" CHECK ("availableFrom" < "availableUntil");
ALTER TABLE "TruckPosting" ADD CONSTRAINT "TruckPosting_deadhead_nonneg" CHECK ("maxDeadheadKm" >= 0);
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_round_range" CHECK ("round" BETWEEN 1 AND 5);
ALTER TABLE "Match" ADD CONSTRAINT "Match_score_range" CHECK ("score" BETWEEN 0 AND 100);
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_stars_range" CHECK ("stars" BETWEEN 1 AND 5);
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_period_valid" CHECK ("plannedPickupAt" < "assignmentEndAt");
ALTER TABLE "BlockList" ADD CONSTRAINT "BlockList_not_self" CHECK ("blockerCompanyId" <> "blockedCompanyId");

-- ── Partial unique index'ler ──────────────────────────────────────────
-- Match başına aynı anda tek PENDING teklif.
CREATE UNIQUE INDEX "Offer_one_pending_per_match" ON "Offer" ("matchId") WHERE "status" = 'PENDING';
-- Aynı araç için aynı anda tek ACTIVE ilan.
CREATE UNIQUE INDEX "TruckPosting_one_active_per_vehicle" ON "TruckPosting" ("vehicleId")
  WHERE "status" = 'ACTIVE' AND "deletedAt" IS NULL;
-- Sevkiyat başına tek açık uyuşmazlık.
CREATE UNIQUE INDEX "Dispute_one_open_per_shipment" ON "Dispute" ("shipmentId") WHERE "status" = 'OPEN';

-- ── Çakışan atama kısıtları (#2) ──────────────────────────────────────
-- Araç, dorse ve şoför; aktif (teslim edilmemiş, iptal edilmemiş) sevkiyatlarda
-- [plannedPickupAt, assignmentEndAt) aralıkları çakışamaz.
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_vehicle_no_overlap" EXCLUDE USING gist (
  "vehicleId" WITH =,
  tstzrange("plannedPickupAt", "assignmentEndAt", '[)') WITH &&
) WHERE ("status" IN ('ASSIGNED', 'AT_PICKUP', 'LOADED', 'IN_TRANSIT', 'AT_DELIVERY'));

ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_trailer_no_overlap" EXCLUDE USING gist (
  "trailerId" WITH =,
  tstzrange("plannedPickupAt", "assignmentEndAt", '[)') WITH &&
) WHERE ("status" IN ('ASSIGNED', 'AT_PICKUP', 'LOADED', 'IN_TRANSIT', 'AT_DELIVERY'));

ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_driver_no_overlap" EXCLUDE USING gist (
  "driverId" WITH =,
  tstzrange("plannedPickupAt", "assignmentEndAt", '[)') WITH &&
) WHERE ("status" IN ('ASSIGNED', 'AT_PICKUP', 'LOADED', 'IN_TRANSIT', 'AT_DELIVERY'));

-- ── Append-only tablolar (#18, mali kayıt) ────────────────────────────
CREATE OR REPLACE FUNCTION logimatch_reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ShipmentEvent_append_only" BEFORE UPDATE OR DELETE ON "ShipmentEvent"
  FOR EACH ROW EXECUTE FUNCTION logimatch_reject_mutation();
CREATE TRIGGER "AuditLog_append_only" BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION logimatch_reject_mutation();

-- Mali kayıtlar silinemez (durum değişebilir, satır silinemez).
CREATE TRIGGER "Shipment_no_delete" BEFORE DELETE ON "Shipment"
  FOR EACH ROW EXECUTE FUNCTION logimatch_reject_mutation();
CREATE TRIGGER "Invoice_no_delete" BEFORE DELETE ON "Invoice"
  FOR EACH ROW EXECUTE FUNCTION logimatch_reject_mutation();
CREATE TRIGGER "Offer_no_delete" BEFORE DELETE ON "Offer"
  FOR EACH ROW EXECUTE FUNCTION logimatch_reject_mutation();
