import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const wishes = sqliteTable("wishes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  message: text("message").notNull(),
  createdAt: text("created_at").notNull(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
