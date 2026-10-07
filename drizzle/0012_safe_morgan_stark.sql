CREATE TABLE "payable_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"payable_id" text NOT NULL,
	"payment_date" text NOT NULL,
	"amount_paid" double precision NOT NULL,
	"discount" double precision DEFAULT 0 NOT NULL,
	"interest" double precision DEFAULT 0 NOT NULL,
	"payment_method" text NOT NULL,
	"notes" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payables" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_id" text,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"document_number" text,
	"issue_date" text,
	"due_date" text NOT NULL,
	"original_amount" double precision NOT NULL,
	"paid_amount" double precision DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"nf_entry_id" text,
	"notes" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"cnpj" text,
	"phone" text,
	"email" text,
	"address" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "can_manage_payables" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "payable_payments" ADD CONSTRAINT "payable_payments_payable_id_payables_id_fk" FOREIGN KEY ("payable_id") REFERENCES "public"."payables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payables" ADD CONSTRAINT "payables_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payables" ADD CONSTRAINT "payables_nf_entry_id_nf_entries_id_fk" FOREIGN KEY ("nf_entry_id") REFERENCES "public"."nf_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_cnpj_unique_idx" ON "suppliers" USING btree ("cnpj") WHERE "suppliers"."cnpj" != '' AND "suppliers"."cnpj" IS NOT NULL;