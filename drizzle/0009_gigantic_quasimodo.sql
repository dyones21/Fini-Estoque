ALTER TABLE "categories" ADD CONSTRAINT "categories_name_unique" UNIQUE("name");--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_name_unique" UNIQUE("name");