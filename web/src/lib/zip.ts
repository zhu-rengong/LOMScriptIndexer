import { strToU8, zip } from "fflate";
import type { AsyncZippable } from "fflate";

export type ZipTextFile = { name: string; content: string };

export const zipTextFiles = async (files: ZipTextFile[]): Promise<Blob> => {
  const data: AsyncZippable = {};
  for (const file of files) data[file.name] = strToU8(file.content);
  const zipped = await new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => {
    zip(data, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
  return new Blob([zipped], { type: "application/zip" });
};
