ALTER TABLE "nf_items" ADD COLUMN "freight_allocated" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "nf_items" ADD COLUMN "insurance_allocated" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "nf_items" ADD COLUMN "other_expenses_allocated" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "nf_items" ADD COLUMN "discount_allocated" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "nf_items" ADD COLUMN "icms_st_allocated" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "nf_items" ADD COLUMN "ipi_allocated" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "nf_items" ADD COLUMN "ii_allocated" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "nf_items" ADD COLUMN "difal_allocated" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "nf_items" ADD COLUMN "recoverable_taxes_allocated" double precision DEFAULT 0 NOT NULL;