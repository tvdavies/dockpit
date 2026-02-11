import Docker from "dockerode";

let docker: Docker;

const NETWORK_NAME = "dockpit-net";

export function getDocker(): Docker {
  if (!docker) {
    throw new Error("Docker client not initialized. Call initDockerClient() first.");
  }
  return docker;
}

export async function initDockerClient(): Promise<void> {
  docker = new Docker({ socketPath: "/var/run/docker.sock" });

  // Verify Docker is reachable
  try {
    await docker.ping();
    console.log("Docker connected");
  } catch (e) {
    console.error("Failed to connect to Docker:", e);
    throw new Error("Cannot connect to Docker. Is Docker running?");
  }

  // Ensure dockpit-net network exists
  await ensureNetwork();
}

async function ensureNetwork(): Promise<void> {
  const networks = await docker.listNetworks({
    filters: { name: [NETWORK_NAME] },
  });

  const existing = networks.find((n) => n.Name === NETWORK_NAME);
  if (!existing) {
    await docker.createNetwork({
      Name: NETWORK_NAME,
      Driver: "bridge",
      Labels: { "dockpit.managed": "true" },
    });
    console.log(`Created Docker network: ${NETWORK_NAME}`);
  } else {
    console.log(`Docker network ${NETWORK_NAME} already exists`);
  }
}

export { NETWORK_NAME };
