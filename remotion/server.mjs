import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";

const PORT = 3111;
const HOST = "127.0.0.1";
const ROOT_TIMELINE_URL = new URL("../timeline.json", import.meta.url);
const PUBLIC_TIMELINE_URL = new URL("./public/timeline.json", import.meta.url);
const ALLOWED_ORIGIN_PATTERN = /^https?:\/\/localhost(?::\d+)?$/;

const sendJson = (response, statusCode, body, origin) => {
  const headers = {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
  };

  if (origin && ALLOWED_ORIGIN_PATTERN.test(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers.Vary = "Origin";
  }

  response.writeHead(statusCode, headers);
  response.end(JSON.stringify(body, null, 2));
};

const sendNoContent = (response, statusCode, origin) => {
  const headers = {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  };

  if (origin && ALLOWED_ORIGIN_PATTERN.test(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers.Vary = "Origin";
  }

  response.writeHead(statusCode, headers);
  response.end();
};

const readTimeline = async () => {
  const contents = await readFile(ROOT_TIMELINE_URL, "utf8");
  return JSON.parse(contents);
};

const writeTimeline = async (timeline) => {
  const contents = `${JSON.stringify(timeline, null, 2)}\n`;
  await writeFile(ROOT_TIMELINE_URL, contents, "utf8");
  await writeFile(PUBLIC_TIMELINE_URL, contents, "utf8");
};

const hasTimelineShape = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.hasOwn(value, "output") && Object.hasOwn(value, "clips");
};

const server = createServer(async (request, response) => {
  const origin = request.headers.origin;
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (request.method === "OPTIONS" && url.pathname === "/api/timeline") {
    sendNoContent(response, 204, origin);
    return;
  }

  if (url.pathname !== "/api/timeline") {
    sendJson(response, 404, { error: "Not found" }, origin);
    return;
  }

  try {
    if (request.method === "GET") {
      const timeline = await readTimeline();
      sendJson(response, 200, timeline, origin);
      return;
    }

    if (request.method === "POST") {
      let body = "";

      for await (const chunk of request) {
        body += chunk;
      }

      const parsed = JSON.parse(body || "{}");
      if (!hasTimelineShape(parsed)) {
        sendJson(response, 400, { error: "Timeline body must include output and clips." }, origin);
        return;
      }

      await writeTimeline(parsed);
      sendJson(response, 200, parsed, origin);
      return;
    }

    sendJson(response, 405, { error: "Method not allowed" }, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    sendJson(response, 500, { error: message }, origin);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Timeline sidecar listening on http://localhost:${PORT}`);
});
