ALTER TABLE "categories" DROP CONSTRAINT IF EXISTS "categories_name_unique";--> statement-breakpoint
ALTER TABLE "roles" DROP CONSTRAINT IF EXISTS "roles_name_unique";--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "previous_quantity" integer;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "loss_category" text;