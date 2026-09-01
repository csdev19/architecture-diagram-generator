import type { ITodoRepository } from "@diagram-tool/domain/repositories";
import type { UpdateTodo, TodoBase } from "@diagram-tool/domain/schemas";

export async function updateTodo(
  repository: ITodoRepository,
  id: string,
  userId: string,
  data: UpdateTodo,
): Promise<TodoBase | null> {
  return repository.update(id, userId, data);
}
