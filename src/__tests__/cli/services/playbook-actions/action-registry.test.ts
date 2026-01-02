/**
 * Tests for Action Registry
 */

import {
  registerAction,
  getAction,
  hasAction,
  listActions,
  getAllActions,
  clearRegistry,
  defineAction,
} from '../../../../cli/services/playbook-actions/action-registry';
import type { ActionDefinition } from '../../../../cli/services/playbook-actions/types';

describe('Action Registry', () => {
  // Clear registry before each test
  beforeEach(() => {
    clearRegistry();
  });

  describe('registerAction', () => {
    it('should register an action', () => {
      const action: ActionDefinition = {
        name: 'test.action',
        description: 'A test action',
        inputs: {},
        handler: async () => ({ success: true, message: 'Done' }),
      };

      registerAction(action);

      expect(hasAction('test.action')).toBe(true);
    });

    it('should throw when registering duplicate action', () => {
      const action: ActionDefinition = {
        name: 'test.action',
        description: 'A test action',
        inputs: {},
        handler: async () => ({ success: true, message: 'Done' }),
      };

      registerAction(action);

      expect(() => registerAction(action)).toThrow(
        "Action 'test.action' is already registered"
      );
    });
  });

  describe('getAction', () => {
    it('should return registered action', () => {
      const action: ActionDefinition = {
        name: 'test.action',
        description: 'A test action',
        inputs: {},
        handler: async () => ({ success: true, message: 'Done' }),
      };

      registerAction(action);

      const retrieved = getAction('test.action');
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('test.action');
    });

    it('should return undefined for non-existent action', () => {
      const action = getAction('non.existent');
      expect(action).toBeUndefined();
    });
  });

  describe('hasAction', () => {
    it('should return true for registered action', () => {
      const action: ActionDefinition = {
        name: 'test.action',
        description: 'A test action',
        inputs: {},
        handler: async () => ({ success: true, message: 'Done' }),
      };

      registerAction(action);

      expect(hasAction('test.action')).toBe(true);
    });

    it('should return false for non-existent action', () => {
      expect(hasAction('non.existent')).toBe(false);
    });
  });

  describe('listActions', () => {
    it('should return empty array when no actions registered', () => {
      const actions = listActions();
      expect(actions).toEqual([]);
    });

    it('should return all registered action names', () => {
      registerAction({
        name: 'action.one',
        description: 'First action',
        inputs: {},
        handler: async () => ({ success: true, message: 'One' }),
      });

      registerAction({
        name: 'action.two',
        description: 'Second action',
        inputs: {},
        handler: async () => ({ success: true, message: 'Two' }),
      });

      const actions = listActions();
      expect(actions).toContain('action.one');
      expect(actions).toContain('action.two');
      expect(actions).toHaveLength(2);
    });
  });

  describe('getAllActions', () => {
    it('should return empty array when no actions registered', () => {
      const actions = getAllActions();
      expect(actions).toEqual([]);
    });

    it('should return all registered action definitions', () => {
      const action1: ActionDefinition = {
        name: 'action.one',
        description: 'First action',
        inputs: {},
        handler: async () => ({ success: true, message: 'One' }),
      };

      const action2: ActionDefinition = {
        name: 'action.two',
        description: 'Second action',
        inputs: {},
        handler: async () => ({ success: true, message: 'Two' }),
      };

      registerAction(action1);
      registerAction(action2);

      const actions = getAllActions();
      expect(actions).toHaveLength(2);
      expect(actions.map((a) => a.name)).toContain('action.one');
      expect(actions.map((a) => a.name)).toContain('action.two');
    });
  });

  describe('clearRegistry', () => {
    it('should remove all registered actions', () => {
      registerAction({
        name: 'action.one',
        description: 'First action',
        inputs: {},
        handler: async () => ({ success: true, message: 'One' }),
      });

      registerAction({
        name: 'action.two',
        description: 'Second action',
        inputs: {},
        handler: async () => ({ success: true, message: 'Two' }),
      });

      expect(listActions()).toHaveLength(2);

      clearRegistry();

      expect(listActions()).toHaveLength(0);
      expect(hasAction('action.one')).toBe(false);
      expect(hasAction('action.two')).toBe(false);
    });
  });

  describe('defineAction', () => {
    it('should return the same action definition', () => {
      interface TestInputs {
        name: string;
      }

      const action = defineAction<TestInputs>({
        name: 'test.action',
        description: 'A test action',
        inputs: {
          name: {
            type: 'string',
            required: true,
          },
        },
        handler: async (inputs) => ({
          success: true,
          message: `Hello ${inputs.name}`,
        }),
      });

      expect(action.name).toBe('test.action');
      expect(action.inputs.name.required).toBe(true);
    });
  });
});
