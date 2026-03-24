import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { defineConfig } from "vite";
import type { Plugin, ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import { validateSerializedConfig } from "../shared/serialize";

const projectRoot = path.resolve(__dirname, "..");
const timelineFile = path.join(projectRoot, "timeline.json");
const assetRegistryFile = path.join(projectRoot, "asset-registry.json");

const contentTypes: Record<string, string> = {
  ".aac": "audio/aac",
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".json": "application/json; charset=utf-8",
  ".m4a": "audio/mp4",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wav": "audio/wav",
  ".webm": "video/webm",
  ".yaml": "text/yaml; charset=utf-8",
};

const getContentType = (filePath: string): string => {
  return contentTypes[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
};

const readJsonFile = <T,>(filePath: string): T => {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
};

const writeJsonFile = (filePath: string, value: unknown): void => {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
};

const readAssetProfile = (profilePath: string): Record<string, unknown> => {
  const json = execFileSync(
    "python3",
    [
      "-c",
      "import json, pathlib, sys, yaml; print(json.dumps(yaml.safe_load(pathlib.Path(sys.argv[1]).read_text())))",
      profilePath,
    ],
    {
      cwd: projectRoot,
      encoding: "utf-8",
    },
  );
  return JSON.parse(json) as Record<string, unknown>;
};

const assetKeyFromFilename = (filename: string): string => {
  return filename
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
};

const sendJson = (res: NodeJS.WritableStream & { setHeader: (name: string, value: string) => void }, body: unknown) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
};

const readRequestBody = async (req: NodeJS.ReadableStream): Promise<string> => {
  let body = "";
  for await (const chunk of req) {
    body += Buffer.isBuffer(chunk) ? chunk.toString("utf-8") : String(chunk);
  }
  return body;
};

const serveProjectFile = (urlPath: string, req: Parameters<ViteDevServer["middlewares"]["handle"]>[0], res: Parameters<ViteDevServer["middlewares"]["handle"]>[1]): boolean => {
  if (!req.url?.startsWith(urlPath)) {
    return false;
  }

  const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const resolvedPath = path.resolve(projectRoot, `.${pathname}`);
  if (!resolvedPath.startsWith(projectRoot)) {
    res.statusCode = 400;
    res.end("Invalid path");
    return true;
  }

  if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
    res.statusCode = 404;
    res.end("Not found");
    return true;
  }

  const stat = fs.statSync(resolvedPath);
  const fileSize = stat.size;
  const contentType = getContentType(resolvedPath);
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;

    res.statusCode = 206;
    res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Length", chunkSize);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "no-store");
    fs.createReadStream(resolvedPath, { start, end }).pipe(res);
  } else {
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", fileSize);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "no-store");
    fs.createReadStream(resolvedPath).pipe(res);
  }
  return true;
};

function timelineApiPlugin(): Plugin {
  return {
    name: "timeline-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (
          serveProjectFile("/inputs/", req, res) ||
          serveProjectFile("/output/", req, res) ||
          serveProjectFile("/asset_profiles/", req, res)
        ) {
          return;
        }

        next();
      });

      server.middlewares.use("/api/timeline", (req, res) => {
        if (req.method !== "GET") {
          res.statusCode = 405;
          res.end("Method not allowed");
          return;
        }

        try {
          sendJson(res, readJsonFile(timelineFile));
        } catch (error) {
          res.statusCode = 500;
          res.end(String(error));
        }
      });

      server.middlewares.use("/api/asset-registry", (req, res) => {
        if (req.method !== "GET") {
          res.statusCode = 405;
          res.end("Method not allowed");
          return;
        }

        try {
          sendJson(res, readJsonFile(assetRegistryFile));
        } catch (error) {
          res.statusCode = 500;
          res.end(String(error));
        }
      });

      server.middlewares.use("/api/save-timeline", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("Method not allowed");
          return;
        }

        try {
          const parsed = JSON.parse(await readRequestBody(req));
          validateSerializedConfig(parsed);
          writeJsonFile(timelineFile, parsed);
          sendJson(res, { ok: true });
        } catch (error) {
          res.statusCode = 500;
          sendJson(res, { error: String(error) });
        }
      });

      server.middlewares.use("/api/waveform", (req, res) => {
        if (req.method !== "GET") {
          res.statusCode = 405;
          res.end();
          return;
        }

        const asset = (req.url?.split("?asset=")[1] || "").split("&")[0];
        if (!asset) {
          res.statusCode = 400;
          res.end("asset required");
          return;
        }

        const profilePath = path.join(projectRoot, "asset_profiles", `${asset}.yaml`);
        if (!fs.existsSync(profilePath)) {
          res.statusCode = 404;
          res.end("not found");
          return;
        }

        try {
          const profile = readAssetProfile(profilePath);
          const transcript = profile.transcript as { words?: unknown[] } | undefined;
          if (profile.silence_regions) {
            sendJson(res, {
              asset,
              duration: profile.duration_s,
              silence: profile.silence_regions,
              transcript: transcript?.words ?? [],
            });
            return;
          }

          res.statusCode = 400;
          res.end("not an audio asset");
        } catch (error) {
          res.statusCode = 500;
          res.end(String(error));
        }
      });

      server.middlewares.use("/api/asset-profile", (req, res) => {
        if (req.method !== "GET") {
          res.statusCode = 405;
          res.end();
          return;
        }

        const asset = (req.url?.split("?asset=")[1] || "").split("&")[0];
        if (!asset) {
          res.statusCode = 400;
          res.end("asset required");
          return;
        }

        const profilePath = path.join(projectRoot, "asset_profiles", `${asset}.yaml`);
        if (!fs.existsSync(profilePath)) {
          res.statusCode = 404;
          res.end("not found");
          return;
        }

        try {
          sendJson(res, readAssetProfile(profilePath));
        } catch (error) {
          res.statusCode = 500;
          res.end(String(error));
        }
      });

      server.middlewares.use("/api/upload", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("Method not allowed");
          return;
        }

        const filename = decodeURIComponent(String(req.headers["x-filename"] ?? ""));
        if (!filename || filename.includes("..") || filename.includes("/")) {
          res.statusCode = 400;
          sendJson(res, { error: "Invalid filename" });
          return;
        }

        const inputsDir = path.join(projectRoot, "inputs");
        const relativePath = `inputs/${filename}`;
        const destinationPath = path.join(inputsDir, filename);
        const chunks: Buffer[] = [];

        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => {
          try {
            fs.writeFileSync(destinationPath, Buffer.concat(chunks));
          } catch (error) {
            res.statusCode = 500;
            sendJson(res, { error: String(error) });
            return;
          }

          const proc = spawn("python3", ["tools/ingest.py", relativePath], {
            cwd: projectRoot,
            stdio: ["ignore", "pipe", "pipe"],
          });

          let stdout = "";
          let stderr = "";
          proc.stdout.on("data", (chunk: Buffer) => {
            stdout += chunk.toString("utf-8");
          });
          proc.stderr.on("data", (chunk: Buffer) => {
            stderr += chunk.toString("utf-8");
          });
          proc.on("close", (code) => {
            if (code !== 0) {
              res.statusCode = 500;
              sendJson(res, { error: stderr || stdout || `Ingest failed with exit code ${code}` });
              return;
            }

            sendJson(res, {
              ok: true,
              assetKey: assetKeyFromFilename(filename),
              path: relativePath,
            });
          });
        });
      });

      const thumbDir = path.join(projectRoot, ".thumbs");
      server.middlewares.use("/media/thumb/", (req, res) => {
        if (req.method !== "GET") {
          res.statusCode = 405;
          res.end();
          return;
        }

        const relPath = decodeURIComponent((req.url || "").replace(/^\//, ""));
        if (!relPath || relPath.includes("..")) {
          res.statusCode = 400;
          res.end();
          return;
        }

        const sourcePath = path.join(projectRoot, relPath);
        const thumbPath = path.join(thumbDir, relPath.replace(/\.[^.]+$/, ".jpg"));

        if (!fs.existsSync(sourcePath)) {
          res.statusCode = 404;
          res.end("not found");
          return;
        }

        try {
          if (fs.existsSync(thumbPath) && fs.statSync(thumbPath).mtimeMs >= fs.statSync(sourcePath).mtimeMs) {
            res.setHeader("Content-Type", "image/jpeg");
            res.setHeader("Cache-Control", "public, max-age=3600");
            res.end(fs.readFileSync(thumbPath));
            return;
          }
        } catch {
          // Ignore cache probe failures and regenerate below.
        }

        try {
          fs.mkdirSync(path.dirname(thumbPath), { recursive: true });
          execFileSync(
            "ffmpeg",
            ["-i", sourcePath, "-vf", "scale=400:-1", "-q:v", "5", "-y", thumbPath],
            { stdio: "ignore" },
          );
          res.setHeader("Content-Type", "image/jpeg");
          res.setHeader("Cache-Control", "public, max-age=3600");
          res.end(fs.readFileSync(thumbPath));
        } catch {
          res.statusCode = 500;
          res.end("thumbnail generation failed");
        }
      });

      server.middlewares.use("/api/render", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("Method not allowed");
          return;
        }

        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        const send = (event: string, data: string) => {
          res.write(`event: ${event}\ndata: ${data}\n\n`);
        };

        send("status", "Rendering preview...");

        const proc = spawn("python3", ["tools/render.py", "--preview"], {
          cwd: projectRoot,
          stdio: ["ignore", "pipe", "pipe"],
        });

        proc.stdout.on("data", (chunk: Buffer) => {
          send("log", chunk.toString().trim());
        });

        proc.stderr.on("data", (chunk: Buffer) => {
          send("log", chunk.toString().trim());
        });

        proc.on("close", (code) => {
          if (code === 0) {
            send("done", "Render complete");
          } else {
            send("error", `Render failed (exit code ${code})`);
          }
          res.end();
        });

        proc.on("error", (error) => {
          send("error", String(error));
          res.end();
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), timelineApiPlugin()],
  resolve: {
    extensions: [".mjs", ".js", ".mts", ".ts", ".jsx", ".tsx", ".json"],
    alias: {
      "@project": projectRoot,
      "@shared": path.resolve(projectRoot, "shared"),
      react: path.resolve(__dirname, "node_modules/react"),
      "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
      "react/jsx-runtime": path.resolve(__dirname, "node_modules/react/jsx-runtime.js"),
      "react/jsx-dev-runtime": path.resolve(__dirname, "node_modules/react/jsx-dev-runtime.js"),
      remotion: path.resolve(__dirname, "node_modules/remotion"),
      "@remotion/player": path.resolve(__dirname, "node_modules/@remotion/player"),
    },
  },
  server: {
    fs: {
      allow: [projectRoot],
    },
    proxy: {
      "/media": {
        target: "http://localhost:5173",
        rewrite: (requestPath) => "/@fs" + path.join(projectRoot, requestPath.replace(/^\/media/, "")),
      },
    },
  },
});
