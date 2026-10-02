export async function renameChat(id: string, title: string) {
  const response = await fetch(`/api/chat/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) });
  if (!response.ok) throw new Error("Unable to rename chat");
}
export async function deleteChat(id: string) {
  const response = await fetch(`/api/chat/${id}`, { method: "DELETE" });
  if (!response.ok) throw new Error(response.status === 409 ? "Chat is streaming" : "Unable to delete chat");
}
