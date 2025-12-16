import React, { useRef } from 'react';
import type { Theme, Group } from '../types';
import { MODAL_PRIORITIES } from '../constants/modalPriorities';
import { Modal, ModalFooter, EmojiPickerField } from './ui';

interface RenameGroupModalProps {
  theme: Theme;
  groupId: string;
  groupName: string;
  setGroupName: (name: string) => void;
  groupEmoji: string;
  setGroupEmoji: (emoji: string) => void;
  onClose: () => void;
  groups: Group[];
  setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
}

export function RenameGroupModal(props: RenameGroupModalProps) {
  const {
    theme, groupId, groupName, setGroupName, groupEmoji, setGroupEmoji,
    onClose, groups, setGroups
  } = props;

  const inputRef = useRef<HTMLInputElement>(null);

  const handleRename = () => {
    if (groupName.trim() && groupId) {
      setGroups(prev => prev.map(g =>
        g.id === groupId ? { ...g, name: groupName.trim().toUpperCase(), emoji: groupEmoji } : g
      ));
      onClose();
    }
  };

  return (
    <Modal
      theme={theme}
      title="Rename Group"
      priority={MODAL_PRIORITIES.RENAME_GROUP}
      onClose={onClose}
      initialFocusRef={inputRef}
      footer={
        <ModalFooter
          theme={theme}
          onCancel={onClose}
          onConfirm={handleRename}
          confirmLabel="Rename"
          confirmDisabled={!groupName.trim()}
        />
      }
    >
      <div className="flex gap-4 items-end">
        {/* Emoji Selector - Left Side */}
        <EmojiPickerField
          theme={theme}
          value={groupEmoji}
          onChange={setGroupEmoji}
          restoreFocusRef={inputRef}
        />

        {/* Group Name Input - Right Side */}
        <div className="flex-1 flex flex-col gap-2">
          <label className="block text-xs font-bold opacity-70 uppercase" style={{ color: theme.colors.textMain }}>
            Group Name
          </label>
          <input
            ref={inputRef}
            type="text"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleRename();
              }
            }}
            placeholder="Enter group name..."
            className="w-full p-3 rounded border bg-transparent outline-none h-[52px]"
            style={{ borderColor: theme.colors.border, color: theme.colors.textMain }}
            autoFocus
          />
        </div>
      </div>
    </Modal>
  );
}
