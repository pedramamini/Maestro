/**
 * Tests for terminal filter utilities
 * @file src/__tests__/main/utils/terminalFilter.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  stripControlSequences,
  isCommandEcho,
  extractCommand,
} from '../../../main/utils/terminalFilter';

describe('terminalFilter', () => {
  describe('stripControlSequences', () => {
    describe('OSC (Operating System Command) sequences', () => {
      it('should remove window title sequences (ESC ] ... BEL)', () => {
        const input = '\x1b]0;Terminal Title\x07Some content';
        const result = stripControlSequences(input);
        expect(result).toBe('Some content');
      });

      it('should remove window title sequences with ST terminator (ESC ] ... ESC \\)', () => {
        const input = '\x1b]0;Terminal Title\x1b\\Some content';
        const result = stripControlSequences(input);
        expect(result).toBe('Some content');
      });

      it('should remove hyperlink OSC sequences', () => {
        const input = '\x1b]8;;http://example.com\x07Click here\x1b]8;;\x07';
        const result = stripControlSequences(input);
        expect(result).toBe('Click here');
      });

      it('should remove numbered OSC sequences', () => {
        const input = '\x1b]1;icon-name\x07text\x1b]2;title\x07more';
        const result = stripControlSequences(input);
        expect(result).toBe('textmore');
      });
    });

    describe('CSI (Control Sequence Introducer) sequences', () => {
      it('should remove cursor up (A)', () => {
        const input = 'text\x1b[1Amore';
        const result = stripControlSequences(input);
        expect(result).toBe('textmore');
      });

      it('should remove cursor down (B)', () => {
        const input = 'text\x1b[1Bmore';
        const result = stripControlSequences(input);
        expect(result).toBe('textmore');
      });

      it('should remove cursor forward (C)', () => {
        const input = 'text\x1b[5Cmore';
        const result = stripControlSequences(input);
        expect(result).toBe('textmore');
      });

      it('should remove cursor back (D)', () => {
        const input = 'text\x1b[3Dmore';
        const result = stripControlSequences(input);
        expect(result).toBe('textmore');
      });

      it('should remove cursor position (H)', () => {
        const input = 'text\x1b[10;20Hmore';
        const result = stripControlSequences(input);
        expect(result).toBe('textmore');
      });

      it('should remove cursor position (f)', () => {
        const input = 'text\x1b[5;10fmore';
        const result = stripControlSequences(input);
        expect(result).toBe('textmore');
      });

      it('should remove erase in display (J)', () => {
        const input = 'text\x1b[2Jmore';
        const result = stripControlSequences(input);
        expect(result).toBe('textmore');
      });

      it('should remove erase in line (K)', () => {
        const input = 'text\x1b[0Kmore';
        const result = stripControlSequences(input);
        expect(result).toBe('textmore');
      });

      it('should remove scroll up (S)', () => {
        const input = 'text\x1b[3Smore';
        const result = stripControlSequences(input);
        expect(result).toBe('textmore');
      });

      it('should remove scroll down (T)', () => {
        const input = 'text\x1b[2Tmore';
        const result = stripControlSequences(input);
        expect(result).toBe('textmore');
      });

      it('should remove DECSET/DECRST sequences (h and l) without ?', () => {
        // The regex only matches CSI sequences without ? prefix
        // ?25h (show cursor) and ?25l (hide cursor) are not matched
        const input = '\x1b[25hvisible\x1b[25l';
        const result = stripControlSequences(input);
        expect(result).toBe('visible');
      });

      it('should preserve DECSET/DECRST private mode sequences with ?', () => {
        // The current implementation does NOT remove private mode sequences (with ?)
        // This is intentional to preserve certain terminal features
        const input = '\x1b[?25hvisible\x1b[?25l';
        const result = stripControlSequences(input);
        expect(result).toBe('\x1b[?25hvisible\x1b[?25l');
      });

      it('should remove soft cursor sequences (p)', () => {
        const input = 'text\x1b[0pmore';
        const result = stripControlSequences(input);
        expect(result).toBe('textmore');
      });

      it('should NOT remove SGR color codes (m)', () => {
        const input = '\x1b[32mGreen Text\x1b[0m';
        const result = stripControlSequences(input);
        expect(result).toBe('\x1b[32mGreen Text\x1b[0m');
      });

      it('should preserve complex SGR sequences', () => {
        const input = '\x1b[1;4;32mBold Underline Green\x1b[0m';
        const result = stripControlSequences(input);
        expect(result).toBe('\x1b[1;4;32mBold Underline Green\x1b[0m');
      });
    });

    describe('shell integration markers', () => {
      it('should remove VSCode shell integration (ESC ] 133 ; ...)', () => {
        const input = '\x1b]133;A\x07prompt\x1b]133;B\x07\x1b]133;C\x07output\x1b]133;D;0\x07';
        const result = stripControlSequences(input);
        expect(result).toBe('promptoutput');
      });

      it('should remove iTerm2 shell integration (ESC ] 1337 ; ...)', () => {
        const input = '\x1b]1337;SetUserVar=foo=bar\x07content';
        const result = stripControlSequences(input);
        expect(result).toBe('content');
      });

      it('should remove current working directory (ESC ] 7 ; ...)', () => {
        const input = '\x1b]7;file:///Users/test\x07pwd';
        const result = stripControlSequences(input);
        expect(result).toBe('pwd');
      });
    });

    describe('other escape sequences', () => {
      it('should remove soft hyphen', () => {
        const input = 'hyphen\u00ADated';
        const result = stripControlSequences(input);
        expect(result).toBe('hyphenated');
      });

      it('should convert CRLF to LF', () => {
        const input = 'line1\r\nline2\r\n';
        const result = stripControlSequences(input);
        expect(result).toBe('line1\nline2\n');
      });

      it('should remove character set sequences', () => {
        const input = '\x1b(B\x1b)0text';
        const result = stripControlSequences(input);
        expect(result).toBe('text');
      });

      it('should remove BEL character', () => {
        const input = 'alert\x07text';
        const result = stripControlSequences(input);
        expect(result).toBe('alerttext');
      });

      it('should remove control characters (0x00-0x1F except newline, tab, escape)', () => {
        const input = 'text\x00\x01\x02\x03more';
        const result = stripControlSequences(input);
        expect(result).toBe('textmore');
      });

      it('should preserve newlines', () => {
        const input = 'line1\nline2';
        const result = stripControlSequences(input);
        expect(result).toBe('line1\nline2');
      });

      it('should preserve tabs', () => {
        const input = 'col1\tcol2';
        const result = stripControlSequences(input);
        expect(result).toBe('col1\tcol2');
      });
    });

    describe('terminal mode filtering (isTerminal = true)', () => {
      describe('shell prompt patterns', () => {
        it('should remove [user:~/path] format prompts', () => {
          const input = '[pedram:~/Projects]\n[pedram:~/Projects]$ ls\nfile1.txt';
          const result = stripControlSequences(input, undefined, true);
          expect(result).toBe('file1.txt');
        });

        it('should remove user@host:~$ format prompts', () => {
          const input = 'pedram@macbook:~$\nsome output';
          const result = stripControlSequences(input, undefined, true);
          expect(result).toBe('some output');
        });

        it('should remove user@host:~# format prompts (root)', () => {
          const input = 'root@server:~#\nsome output';
          const result = stripControlSequences(input, undefined, true);
          expect(result).toBe('some output');
        });

        it('should remove user@host:~% format prompts (zsh)', () => {
          const input = 'user@host:~%\nsome output';
          const result = stripControlSequences(input, undefined, true);
          expect(result).toBe('some output');
        });

        it('should remove user@host:~> format prompts (PowerShell)', () => {
          const input = 'user@host:~>\nsome output';
          const result = stripControlSequences(input, undefined, true);
          expect(result).toBe('some output');
        });

        it('should remove ~/path $ format prompts', () => {
          const input = '~/Projects $\noutput';
          const result = stripControlSequences(input, undefined, true);
          expect(result).toBe('output');
        });

        it('should remove /absolute/path $ format prompts', () => {
          const input = '/home/user $\noutput';
          const result = stripControlSequences(input, undefined, true);
          expect(result).toBe('output');
        });

        it('should remove standalone git branch indicators', () => {
          const input = '(main)\n(master)\n(feature/test)\nactual output';
          const result = stripControlSequences(input, undefined, true);
          expect(result).toBe('actual output');
        });

        it('should remove standalone prompt characters', () => {
          const input = '$\n#\n%\n>\nactual output';
          const result = stripControlSequences(input, undefined, true);
          expect(result).toBe('actual output');
        });

        it('should remove [user:~/path] (branch) $ format prompts', () => {
          const input = '[pedram:~/Projects] (main) $\nactual output';
          const result = stripControlSequences(input, undefined, true);
          expect(result).toBe('actual output');
        });

        it('should handle prompts with dots and hyphens in names', () => {
          const input = 'user-name.test@host-name.local:~$\noutput';
          const result = stripControlSequences(input, undefined, true);
          expect(result).toBe('output');
        });
      });

      describe('command echo filtering', () => {
        it('should remove exact command echoes', () => {
          const input = 'ls -la\nfile1.txt\nfile2.txt';
          const result = stripControlSequences(input, 'ls -la', true);
          expect(result).toBe('file1.txt\nfile2.txt');
        });

        it('should not remove partial matches', () => {
          const input = 'ls -la something\nfile1.txt';
          const result = stripControlSequences(input, 'ls -la', true);
          expect(result).toBe('ls -la something\nfile1.txt');
        });

        it('should handle command echo with leading whitespace', () => {
          const input = '  ls  \nfile1.txt';
          const result = stripControlSequences(input, 'ls', true);
          expect(result).toBe('file1.txt');
        });
      });

      describe('git branch cleanup', () => {
        it('should remove git branch indicators from content lines', () => {
          const input = 'output (main) text';
          const result = stripControlSequences(input, undefined, true);
          expect(result).toBe('output text');
        });

        it('should remove trailing prompt characters from content', () => {
          // The regex removes trailing $ but keeps preceding space
          // The line is 'some text $' -> regex replaces '$ ' with '' -> 'some text '
          // (trailing space remains because cleanedLine.trim() is only checked for empty)
          const input = 'some text $\nmore text';
          const result = stripControlSequences(input, undefined, true);
          expect(result).toBe('some text \nmore text');
        });
      });

      describe('empty line handling', () => {
        it('should skip empty lines', () => {
          const input = '\n\n\nactual output\n\n';
          const result = stripControlSequences(input, undefined, true);
          expect(result).toBe('actual output');
        });

        it('should skip lines that become empty after cleaning', () => {
          const input = ' (main) $\nactual output';
          const result = stripControlSequences(input, undefined, true);
          expect(result).toBe('actual output');
        });
      });
    });

    describe('non-terminal mode (isTerminal = false, default)', () => {
      it('should not filter prompts when isTerminal is false', () => {
        const input = 'user@host:~$ ls\nfile1.txt';
        const result = stripControlSequences(input, 'ls', false);
        expect(result).toBe('user@host:~$ ls\nfile1.txt');
      });

      it('should not filter prompts when isTerminal is not provided', () => {
        const input = 'user@host:~$ ls\nfile1.txt';
        const result = stripControlSequences(input);
        expect(result).toBe('user@host:~$ ls\nfile1.txt');
      });
    });

    describe('complex scenarios', () => {
      it('should handle mixed control sequences and content', () => {
        const input =
          '\x1b]0;Title\x07\x1b[2J\x1b[H\x1b[32mGreen text\x1b[0m\x07more content';
        const result = stripControlSequences(input);
        expect(result).toBe('\x1b[32mGreen text\x1b[0mmore content');
      });

      it('should handle multiple shell integration markers', () => {
        const input =
          '\x1b]133;A\x07\x1b]7;file:///path\x07prompt\x1b]133;B\x07\x1b]1337;Foo=bar\x07output';
        const result = stripControlSequences(input);
        expect(result).toBe('promptoutput');
      });

      it('should handle empty input', () => {
        const result = stripControlSequences('');
        expect(result).toBe('');
      });

      it('should handle input with only control sequences', () => {
        const input = '\x1b[2J\x1b[H\x1b]0;Title\x07';
        const result = stripControlSequences(input);
        expect(result).toBe('');
      });
    });
  });

  describe('isCommandEcho', () => {
    it('should return false when lastCommand is not provided', () => {
      expect(isCommandEcho('ls')).toBe(false);
    });

    it('should return false when lastCommand is empty', () => {
      expect(isCommandEcho('ls', '')).toBe(false);
    });

    it('should return true for exact match', () => {
      expect(isCommandEcho('ls -la', 'ls -la')).toBe(true);
    });

    it('should return true for match with leading whitespace in line', () => {
      expect(isCommandEcho('  ls -la  ', 'ls -la')).toBe(true);
    });

    it('should return true for match with leading whitespace in command', () => {
      expect(isCommandEcho('ls -la', '  ls -la  ')).toBe(true);
    });

    it('should return true when line ends with the command', () => {
      expect(isCommandEcho('$ ls -la', 'ls -la')).toBe(true);
    });

    it('should return true when line has prompt prefix and ends with command', () => {
      expect(isCommandEcho('[user:~/path]$ ls -la', 'ls -la')).toBe(true);
    });

    it('should return false for partial match that does not end with command', () => {
      expect(isCommandEcho('ls -la --all', 'ls -la')).toBe(false);
    });

    it('should return false for completely different line', () => {
      expect(isCommandEcho('file1.txt', 'ls -la')).toBe(false);
    });

    it('should handle multi-word commands', () => {
      expect(isCommandEcho('git commit -m "message"', 'git commit -m "message"')).toBe(true);
    });

    it('should handle commands with special characters', () => {
      expect(isCommandEcho('echo "hello world"', 'echo "hello world"')).toBe(true);
    });
  });

  describe('extractCommand', () => {
    it('should return trimmed input when no prompt present', () => {
      expect(extractCommand('ls -la')).toBe('ls -la');
    });

    it('should remove $ prompt prefix', () => {
      expect(extractCommand('$ ls -la')).toBe('ls -la');
    });

    it('should remove # prompt prefix', () => {
      expect(extractCommand('# ls -la')).toBe('ls -la');
    });

    it('should remove % prompt prefix', () => {
      expect(extractCommand('% ls -la')).toBe('ls -la');
    });

    it('should remove > prompt prefix', () => {
      expect(extractCommand('> ls -la')).toBe('ls -la');
    });

    it('should remove user@host:~$ prompt prefix', () => {
      expect(extractCommand('user@host:~$ ls -la')).toBe('ls -la');
    });

    it('should remove [user:~/path]$ prompt prefix', () => {
      expect(extractCommand('[pedram:~/Projects]$ npm install')).toBe('npm install');
    });

    it('should handle extra whitespace after prompt', () => {
      expect(extractCommand('$   ls -la')).toBe('ls -la');
    });

    it('should handle complex prompt patterns', () => {
      expect(extractCommand('user@host:/var/log# tail -f syslog')).toBe('tail -f syslog');
    });

    it('should return empty string for empty input', () => {
      expect(extractCommand('')).toBe('');
    });

    it('should return empty string for just prompt', () => {
      expect(extractCommand('$  ')).toBe('');
    });

    it('should handle multiple prompt characters (takes first)', () => {
      expect(extractCommand('$ echo "$ hello"')).toBe('echo "$ hello"');
    });
  });
});
