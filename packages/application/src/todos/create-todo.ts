import type { ITodoRepository } from "@diagram-tool/domain/repositories";
import type { CreateTodo, TodoBase } from "@diagram-tool/domain/schemas";

export async function createTodo(
  repository: ITodoRepository,
  data: CreateTodo,
  userId: string,
): Promise<TodoBase> {
  return repository.create({ ...data, userId });
}
