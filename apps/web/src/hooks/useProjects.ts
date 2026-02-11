import { useEffect } from "react";
import { useProjectStore } from "../stores/projectStore";

export function useProjects() {
  const { projects, loading, error, fetchProjects } = useProjectStore();

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  return { projects, loading, error, refetch: fetchProjects };
}
