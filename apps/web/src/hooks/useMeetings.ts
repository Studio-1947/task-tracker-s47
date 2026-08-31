import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  BoardItem,
  BoardMood,
  BoardNote,
  CreateBoardItemInput,
  CreateBoardNoteInput,
  MeetingBoardDetail,
  MeetingProjectOption,
  MeetingWeekSummary,
  ReorderBoardItemsInput,
  SetMoodInput,
  UpdateBoardItemInput,
  UpdateBoardNoteInput,
  UpdateMeetingBoardInput,
} from '@task-tracker/shared';
import { http } from '../lib/api';

/** All board queries hang off this prefix so one helper can refresh the page. */
const boardKey = (weekStart: string) => ['meeting-board', weekStart] as const;

function invalidateBoards(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: ['meeting-board'] });
  void qc.invalidateQueries({ queryKey: ['meeting-weeks'] });
}

/**
 * The whole week in one request. `weekStart` may be any date inside the week —
 * the API normalises it to that week's Monday and creates the board on demand.
 */
export function useMeetingBoard(weekStart: string) {
  return useQuery({
    queryKey: boardKey(weekStart),
    queryFn: () => http.get<MeetingBoardDetail>(`/meeting-boards?date=${weekStart}`),
  });
}

/**
 * Projects the signed-in user may file a card under. Rarely changes mid-meeting,
 * so it is cached for the session rather than refetched with every board poll.
 */
export function useMeetingProjectOptions() {
  return useQuery({
    queryKey: ['meeting-projects'],
    queryFn: () => http.get<MeetingProjectOption[]>('/meeting-boards/projects'),
    staleTime: 5 * 60 * 1000,
  });
}

export function useMeetingWeeks(limit = 12) {
  return useQuery({
    queryKey: ['meeting-weeks', limit],
    queryFn: () => http.get<MeetingWeekSummary[]>(`/meeting-boards/weeks?limit=${limit}`),
  });
}

export function useUpdateMeetingBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ boardId, patch }: { boardId: string; patch: UpdateMeetingBoardInput }) =>
      http.patch<MeetingBoardDetail>(`/meeting-boards/${boardId}`, patch),
    onSuccess: () => invalidateBoards(qc),
  });
}

/* ── cards ── */

export function useCreateBoardItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ boardId, input }: { boardId: string; input: CreateBoardItemInput }) =>
      http.post<BoardItem>(`/meeting-boards/${boardId}/items`, input),
    onSuccess: () => invalidateBoards(qc),
  });
}

export function useUpdateBoardItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, patch }: { itemId: string; patch: UpdateBoardItemInput }) =>
      http.patch<BoardItem>(`/meeting-boards/items/${itemId}`, patch),
    onSuccess: () => invalidateBoards(qc),
  });
}

export function useDeleteBoardItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => http.del<{ id: string }>(`/meeting-boards/items/${itemId}`),
    onSuccess: () => invalidateBoards(qc),
  });
}

/**
 * Commits a drag-and-drop. The board is patched optimistically first so the card
 * doesn't visibly snap back to its old cell while the request is in flight.
 */
export function useReorderBoardItems(weekStart: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ boardId, input }: { boardId: string; input: ReorderBoardItemsInput }) =>
      http.post<MeetingBoardDetail>(`/meeting-boards/${boardId}/reorder`, input),
    onMutate: async ({ input }) => {
      await qc.cancelQueries({ queryKey: boardKey(weekStart) });
      const previous = qc.getQueryData<MeetingBoardDetail>(boardKey(weekStart));
      if (previous) {
        const moves = new Map(input.items.map((m) => [m.id, m]));
        qc.setQueryData<MeetingBoardDetail>(boardKey(weekStart), {
          ...previous,
          items: previous.items.map((it) => {
            const m = moves.get(it.id);
            return m ? { ...it, dayDate: m.dayDate, slot: m.slot, position: m.position } : it;
          }),
        });
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(boardKey(weekStart), ctx.previous);
    },
    onSettled: () => invalidateBoards(qc),
  });
}

/* ── mood ── */

export function useSetMood() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ boardId, input }: { boardId: string; input: SetMoodInput }) =>
      http.put<BoardMood>(`/meeting-boards/${boardId}/mood`, input),
    onSuccess: () => invalidateBoards(qc),
  });
}

/* ── notes & comments ── */

/** Comments on one card. Board-level notes arrive with the board payload. */
export function useItemNotes(itemId: string | null) {
  return useQuery({
    queryKey: ['meeting-item-notes', itemId],
    queryFn: () => http.get<BoardNote[]>(`/meeting-boards/items/${itemId}/notes`),
    enabled: Boolean(itemId),
  });
}

export function useCreateBoardNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ boardId, input }: { boardId: string; input: CreateBoardNoteInput }) =>
      http.post<BoardNote>(`/meeting-boards/${boardId}/notes`, input),
    onSuccess: (note) => {
      invalidateBoards(qc);
      if (note.itemId) void qc.invalidateQueries({ queryKey: ['meeting-item-notes', note.itemId] });
    },
  });
}

export function useUpdateBoardNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ noteId, patch }: { noteId: string; patch: UpdateBoardNoteInput }) =>
      http.patch<BoardNote>(`/meeting-boards/notes/${noteId}`, patch),
    onSuccess: (note) => {
      invalidateBoards(qc);
      if (note.itemId) void qc.invalidateQueries({ queryKey: ['meeting-item-notes', note.itemId] });
    },
  });
}

export function useDeleteBoardNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ noteId }: { noteId: string; itemId?: string | null }) =>
      http.del<{ id: string }>(`/meeting-boards/notes/${noteId}`),
    onSuccess: (_res, vars) => {
      invalidateBoards(qc);
      if (vars.itemId) void qc.invalidateQueries({ queryKey: ['meeting-item-notes', vars.itemId] });
    },
  });
}
