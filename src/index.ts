import { Ollama } from 'ollama';
import sharp from 'sharp';
import path from 'path';
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
  
// Initialize the Ollama client
const ollama = new Ollama({
});

async function analyzeImage(imagePath: string, question: string) {
  try {
    const prompt = `Given the attached images answer the following question: ${question}`;

    console.log(`Starting prompt: ${prompt}`);

    const response = await ollama.generate({
      model: 'gemma3:27b',
      prompt: prompt,
      images: [ imagePath ],
      stream: false,
    });

    const answer = response.response;
    console.log(`Answer: ${answer}`);
    return answer;
  } catch (error) {
    console.error('Error processing image:', error);
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
    const filename = params.filename; // URL of the image
    const specificQuestion = params.specificQuestion; // The question to ask about the image

    try {
        const imageFilePath = await downloadFileAxios(
          filename,
          `/tmp/${Date.now()}_image.jpg`
        );
        console.log(`Dummy image created at ${imageFilePath}`);
        
        const answer = await analyzeImage(imageFilePath, specificQuestion);
        
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

        // cleanup image
        fs.unlink(imageFilePath).catch(() => {});


    } catch (err) {
        console.warn('Could not create dummy image (may already exist or permissions issue).');
    }

}
