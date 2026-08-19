CREATE TABLE "nf_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"number_nf" text NOT NULL,
	"access_key" text DEFAULT '',
	"supplier" text NOT NULL,
	"cnpj_supplier" text NOT NULL,
	"issue_date" text NOT NULL,
	"total_value" double precision NOT NULL,
	"notes" text DEFAULT '',
	"created_by" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nf_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"nf_id" text NOT NULL,
	"product_id" text NOT NULL,
	"product_name" text NOT NULL,
	"quantity" integer NOT NULL,
	"cost_price" double precision NOT NULL,
	"total_cost" double precision NOT NULL,
	"batch_number" text NOT NULL,
	"expiration_date" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"sku" text NOT NULL,
	"ean" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"unit" text NOT NULL,
	"stock_deposito" integer DEFAULT 0 NOT NULL,
	"stock_loja" integer DEFAULT 0 NOT NULL,
	"min_stock_deposito" integer DEFAULT 10 NOT NULL,
	"min_stock_loja" integer DEFAULT 5 NOT NULL,
	"cost_price" double precision DEFAULT 0 NOT NULL,
	"sell_price" double precision DEFAULT 0 NOT NULL,
	"expiration_date" text NOT NULL,
	"batch_number" text NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"product_name" text NOT NULL,
	"type" text NOT NULL,
	"origin" text NOT NULL,
	"destination" text NOT NULL,
	"quantity" integer NOT NULL,
	"batch_number" text NOT NULL,
	"reason" text NOT NULL,
	"created_by" text NOT NULL,
	"timestamp" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_sales" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"product_name" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" double precision NOT NULL,
	"total_amount" double precision NOT NULL,
	"payment_method" text NOT NULL,
	"seller_name" text NOT NULL,
	"timestamp" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"uid" text NOT NULL,
	"email" text NOT NULL,
	"name" text DEFAULT 'Usuário Fini',
	"role" text DEFAULT 'Operador Depósito/Loja',
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "users_uid_unique" UNIQUE("uid")
);
--> statement-breakpoint
ALTER TABLE "nf_items" ADD CONSTRAINT "nf_items_nf_id_nf_entries_id_fk" FOREIGN KEY ("nf_id") REFERENCES "public"."nf_entries"("id") ON DELETE cascade ON UPDATE no action;