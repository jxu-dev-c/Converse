import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { Markdown } from "./Markdown";
it("renders stored markdown safely on the server without a browser DOM", () => {
  expect(() => renderToString(createElement(Markdown, { content: "Stored answer [1] <script>alert(1)</script>" }))).not.toThrow();
  expect(renderToString(createElement(Markdown, { content: "<script>alert(1)</script>" }))).not.toContain("<script>");
});
