import { useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import {
  archiveThread,
  unarchiveThread,
} from '../../store/slices/conversationSlice';
import type { MenuItem } from '../../components/ChatMenuDropdown';

interface MenuDeps {
  threadId: string;
  address: string;
  contactName?: string;
  navigation: any;
  setSearchActive: (v: boolean) => void;
  onTrash: () => void;
  onBlock: () => void;
  onUnsubscribe: () => void;
  onAddPeople: () => void;
  onStarredMessages: () => void;
}

export function useChatMenuItems(deps: MenuDeps): MenuItem[] {
  const dispatch = useDispatch();
  const { archivedThreadIds } = useSelector(
    (state: RootState) => state.conversation,
  );

  const isArchived = archivedThreadIds.includes(deps.threadId);

  return useMemo(
    () => [
      { key: 'addPeople', label: 'Add People', onPress: deps.onAddPeople },
      {
        key: 'details',
        label: 'Details',
        onPress: () => deps.navigation.navigate('ContactDetails', {
          threadId: deps.threadId,
          address: deps.address,
          contactName: deps.contactName,
        }),
      },
      {
        key: 'starredMessages',
        label: 'Starred messages',
        onPress: deps.onStarredMessages,
      },
      { key: 'search', label: 'Search', onPress: () => deps.setSearchActive(true) },
      {
        key: 'archive',
        label: isArchived ? 'Unarchive' : 'Archive',
        onPress: () => {
          if (isArchived) dispatch(unarchiveThread(deps.threadId));
          else dispatch(archiveThread(deps.threadId));
        },
      },
      { key: 'trash', label: 'Trash', destructive: true, onPress: deps.onTrash },
      { key: 'unsubscribe', label: 'Unsubscribe', onPress: deps.onUnsubscribe },
      { key: 'block', label: 'Block & Report Spam', destructive: true, onPress: deps.onBlock },
    ],
    [isArchived, deps],
  );
}
