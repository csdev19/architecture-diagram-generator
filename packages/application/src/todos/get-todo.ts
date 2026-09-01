import type { ITodoRepository } from "@diagram-tool/domain/repositories";
import type { TodoBase } from "@diagram-tool/domain/schemas";

export async function getTodo(
  repository: ITodoRepository,
  id: string,
  userId: string,
): Promise<TodoBase | null> {
  return repository.findById(id, userId);
}
