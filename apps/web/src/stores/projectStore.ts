import { create } from "zustand";
import type { Project, CreateProjectInput, CreateProjectFromGitHubInput } from "@dockpit/shared";
import { api } from "../lib/api";

interface ProjectStore {
  projects: Project[];
  loading: boolean;
  error: string | null;

  fetchProjects: () => Promise<void>;
  createProject: (input: CreateProjectInput) => Promise<Project>;
  createProjectFromGitHub: (input: CreateProjectFromGitHubInput) => Promise<Project>;
  deleteProject: (id: string) => Promise<void>;
  startContainer: (id: string) => Promise<void>;
  stopContainer: (id: string) => Promise<void>;
  restartContainer: (id: string) => Promise<void>;
  updateProjectStatus: (id: string, status: string) => void;
  updateProject: (project: Project) => void;
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  loading: false,
  error: null,

  fetchProjects: async () => {
    set({ loading: true, error: null });
    try {
      const projects = await api.projects.list();
      set({ projects, loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  createProject: async (input) => {
    const project = await api.projects.create(input);
    set((s) => ({ projects: [project, ...s.projects] }));
    return project;
  },

  createProjectFromGitHub: async (input) => {
    const project = await api.projects.createFromGitHub(input);
    set((s) => ({ projects: [project, ...s.projects] }));
    return project;
  },

  deleteProject: async (id) => {
    await api.projects.delete(id);
    set((s) => ({ projects: s.projects.filter((p) => p.id !== id) }));
  },

  startContainer: async (id) => {
    const updated = await api.containers.start(id);
    set((s) => ({
      projects: s.projects.map((p) => (p.id === id ? updated : p)),
    }));
  },

  stopContainer: async (id) => {
    const updated = await api.containers.stop(id);
    set((s) => ({
      projects: s.projects.map((p) => (p.id === id ? updated : p)),
    }));
  },

  restartContainer: async (id) => {
    const updated = await api.containers.restart(id);
    set((s) => ({
      projects: s.projects.map((p) => (p.id === id ? updated : p)),
    }));
  },

  updateProjectStatus: (id, status) => {
    set((s) => ({
      projects: s.projects.map((p) =>
        p.id === id ? { ...p, containerStatus: status } : p
      ),
    }));
  },

  updateProject: (project) => {
    set((s) => ({
      projects: s.projects.map((p) => (p.id === project.id ? project : p)),
    }));
  },
}));
