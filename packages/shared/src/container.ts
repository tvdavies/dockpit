export type ContainerStatus =
  | "created"
  | "running"
  | "paused"
  | "restarting"
  | "removing"
  | "exited"
  | "dead"
  | "not_created";

export interface ContainerInfo {
  id: string;
  status: ContainerStatus;
  ip: string | null;
  startedAt: string | null;
}

export interface PortMapping {
  containerPort: number;
  detectedFrom: "manual" | "log_scan" | "ss_probe";
}
