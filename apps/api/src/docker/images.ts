import { getDocker } from "./client";
import { resolve } from "path";

const IMAGE_NAME = "dockpit-devenv:latest";
const DOCKER_DIR = resolve(import.meta.dir, "../../../../docker");

export async function imageExists(): Promise<boolean> {
  const docker = getDocker();
  const images = await docker.listImages({
    filters: { reference: [IMAGE_NAME] },
  });
  return images.length > 0;
}

export async function buildImage(): Promise<void> {
  const docker = getDocker();
  console.log("Building dockpit-devenv image...");
  const stream = await docker.buildImage(
    { context: DOCKER_DIR, src: ["Dockerfile.devenv"] },
    { t: IMAGE_NAME }
  );
  await new Promise<void>((resolve, reject) => {
    docker.modem.followProgress(stream, (err: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });
  console.log("Image built:", IMAGE_NAME);
}
