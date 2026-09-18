import{sqliteTable,text,integer,index}from"drizzle-orm/sqlite-core";
export const intakes=sqliteTable("intakes",{id:text("id").primaryKey(),company:text("company").notNull(),email:text("email").notNull(),application:text("application").notNull(),message:text("message").notNull(),createdAt:integer("created_at").notNull(),ipHash:text("ip_hash").notNull(),deliveryStatus:text("delivery_status").notNull().default("pending")},t=>[index("intakes_created_at_idx").on(t.createdAt),index("intakes_ip_time_idx").on(t.ipHash,t.createdAt)]);

