import { createServerFn } from "@tanstack/react-start";
import type { ApiResponse } from "@diagram-tool/domain/types";
import type { TodoBase } from "@diagram-tool/domain/schemas";
import { createTodoSchema } from "@diagram-tool/domain/schemas";
import { createDatabaseClient } from "@diagram-tool/infra-db/client";
import { TodoRepository } from "@diagram-tool/infra-db/repositories";
import { getAuthSession } from "@/lib/auth/get-auth-session";
import { env } from "@/env/server";

export const createTodo = createServerFn({ method: "POST" })
  .inputValidator((input: { title: string }) => createTodoSchema.parse(input))
  .handler(async (ctx): Promise<ApiResponse<TodoBase>> => {
    const session = await getAuthSession();

    if (!session) {
      return { data: null, error: { message: "Unauthorized" } };
    }

    const db = createDatabaseClient(env.DATABASE_URL);
    const repo = new TodoRepository(db);
    const todo = await repo.create({ title: ctx.data.title, userId: session.user.id });

    return { data: todo, error: null };
  });
