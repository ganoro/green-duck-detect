import { Ollama } from 'ollama';
import sharp from 'sharp';
import fs from 'fs/promises';
import fsR from 'fs';
import axios from 'axios';

async function downloadFileAxios(fileURL: string, savePath: string): Promise<string> {
  try {
    const response = await axios({
      method: 'GET',
      url: fileURL,
      responseType: 'stream',
    });

    if (response.status !== 200) {
      throw new Error(`Failed to download file (Axios). Status code: ${response.status}`);
    }

    const writer = fsR.createWriteStream(savePath);
    response.data.pipe(writer);

    return new Promise<string>((resolve, reject) => {
      writer.on('finish', () => {
        console.log(`Successfully downloaded (Axios) to: ${savePath}`);
        resolve(savePath);
      });
      writer.on('error', (err) => {
        fs.unlink(savePath).catch(() => {});
        reject(new Error(`Error writing file (Axios): ${err.message}`));
      });
    });
  } catch (error: any) {
    console.error(`Error downloading file (Axios) from ${fileURL}: ${error.message}`);
    throw error;
  }
}

async function resizeImage(inputPath: string, maxSize: number = 1024): Promise<string> {
  const outputPath = inputPath.replace(/(\.\w+)$/, '_resized$1');
  try {
    const image = sharp(inputPath);
    const metadata = await image.metadata();

    if (metadata.width && metadata.height && (metadata.width > maxSize || metadata.height > maxSize)) {
      await image.resize({
        width: maxSize,
        height: maxSize,
        fit: 'inside',
        withoutEnlargement: true,
      }).toFile(outputPath);
      console.log(`Resized image saved to ${outputPath}`);
      return outputPath;
    } else {
      console.log('Image is already small enough, no resize needed.');
      return inputPath; // no resizing needed
    }
  } catch (error) {
    console.error('Error resizing image:', error);
    throw error;
  }
}

// Initialize the Ollama client
const ollama = new Ollama({});

async function analyzeImage(imagePaths: string[], question: string) {
  try {
    const prompt = `Given the attached images answer the following question: ${question}`;
    console.log(`Starting prompt: ${prompt}`);

    const response = await ollama.generate({
      model: 'gemma3:27b',
      prompt: prompt,
      images: imagePaths,
      stream: false,
    });

    const answer = response.response;
    console.log(`Answer: ${answer}`);
    return answer;
  } catch (error) {
    console.error('Error processing image:', error);
    throw error;
  }
}

export async function myAgent(context: any, events: any) {
  events.emitEventCreated({
    data: {
      message: `myAgent started`,
      params: context.params,
      webhookGroups: context.webhookGroups,
      agentId: context.agentId,
      queryId: context.queryId,
    },
    queryId: context.queryId,
  });

  const params = context.params;
  const filenames = params.filename;
  const specificQuestion = params.specificQuestion;

  let tempPaths: string[] = [];
  let resizedImagePaths: string[] = [];

  try {
    const filenameArray = filenames.split(','); // Split the comma-separated string into an array
    
    // Process each filename
    for (const filename of filenameArray) {
      const trimmedFilename = filename.trim(); // remove whitespace
      const originalImagePath = `/tmp/${Date.now()}_${trimmedFilename.replace(/[^a-zA-Z0-9.]/g, '_')}`; // Sanitize filename
      const downloadedImagePath = await downloadFileAxios(trimmedFilename, originalImagePath);
      tempPaths.push(downloadedImagePath);

      const resizedImagePath = await resizeImage(downloadedImagePath, 1024);
      resizedImagePaths.push(resizedImagePath);
      if (resizedImagePath !== downloadedImagePath) {
        tempPaths.push(resizedImagePath);
      }
    }

    const answer = await analyzeImage(resizedImagePaths, specificQuestion);

    events.emitQueryCompleted({
      data: {
        message: answer,
        params: context.params,
        webhookGroups: context.webhookGroups,
        agentId: context.agentId,
        queryId: context.queryId,
      },
      queryId: context.queryId,
    });

  } catch (err) {
    console.warn('Agent failed:', err);
  } finally {
    // cleanup any temp files created
    await Promise.all(tempPaths.map(p => fs.unlink(p).catch(() => {})));
  }
}