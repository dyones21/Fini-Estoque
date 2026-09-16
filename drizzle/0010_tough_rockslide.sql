CREATE TABLE "supplier_product_links" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_cnpj" text NOT NULL,
	"supplier_product_code" text NOT NULL,
	"supplier_description" text DEFAULT '',
	"product_id" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "supplier_product_links_cnpj_code_unique" UNIQUE("supplier_cnpj","supplier_product_code")
);
--> statement-breakpoint
ALTER TABLE "supplier_product_links" ADD CONSTRAINT "supplier_product_links_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;