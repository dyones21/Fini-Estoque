CREATE TABLE IF NOT EXISTS "roles" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_system_role" boolean DEFAULT false NOT NULL,
	"can_view_dashboard" boolean DEFAULT false NOT NULL,
	"can_view_stock" boolean DEFAULT false NOT NULL,
	"can_manage_products" boolean DEFAULT false NOT NULL,
	"can_add_nf_entries" boolean DEFAULT false NOT NULL,
	"can_delete_nf_entries" boolean DEFAULT false NOT NULL,
	"can_transfer_stock" boolean DEFAULT false NOT NULL,
	"can_register_movements" boolean DEFAULT false NOT NULL,
	"can_manage_users" boolean DEFAULT false NOT NULL,
	"can_manage_backup" boolean DEFAULT false NOT NULL,
	"can_manage_company" boolean DEFAULT false NOT NULL,
	"can_wipe_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role_id" text;--> statement-breakpoint
INSERT INTO "roles" (
  "id", "name", "is_system_role", "can_view_dashboard", "can_view_stock", "can_manage_products",
  "can_add_nf_entries", "can_delete_nf_entries", "can_transfer_stock", "can_register_movements",
  "can_manage_users", "can_manage_backup", "can_manage_company", "can_wipe_system"
) VALUES
  ('role_admin', 'Administrador', true, true, true, true, true, true, true, true, true, true, true, true),
  ('role_gerente_loja', 'Gerente de Loja', false, true, true, true, true, false, true, true, false, true, false, false),
  ('role_caixa', 'Caixa / Vendas', false, false, true, false, false, false, false, true, false, false, false, false),
  ('role_operador_deposito', 'Operador Depósito/Loja', false, false, true, true, false, false, true, true, false, false, false, false),
  ('role_auditor', 'Auditor', false, true, true, false, false, false, false, false, false, false, false, false)
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;