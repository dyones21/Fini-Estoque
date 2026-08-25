CREATE TABLE "company_info" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"trade_name" text DEFAULT '',
	"cnpj" text NOT NULL,
	"address" text DEFAULT '',
	"city" text NOT NULL,
	"state" text NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
