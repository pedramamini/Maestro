import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs/promises';

// Mock fs/promises - use named exports and default export pattern
vi.mock('fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  default: {
    writeFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock logger to avoid console output during tests
vi.mock('../../../main/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  generateFlow,
  generateFlowFile,
  generateFlowFromStrings,
  parseActionString,
  tap,
  inputText,
  scroll,
  screenshotStep,
  assertVisible,
  assertNotVisible,
  waitForStep,
  swipe,
  launchAppStep,
  stopApp,
  openLink,
  pressKey,
  hideKeyboard,
  eraseText,
  wait,
  copyTextFrom,
  FlowStep,
  FlowConfig,
} from '../../../main/ios-tools/flow-generator';

describe('flow-generator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('helper functions', () => {
    it('tap() creates a tap step', () => {
      const step = tap({ text: 'Login' });
      expect(step).toEqual({ action: 'tap', text: 'Login' });
    });

    it('tap() with id creates a tap step', () => {
      const step = tap({ id: 'login-button' });
      expect(step).toEqual({ action: 'tap', id: 'login-button' });
    });

    it('tap() with point creates a tap step', () => {
      const step = tap({ point: { x: 100, y: 200 } });
      expect(step).toEqual({ action: 'tap', point: { x: 100, y: 200 } });
    });

    it('inputText() creates an input step', () => {
      const step = inputText('hello@example.com');
      expect(step).toEqual({ action: 'inputText', text: 'hello@example.com' });
    });

    it('inputText() with options creates an input step', () => {
      const step = inputText('password', { clearBefore: true, id: 'password-field' });
      expect(step).toEqual({
        action: 'inputText',
        text: 'password',
        clearBefore: true,
        id: 'password-field',
      });
    });

    it('scroll() creates a scroll step', () => {
      const step = scroll('down');
      expect(step).toEqual({ action: 'scroll', direction: 'down' });
    });

    it('scroll() with untilVisible creates a scroll step', () => {
      const step = scroll('down', { untilVisible: 'Submit' });
      expect(step).toEqual({ action: 'scroll', direction: 'down', untilVisible: 'Submit' });
    });

    it('screenshotStep() creates a screenshot step', () => {
      const step = screenshotStep();
      expect(step).toEqual({ action: 'screenshot' });
    });

    it('screenshotStep() with filename creates a screenshot step', () => {
      const step = screenshotStep('login-screen');
      expect(step).toEqual({ action: 'screenshot', filename: 'login-screen' });
    });

    it('assertVisible() creates an assertion step', () => {
      const step = assertVisible({ text: 'Welcome' });
      expect(step).toEqual({ action: 'assertVisible', text: 'Welcome' });
    });

    it('assertNotVisible() creates an assertion step', () => {
      const step = assertNotVisible({ text: 'Error' });
      expect(step).toEqual({ action: 'assertNotVisible', text: 'Error' });
    });

    it('waitForStep() creates a wait step', () => {
      const step = waitForStep({ text: 'Loading complete', timeout: 5000 });
      expect(step).toEqual({ action: 'waitFor', text: 'Loading complete', timeout: 5000 });
    });

    it('swipe() creates a swipe step', () => {
      const step = swipe({ x: 100, y: 500 }, { x: 100, y: 100 });
      expect(step).toEqual({
        action: 'swipe',
        start: { x: 100, y: 500 },
        end: { x: 100, y: 100 },
      });
    });

    it('launchAppStep() creates a launch step', () => {
      const step = launchAppStep();
      expect(step).toEqual({ action: 'launchApp' });
    });

    it('launchAppStep() with options creates a launch step', () => {
      const step = launchAppStep({ bundleId: 'com.example.app', clearState: true });
      expect(step).toEqual({
        action: 'launchApp',
        bundleId: 'com.example.app',
        clearState: true,
      });
    });

    it('stopApp() creates a stop step', () => {
      const step = stopApp('com.example.app');
      expect(step).toEqual({ action: 'stopApp', bundleId: 'com.example.app' });
    });

    it('openLink() creates an open link step', () => {
      const step = openLink('https://example.com');
      expect(step).toEqual({ action: 'openLink', url: 'https://example.com' });
    });

    it('pressKey() creates a press key step', () => {
      const step = pressKey('enter');
      expect(step).toEqual({ action: 'pressKey', key: 'enter' });
    });

    it('hideKeyboard() creates a hide keyboard step', () => {
      const step = hideKeyboard();
      expect(step).toEqual({ action: 'hideKeyboard' });
    });

    it('eraseText() creates an erase step', () => {
      const step = eraseText(5);
      expect(step).toEqual({ action: 'eraseText', characters: 5 });
    });

    it('wait() creates a wait step', () => {
      const step = wait(1000);
      expect(step).toEqual({ action: 'wait', duration: 1000 });
    });

    it('copyTextFrom() creates a copy step', () => {
      const step = copyTextFrom({ id: 'result-field' });
      expect(step).toEqual({ action: 'copyTextFrom', id: 'result-field' });
    });
  });

  describe('generateFlow', () => {
    it('returns error for empty steps', () => {
      const result = generateFlow([]);
      expect(result.success).toBe(false);
      expect(result.error).toContain('No steps provided');
    });

    it('generates YAML for simple tap step', () => {
      const steps: FlowStep[] = [tap({ text: 'Login' })];
      const result = generateFlow(steps);

      expect(result.success).toBe(true);
      expect(result.data?.yaml).toContain('- tapOn: "Login"');
      expect(result.data?.stepCount).toBe(1);
    });

    it('generates YAML for tap by id', () => {
      const steps: FlowStep[] = [tap({ id: 'submit-button' })];
      const result = generateFlow(steps);

      expect(result.success).toBe(true);
      expect(result.data?.yaml).toContain('- tapOn:');
      expect(result.data?.yaml).toContain('id: "submit-button"');
    });

    it('generates YAML for tap by point', () => {
      const steps: FlowStep[] = [tap({ point: { x: 100, y: 200 } })];
      const result = generateFlow(steps);

      expect(result.success).toBe(true);
      expect(result.data?.yaml).toContain('point: "100,200"');
    });

    it('generates YAML for tap with index', () => {
      const steps: FlowStep[] = [tap({ text: 'Item', index: 2 })];
      const result = generateFlow(steps);

      expect(result.success).toBe(true);
      expect(result.data?.yaml).toContain('text: "Item"');
      expect(result.data?.yaml).toContain('index: 2');
    });

    it('generates YAML for inputText step', () => {
      const steps: FlowStep[] = [inputText('hello@example.com')];
      const result = generateFlow(steps);

      expect(result.success).toBe(true);
      expect(result.data?.yaml).toContain('- inputText: "hello@example.com"');
    });

    it('generates YAML for inputText with clear', () => {
      const steps: FlowStep[] = [inputText('new text', { clearBefore: true })];
      const result = generateFlow(steps);

      expect(result.success).toBe(true);
      expect(result.data?.yaml).toContain('- eraseText');
      expect(result.data?.yaml).toContain('- inputText: "new text"');
    });

    it('generates YAML for inputText with target id', () => {
      const steps: FlowStep[] = [inputText('text', { id: 'email-field' })];
      const result = generateFlow(steps);

      expect(result.success).toBe(true);
      expect(result.data?.yaml).toContain('id: "email-field"');
      expect(result.data?.yaml).toContain('- inputText: "text"');
    });

    it('generates YAML for scroll step', () => {
      const steps: FlowStep[] = [scroll('down')];
      const result = generateFlow(steps);

      expect(result.success).toBe(true);
      expect(result.data?.yaml).toContain('- scroll:');
      expect(result.data?.yaml).toContain('direction: DOWN');
    });

    it('generates YAML for scroll until visible', () => {
      const steps: FlowStep[] = [scroll('down', { untilVisible: 'Submit' })];
      const result = generateFlow(steps);

      expect(result.success).toBe(true);
      expect(result.data?.yaml).toContain('- scrollUntilVisible:');
      expect(result.data?.yaml).toContain('text: "Submit"');
    });

    it('generates YAML for screenshot step', () => {
      const steps: FlowStep[] = [screenshotStep()];
      const result = generateFlow(steps);

      expect(result.success).toBe(true);
      expect(result.data?.yaml).toContain('- takeScreenshot');
    });

    it('generates YAML for screenshot with filename', () => {
      const steps: FlowStep[] = [screenshotStep('login-screen')];
      const result = generateFlow(steps);

      expect(result.success).toBe(true);
      expect(result.data?.yaml).toContain('- takeScreenshot: "login-screen"');
    });

    it('generates YAML for assertVisible step', () => {
      const steps: FlowStep[] = [assertVisible({ text: 'Welcome' })];
      const result = generateFlow(steps);

      expect(result.success).toBe(true);
      expect(result.data?.yaml).toContain('- assertVisible: "Welcome"');
    });

    it('generates YAML for assertVisible with id', () => {
      const steps: FlowStep[] = [assertVisible({ id: 'success-label' })];
      const result = generateFlow(steps);

      expect(result.success).toBe(true);
      expect(result.data?.yaml).toContain('- assertVisible:');
      expect(result.data?.yaml).toContain('id: "success-label"');
    });

    it('generates YAML for assertNotVisible step', () => {
      const steps: FlowStep[] = [assertNotVisible({ text: 'Error' })];
      const result = generateFlow(steps);

      expect(result.success).toBe(true);
      expect(result.data?.yaml).toContain('- assertNotVisible: "Error"');
    });

    it('generates YAML for swipe step', () => {
      const steps: FlowStep[] = [swipe({ x: 200, y: 500 }, { x: 200, y: 100 })];
      const result = generateFlow(steps);

      expect(result.success).toBe(true);
      expect(result.data?.yaml).toContain('- swipe:');
      expect(result.data?.yaml).toContain('start: "200, 500"');
      expect(result.data?.yaml).toContain('end: "200, 100"');
    });

    it('generates YAML for launchApp step', () => {
      const steps: FlowStep[] = [launchAppStep()];
      const result = generateFlow(steps);

      expect(result.success).toBe(true);
      expect(result.data?.yaml).toContain('- launchApp');
    });

    it('generates YAML for launchApp with options', () => {
      const steps: FlowStep[] = [launchAppStep({ bundleId: 'com.example.app', clearState: true })];
      const result = generateFlow(steps);

      expect(result.success).toBe(true);
      expect(result.data?.yaml).toContain('- launchApp:');
      expect(result.data?.yaml).toContain('appId: "com.example.app"');
      expect(result.data?.yaml).toContain('clearState: true');
    });

    it('generates YAML for stopApp step', () => {
      const steps: FlowStep[] = [stopApp('com.example.app')];
      const result = generateFlow(steps);

      expect(result.success).toBe(true);
      expect(result.data?.yaml).toContain('- stopApp: "com.example.app"');
    });

    it('generates YAML for openLink step', () => {
      const steps: FlowStep[] = [openLink('https://example.com/page')];
      const result = generateFlow(steps);

      expect(result.success).toBe(true);
      expect(result.data?.yaml).toContain('- openLink: "https://example.com/page"');
    });

    it('generates YAML for pressKey step', () => {
      const steps: FlowStep[] = [pressKey('enter')];
      const result = generateFlow(steps);

      expect(result.success).toBe(true);
      expect(result.data?.yaml).toContain('- pressKey: enter');
    });

    it('generates YAML for hideKeyboard step', () => {
      const steps: FlowStep[] = [hideKeyboard()];
      const result = generateFlow(steps);

      expect(result.success).toBe(true);
      expect(result.data?.yaml).toContain('- hideKeyboard');
    });

    it('generates YAML for eraseText step', () => {
      const steps: FlowStep[] = [eraseText()];
      const result = generateFlow(steps);

      expect(result.success).toBe(true);
      expect(result.data?.yaml).toContain('- eraseText');
    });

    it('generates YAML for eraseText with count', () => {
      const steps: FlowStep[] = [eraseText(10)];
      const result = generateFlow(steps);

      expect(result.success).toBe(true);
      expect(result.data?.yaml).toContain('- eraseText: 10');
    });

    it('generates YAML for wait step', () => {
      const steps: FlowStep[] = [wait(2000)];
      const result = generateFlow(steps);

      expect(result.success).toBe(true);
      expect(result.data?.yaml).toContain('- wait: 2000');
    });

    it('includes step descriptions as comments', () => {
      const steps: FlowStep[] = [
        { action: 'tap', text: 'Login', description: 'Click the login button' },
      ];
      const result = generateFlow(steps);

      expect(result.success).toBe(true);
      expect(result.data?.yaml).toContain('# Click the login button');
    });

    it('generates flow with config', () => {
      const steps: FlowStep[] = [tap({ text: 'Start' })];
      const config: FlowConfig = {
        appId: 'com.example.app',
        name: 'Login Flow',
        tags: ['smoke', 'login'],
      };
      const result = generateFlow(steps, config);

      expect(result.success).toBe(true);
      expect(result.data?.yaml).toContain('appId: com.example.app');
      expect(result.data?.yaml).toContain('name: Login Flow');
      expect(result.data?.yaml).toContain('tags:');
      expect(result.data?.yaml).toContain('- smoke');
      expect(result.data?.yaml).toContain('- login');
    });

    it('generates flow with env variables', () => {
      const steps: FlowStep[] = [tap({ text: 'Login' })];
      const config: FlowConfig = {
        env: {
          USERNAME: 'test@example.com',
          PASSWORD: 'secret123',
        },
      };
      const result = generateFlow(steps, config);

      expect(result.success).toBe(true);
      expect(result.data?.yaml).toContain('env:');
      expect(result.data?.yaml).toContain('USERNAME: "test@example.com"');
      expect(result.data?.yaml).toContain('PASSWORD: "secret123"');
    });

    it('generates complex multi-step flow', () => {
      const steps: FlowStep[] = [
        launchAppStep({ clearState: true }),
        tap({ text: 'Sign In' }),
        inputText('user@example.com', { id: 'email-field' }),
        inputText('password123', { id: 'password-field' }),
        tap({ text: 'Submit' }),
        assertVisible({ text: 'Welcome' }),
        screenshotStep('success'),
      ];
      const result = generateFlow(steps);

      expect(result.success).toBe(true);
      expect(result.data?.stepCount).toBe(7);
      expect(result.data?.yaml).toContain('launchApp');
      expect(result.data?.yaml).toContain('tapOn');
      expect(result.data?.yaml).toContain('inputText');
      expect(result.data?.yaml).toContain('assertVisible');
      expect(result.data?.yaml).toContain('takeScreenshot');
    });

    it('escapes special characters in strings', () => {
      const steps: FlowStep[] = [tap({ text: 'Button "Click Me"' })];
      const result = generateFlow(steps);

      expect(result.success).toBe(true);
      expect(result.data?.yaml).toContain('\\"Click Me\\"');
    });

    it('handles newlines in text', () => {
      const steps: FlowStep[] = [assertVisible({ text: 'Line 1\nLine 2' })];
      const result = generateFlow(steps);

      expect(result.success).toBe(true);
      expect(result.data?.yaml).toContain('\\n');
    });
  });

  describe('generateFlowFile', () => {
    it('creates directory and writes file', async () => {
      const steps: FlowStep[] = [tap({ text: 'Login' })];
      const outputPath = '/test/flows/login.yaml';

      const result = await generateFlowFile(steps, outputPath);

      expect(result.success).toBe(true);
      expect(result.data?.path).toBe(outputPath);
      expect(vi.mocked(fs.mkdir)).toHaveBeenCalledWith('/test/flows', { recursive: true });
      expect(vi.mocked(fs.writeFile)).toHaveBeenCalled();
    });

    it('adds .yaml extension if missing', async () => {
      const steps: FlowStep[] = [tap({ text: 'Login' })];
      const outputPath = '/test/flows/login';

      const result = await generateFlowFile(steps, outputPath);

      expect(result.success).toBe(true);
      expect(result.data?.path).toBe('/test/flows/login.yaml');
    });

    it('keeps .yml extension', async () => {
      const steps: FlowStep[] = [tap({ text: 'Login' })];
      const outputPath = '/test/flows/login.yml';

      const result = await generateFlowFile(steps, outputPath);

      expect(result.success).toBe(true);
      expect(result.data?.path).toBe(outputPath);
    });

    it('returns error on file write failure', async () => {
      vi.mocked(fs.writeFile).mockRejectedValueOnce(new Error('Permission denied'));

      const steps: FlowStep[] = [tap({ text: 'Login' })];
      const result = await generateFlowFile(steps, '/test/flow.yaml');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission denied');
    });
  });

  describe('parseActionString', () => {
    it('parses simple tap action', () => {
      const step = parseActionString('tap:Login');
      expect(step).toEqual({ action: 'tap', text: 'Login' });
    });

    it('parses tapId action', () => {
      const step = parseActionString('tapId:submit-button');
      expect(step).toEqual({ action: 'tap', id: 'submit-button' });
    });

    it('parses type/input action', () => {
      expect(parseActionString('type:hello')).toEqual({ action: 'inputText', text: 'hello' });
      expect(parseActionString('input:hello')).toEqual({ action: 'inputText', text: 'hello' });
      expect(parseActionString('inputText:hello')).toEqual({ action: 'inputText', text: 'hello' });
    });

    it('parses scroll action', () => {
      expect(parseActionString('scroll:down')).toEqual({ action: 'scroll', direction: 'down' });
      expect(parseActionString('scroll:up')).toEqual({ action: 'scroll', direction: 'up' });
      expect(parseActionString('scroll:left')).toEqual({ action: 'scroll', direction: 'left' });
      expect(parseActionString('scroll:right')).toEqual({ action: 'scroll', direction: 'right' });
    });

    it('parses screenshot action', () => {
      expect(parseActionString('screenshot')).toEqual({ action: 'screenshot' });
      expect(parseActionString('screenshot:my-screen')).toEqual({
        action: 'screenshot',
        filename: 'my-screen',
      });
    });

    it('parses assertVisible action', () => {
      expect(parseActionString('assertVisible:Welcome')).toEqual({
        action: 'assertVisible',
        text: 'Welcome',
      });
      expect(parseActionString('visible:Welcome')).toEqual({
        action: 'assertVisible',
        text: 'Welcome',
      });
    });

    it('parses assertNotVisible action', () => {
      expect(parseActionString('assertNotVisible:Error')).toEqual({
        action: 'assertNotVisible',
        text: 'Error',
      });
      expect(parseActionString('notVisible:Error')).toEqual({
        action: 'assertNotVisible',
        text: 'Error',
      });
    });

    it('parses wait action with duration', () => {
      expect(parseActionString('wait:2000')).toEqual({ action: 'wait', duration: 2000 });
    });

    it('parses waitFor action with text', () => {
      expect(parseActionString('waitFor:Loading complete')).toEqual({
        action: 'waitFor',
        text: 'Loading complete',
      });
    });

    it('parses openLink action', () => {
      expect(parseActionString('openLink:https://example.com')).toEqual({
        action: 'openLink',
        url: 'https://example.com',
      });
      expect(parseActionString('open:myapp://page')).toEqual({
        action: 'openLink',
        url: 'myapp://page',
      });
    });

    it('parses pressKey action', () => {
      expect(parseActionString('pressKey:enter')).toEqual({ action: 'pressKey', key: 'enter' });
      expect(parseActionString('press:back')).toEqual({ action: 'pressKey', key: 'back' });
    });

    it('parses hideKeyboard action', () => {
      expect(parseActionString('hideKeyboard')).toEqual({ action: 'hideKeyboard' });
    });

    it('parses launchApp action', () => {
      expect(parseActionString('launchApp')).toEqual({ action: 'launchApp' });
      expect(parseActionString('launchApp:com.example.app')).toEqual({
        action: 'launchApp',
        bundleId: 'com.example.app',
      });
    });

    it('parses stopApp action', () => {
      expect(parseActionString('stopApp')).toEqual({ action: 'stopApp' });
      expect(parseActionString('stopApp:com.example.app')).toEqual({
        action: 'stopApp',
        bundleId: 'com.example.app',
      });
    });

    it('parses eraseText action', () => {
      expect(parseActionString('eraseText')).toEqual({ action: 'eraseText' });
    });

    it('returns null for invalid actions', () => {
      expect(parseActionString('invalid')).toBeNull();
      expect(parseActionString('scroll:diagonal')).toBeNull();
      expect(parseActionString('pressKey:invalid')).toBeNull();
    });

    it('is case insensitive for action names', () => {
      expect(parseActionString('TAP:Button')).toEqual({ action: 'tap', text: 'Button' });
      expect(parseActionString('SCROLL:DOWN')).toEqual({ action: 'scroll', direction: 'down' });
    });
  });

  describe('generateFlowFromStrings', () => {
    it('generates flow from action strings', () => {
      const actions = [
        'launchApp',
        'tap:Login',
        'type:user@example.com',
        'tap:Submit',
        'assertVisible:Welcome',
        'screenshot:success',
      ];

      const result = generateFlowFromStrings(actions);

      expect(result.success).toBe(true);
      expect(result.data?.stepCount).toBe(6);
      expect(result.data?.yaml).toContain('launchApp');
      expect(result.data?.yaml).toContain('tapOn: "Login"');
      expect(result.data?.yaml).toContain('inputText: "user@example.com"');
    });

    it('returns error for invalid actions', () => {
      const actions = ['tap:Login', 'invalid:action', 'screenshot'];

      const result = generateFlowFromStrings(actions);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid action at index 1');
    });

    it('includes config when provided', () => {
      const actions = ['tap:Login'];
      const config: FlowConfig = { appId: 'com.test.app' };

      const result = generateFlowFromStrings(actions, config);

      expect(result.success).toBe(true);
      expect(result.data?.yaml).toContain('appId: com.test.app');
    });
  });
});
