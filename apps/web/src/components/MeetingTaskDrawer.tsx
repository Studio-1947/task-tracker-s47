import { TaskDrawer } from './TaskDrawer';
import { useQueryClient } from '@tanstack/react-query';
import { useWorkspaceMembers } from '../hooks/useTasks';
import { useLabels } from '../hooks/useLabels';

/** Opens the identical detailed task drawer used on workspace boards. */
export function MeetingTaskDrawer({
  workspaceId,
  taskId,
  onClose,
  onOpenTask,
}: {
  workspaceId: string;
  taskId: string;
  onClose: () => void;
  onOpenTask: (taskId: string) => void;
}) {
  const queryClient = useQueryClient();
  const { data: members } = useWorkspaceMembers(workspaceId);
  const { data: labels } = useLabels(workspaceId);
  const close = () => {
    void queryClient.invalidateQueries({ queryKey: ['meeting-board'] });
    onClose();
  };

  return (
    <TaskDrawer
      workspaceId={workspaceId}
      taskId={taskId}
      members={members ?? []}
      labels={labels ?? []}
      onClose={close}
      onOpenTask={onOpenTask}
    />
  );
}
