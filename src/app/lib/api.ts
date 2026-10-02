export const clearChatHistory = async () => {
  const response = await fetch("/api/chat", { method: "DELETE" });
  if (!response.ok) throw new Error("Error clearing chat history");
};
