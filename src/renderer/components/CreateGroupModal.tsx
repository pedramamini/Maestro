import React, { useState, useRef } from 'react';
import type { Theme, Session, Group } from '../types';
import { MODAL_PRIORITIES } from '../constants/modalPriorities';
import { Modal, ModalFooter, EmojiPickerField } from './ui';

interface CreateGroupModalProps {
  theme: Theme;
  onClose: () => void;
  groups: Group[];
  setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
  sessions: Session[];
  setSessions: React.Dispatch<React.SetStateAction<Session[]>>;
  activeSessionId: string;
  moveSessionToNewGroup: boolean;
  setMoveSessionToNewGroup: (move: boolean) => void;
}

export function CreateGroupModal(props: CreateGroupModalProps) {
  const {
    theme, onClose, groups, setGroups, sessions, setSessions,
    activeSessionId, moveSessionToNewGroup, setMoveSessionToNewGroup
  } = props;

  const [groupName, setGroupName] = useState('');
  const [groupEmoji, setGroupEmoji] = useState('📂');

  const inputRef = useRef<HTMLInputElement>(null);

  const handleCreate = () => {
    if (groupName.trim()) {
      const newGroup: Group = {
        id: `group-${Date.now()}`,
        name: groupName.trim().toUpperCase(),
        emoji: groupEmoji,
        collapsed: false
      };
      setGroups([...groups, newGroup]);

      // If we should move the session to the new group
      if (moveSessionToNewGroup) {
        setSessions(prev => prev.map(s =>
          s.id === activeSessionId ? { ...s, groupId: newGroup.id } : s
        ));
      }

      setGroupName('');
      setGroupEmoji('📂');
      setMoveSessionToNewGroup(false);
      onClose();
    }
  };

  return (
    <Modal
      theme={theme}
      title="Create New Group"
      priority={MODAL_PRIORITIES.CREATE_GROUP}
      onClose={onClose}
      initialFocusRef={inputRef}
      footer={
        <ModalFooter
          theme={theme}
          onCancel={onClose}
          onConfirm={handleCreate}
          confirmLabel="Create"
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
                handleCreate();
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
