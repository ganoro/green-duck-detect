import { Ollama } from "ollama";
import sharp from "sharp";
import fs from "fs/promises";
import fsR from "fs";
import axios from "axios";

const ollama = new Ollama({});

// Download a file from a URL and save it to a specified path
const downloadFile = async (url: string, path: string): Promise<string> => {
  const res = await axios({ method: "GET", url, responseType: "stream" });
  if (res.status !== 200) throw new Error(`Download failed: ${res.status}`);
  const writer = fsR.createWriteStream(path);
  res.data.pipe(writer);
  return new Promise((resolve, reject) => {
    writer.on("finish", () => resolve(path));
    writer.on("error", (err) => {
      fs.unlink(path).catch(() => {});
      reject(err);
    });
  });
};

// Resize an image to a maximum width or height while maintaining aspect ratio
const resizeImage = async (path: string, max = 1024): Promise<string> => {
  const outPath = path.replace(/(\.\w+)$/, "_resized$1");
  const img = sharp(path);
  const { width, height } = await img.metadata();
  if (width! > max || height! > max) {
    await img.resize({ width: max, height: max, fit: "inside" }).toFile(outPath);
    return outPath;
  }
  return path;
};

// Analyze images using the Gemma3 model and a specific question
const analyzeImage = async (images: string[], question: string) => {
  const res = await ollama.generate({
    model: "gemma3:27b",
    prompt: `Given the attached images answer the following question: ${question}`,
    images,
    stream: false,
  });
  return res.response;
};

// Main agent function
export async function myAgent(context: any, events: any) {
  events.emitEventCreated({
    data: { ...context, message: "myAgent started" },
    queryId: context.queryId,
  });

  const { filename, specificQuestion } = context.params;
  const urls = filename.split(",");
  const tempFiles: string[] = [];
  const resized: string[] = [];

  try {
    for (let i = 0; i < urls.length; i++) {
      const rawPath = `/tmp/${Date.now()}_img${i}.jpg`;
      const dl = await downloadFile(urls[i], rawPath);
      tempFiles.push(dl);
      const rs = await resizeImage(dl);
      if (rs !== dl) tempFiles.push(rs);
      resized.push(rs);
    }

    const answer = await analyzeImage(resized, specificQuestion);

    events.emitQueryCompleted({
      data: { ...context, message: answer },
      queryId: context.queryId,
    });
  } catch (err) {
    console.warn("Agent failed:", err);
  } finally {
    await Promise.all(tempFiles.map(p => fs.unlink(p).catch(() => {})));
  }
}
